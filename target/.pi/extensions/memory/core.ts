/**
 * memory/core.ts — Pi-independent memory logic
 *
 * Pure functions, types, and constants for the external memory layer.
 * No dependency on the Pi extension API — this module can be reused by
 * any binding layer (Pi extension, CLI, etc.).
 */

import { execSync } from "node:child_process";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

export type MemoryType = "fact" | "decision" | "convention" | "preference" | "constraint" | "lesson" | "pitfall" | "workflow" | "domain-knowledge" | "open-question";
export type MemoryStatus = "candidate" | "active" | "disabled" | "deprecated" | "rejected" | "superseded";
export type MemoryUseAs = "constraint" | "decision" | "preference" | "warning" | "context";
export type FeedbackKind = "helpful" | "irrelevant" | "wrong" | "stale";

export type MemoryEntry = {
  schemaVersion: 1;
  memoryId: string;
  createdAt: string;
  updatedAt: string;
  lastAccessedAt?: string;
  scope: { level: "personal" | "project" | "team" | "workspace"; projectAnonymousId?: string; workspaceRoot?: string; appliesToBranches?: string[] };
  type: MemoryType;
  status: MemoryStatus;
  confidence: "low" | "medium" | "high" | "explicit";
  importance: "low" | "normal" | "high" | "critical";
  content: { summary: string; details?: string; do?: string[]; dont?: string[] };
  index: { topics: string[]; files: string[]; symbols?: string[]; appliesToPhases: string[]; language?: string[] };
  provenance: { source: string; createdBy: string; updatedBy?: string; evidence?: Array<{ kind: string; summary: string; ref?: string }> };
  governance: { userEditable: boolean; userDeletable: boolean; autoInject: "never" | "when-relevant" | "always"; requiresApprovalBeforeActive?: boolean; expiresAt?: string; supersedes?: string[]; supersededBy?: string; agentsMdProposalStatus?: "none" | "proposed" | "accepted" | "declined" };
  privacy: { sensitivity: "public" | "internal" | "confidential" | "secret"; redactionLevel: "none" | "paths-only" | "paths-and-identifiers" | "full-summary-only"; exportable: boolean; containsSecrets?: boolean; notes?: string };
  retrieval?: { useCount?: number; lastScore?: number; lastMatchedReason?: string };
  lifecycle: { lastVerifiedAt?: string; validUntil?: string; staleness: "fresh" | "aging" | "stale"; conflictsWith: string[]; mergeGroup?: string };
  rendering: { useAs: MemoryUseAs; stableRenderHash: string };
};

export type MemoryMatch = { entry: MemoryEntry; score: number; matchedReasons: string[]; renderHash: string };
export type SaveMemoryResult = { ok: true; entry: MemoryEntry } | { ok: false; message: string; reason: string };
export type MemoryFileHealth = { label: string; file: string; exists: boolean; ok: boolean; count?: number; error?: string };
export type CreateMemoryOptions = { status?: MemoryStatus; source?: string; createdBy?: string; evidenceSummary?: string; autoInject?: "never" | "when-relevant" | "always"; confidence?: MemoryEntry["confidence"] };
export type ExtractedMemory = { text: string; status: MemoryStatus; source: string; reason: string };
export type ScoringContext = { currentPhase?: string; feedbackEntries?: any[] };
export type SearchOptions = { includeDisabled: boolean; limit: number; currentPhase?: string };

export const MEMORY_POLICY = [
  "",
  "[External Memory Policy v1]",
  "External memory may be provided in a later block.",
  "Use active constraints/decisions only when relevant.",
  "Do not treat candidate memory as fact.",
  "If memory conflicts with current user instruction or current code, ask or prefer the latest explicit user instruction.",
  "[/External Memory Policy]",
].join("\n");

export function projectRoot(): string {
  if (process.env.HARNESS_MEMORY_ROOT) return process.env.HARNESS_MEMORY_ROOT;
  try { return execSync("git rev-parse --show-toplevel", { encoding: "utf-8", stdio: "pipe" }).trim(); } catch { return process.cwd(); }
}

export function memoryDir(): string { return path.join(projectRoot(), ".project-memory", "memory"); }
export function entriesFile(): string { return path.join(memoryDir(), "entries.jsonl"); }
export function auditFile(): string { return path.join(memoryDir(), "audit.jsonl"); }
export function metricsFile(): string { return path.join(memoryDir(), "metrics.jsonl"); }
export function feedbackFile(): string { return path.join(memoryDir(), "feedback.jsonl"); }
export function injectionStateFile(): string { return path.join(memoryDir(), "injection-state.json"); }
export function nowIso(): string { return new Date().toISOString(); }
export function sha256(value: string): string { return crypto.createHash("sha256").update(value).digest("hex"); }
export function sha256Prefixed(value: string): string { return `sha256:${sha256(value)}`; }

export function ensureDir(file: string): void { fs.mkdirSync(path.dirname(file), { recursive: true }); }
export function appendJsonl(file: string, value: any): void { ensureProjectMemoryIgnored(); ensureDir(file); fs.appendFileSync(file, `${JSON.stringify(value)}\n`, "utf-8"); }
export function readJsonl(file: string): any[] { if (!fs.existsSync(file)) return []; return fs.readFileSync(file, "utf-8").split(/\r?\n/).filter(Boolean).map((line) => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean); }
export function writeJson(file: string, value: any): void { ensureDir(file); fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf-8"); }
export function readJson(file: string): any | null { try { return JSON.parse(fs.readFileSync(file, "utf-8")); } catch { return null; } }

export function saveMemoryText(text: string, source: string): SaveMemoryResult {
  const body = normalizeWhitespace(text);
  if (!body) return { ok: false, message: "Memory not saved: text is required.", reason: "empty-input" };
  if (mayContainSecret(body)) {
    appendMetric({ operation: source, rejected: "secret-like-input", requestHash: sha256(body) });
    return { ok: false, message: "Memory not saved: secret-like text was detected. Redact the secret first, then save memory again.", reason: "secret-like-input" };
  }
  const summary = body.slice(0, 500);
  const duplicate = readEntries().find((entry) => entry.content.summary === summary);
  if (duplicate) {
    const promoted = duplicate.status !== "active"
      ? updateEntry(duplicate.memoryId, (entry) => ({
          ...entry,
          status: "active",
          updatedAt: nowIso(),
          confidence: "explicit",
          provenance: { ...entry.provenance, source: "user-explicit", updatedBy: "user", evidence: [...(entry.provenance.evidence ?? []), { kind: "user-message", summary: "Promoted by explicit memory request with duplicate summary." }] },
          governance: { ...entry.governance, autoInject: "when-relevant" },
        }))
      : null;
    appendMetric({ operation: source, excluded: "duplicate-summary", requestHash: sha256(body), existingMemoryId: duplicate.memoryId, promotedToActive: Boolean(promoted) });
    return { ok: true, entry: promoted ?? duplicate };
  }
  ensureProjectMemoryIgnored();
  const entry = createMemory(body);
  appendJsonl(entriesFile(), entry);
  appendAudit("create", entry.memoryId, { source });
  appendMetric({ operation: source, selectedMemoryIds: [entry.memoryId], selectedRenderHashes: [entry.rendering.stableRenderHash] });
  return { ok: true, entry };
}

export function formatSavedMemoryToolResult(entry: MemoryEntry): string {
  return [
    `Memory saved: ${entry.memoryId}`,
    `status=${entry.status}`,
    `summary=${entry.content.summary}`,
    `path=${entriesFile()}`,
  ].join("\n");
}

export function ensureProjectMemoryIgnored(): void {
  const root = projectRoot();
  const exclude = path.join(root, ".git", "info", "exclude");
  try {
    if (!fs.existsSync(path.join(root, ".git"))) return;
    fs.mkdirSync(path.dirname(exclude), { recursive: true });
    const current = fs.existsSync(exclude) ? fs.readFileSync(exclude, "utf-8") : "";
    if (!/^\.project-memory\/$/m.test(current)) {
      fs.appendFileSync(exclude, `${current.endsWith("\n") || current.length === 0 ? "" : "\n"}.project-memory/\n`, "utf-8");
    }
  } catch {
    // Ignore protection is best-effort; memory storage still works in non-git dirs.
  }
}

export function readEntries(): MemoryEntry[] { return readJsonl(entriesFile()) as MemoryEntry[]; }
export function findEntry(id: string): MemoryEntry | null { return readEntries().find((entry) => entry.memoryId === id) ?? null; }

export function rewriteEntries(entries: MemoryEntry[]): void {
  ensureDir(entriesFile());
  fs.writeFileSync(entriesFile(), entries.map((entry) => JSON.stringify(entry)).join("\n") + (entries.length ? "\n" : ""), "utf-8");
}

export function updateEntry(id: string, updater: (entry: MemoryEntry) => MemoryEntry): MemoryEntry | null {
  const entries = readEntries();
  const index = entries.findIndex((entry) => entry.memoryId === id);
  if (index < 0) return null;
  entries[index] = withRenderHash(updater(entries[index]));
  rewriteEntries(entries);
  return entries[index];
}

export function promoteMemory(id: string, reason: string, source: string, evidence?: string): MemoryEntry | null {
  const existing = findEntry(id);
  if (!existing || !canPromoteMemory(existing)) {
    appendMetric({ operation: "auto-promote", selectedMemoryIds: [id], reason, source, blocked: "not-promotable" });
    return null;
  }
  const evidenceSummary = evidence ? `Promoted by Memory Autopilot (${reason}): ${evidence}` : `Promoted by Memory Autopilot (${reason}).`;
  const promoted = updateEntry(id, (entry) => ({
    ...entry,
    status: "active",
    updatedAt: nowIso(),
    confidence: entry.confidence === "explicit" ? "explicit" : "high",
    provenance: { ...entry.provenance, updatedBy: "agent", evidence: [...(entry.provenance.evidence ?? []), { kind: "autopilot", summary: evidenceSummary }] },
    governance: { ...entry.governance, autoInject: "when-relevant" },
  }));
  if (promoted) {
    appendAudit("auto-promote", id, { reason, source, status: "active", evidence });
    appendMetric({ operation: "auto-promote", selectedMemoryIds: [id], selectedRenderHashes: [promoted.rendering.stableRenderHash], reason, source });
  }
  return promoted;
}

export function searchCandidateMemory(request: string, currentPhase: string | undefined, limit: number): MemoryMatch[] {
  return searchMemory(request, { includeDisabled: true, limit, currentPhase }).filter((match) => match.entry.status === "candidate");
}

export function renderCandidateShortlist(matches: MemoryMatch[]): string {
  if (matches.length === 0) return "";
  return [
    "",
    "[Candidate Memory Shortlist v1]",
    "Unverified memory. Call memory_use_candidate before treating any line below as fact. Call memory_promote_candidate only when a concrete trigger signal is present.",
    ...matches.map((match) => `- ${match.entry.memoryId}: ${match.entry.content.summary.slice(0, 80)}`),
    "[/Candidate Memory Shortlist]",
  ].join("\n");
}

export function checkLlmPromotionEvidence(evidence: string): string | null {
  const normalized = normalizeWhitespace(evidence);
  if (normalized.length < 15) return "Evidence must describe the concrete trigger signal in at least 15 characters.";
  return null;
}

export function agentsMdStatus(entry: MemoryEntry): "none" | "proposed" | "accepted" | "declined" {
  return entry.governance.agentsMdProposalStatus ?? "none";
}

export function isAgentsMdPromotionCandidate(entry: MemoryEntry, feedbackEntries: any[], useCountThreshold: number): boolean {
  if (entry.status !== "active") return false;
  if ((entry.retrieval?.useCount ?? 0) < useCountThreshold) return false;
  const hasHelpfulFeedback = feedbackEntries.some((item) => item.memoryId === entry.memoryId && item.kind === "helpful");
  if (!hasHelpfulFeedback) return false;
  if (agentsMdStatus(entry) !== "none") return false;
  return true;
}

export function searchAgentsMdPromotionCandidates(limit: number): MemoryEntry[] {
  const feedbackEntries = readJsonl(feedbackFile());
  return readEntries()
    .filter((entry) => isAgentsMdPromotionCandidate(entry, feedbackEntries, 5))
    .sort((a, b) => (b.retrieval?.useCount ?? 0) - (a.retrieval?.useCount ?? 0) || a.memoryId.localeCompare(b.memoryId))
    .slice(0, limit);
}

export function renderAgentsMdPromotionShortlist(entries: MemoryEntry[]): string {
  if (entries.length === 0) return "";
  return [
    "",
    "[AGENTS.md Promotion Candidates v1]",
    "Repeatedly validated project memory. Call memory_propose_agents_promotion only when you actually present this suggestion to the user in this reply. Never edit AGENTS.md before the user explicitly approves.",
    ...entries.map((entry) => `- ${entry.memoryId}: ${entry.content.summary.slice(0, 80)} (useCount=${entry.retrieval?.useCount ?? 0})`),
    "[/AGENTS.md Promotion Candidates]",
  ].join("\n");
}

export function recordCandidateUse(entry: MemoryEntry, relevanceReason: string): void {
  appendAudit("llm-use-candidate", entry.memoryId, { relevanceReason });
  appendMetric({ operation: "llm-use-candidate", selectedMemoryIds: [entry.memoryId], relevanceReason });
  updateEntry(entry.memoryId, (current) => ({ ...current, lastAccessedAt: nowIso(), retrieval: { ...current.retrieval, useCount: (current.retrieval?.useCount ?? 0) + 1 } }));
}

export function canPromoteMemory(entry: MemoryEntry): boolean {
  if (entry.status !== "candidate") return false;
  if (entry.lifecycle.staleness === "stale") return false;
  if (entry.lifecycle.conflictsWith.length > 0) return false;
  if (entry.privacy.containsSecrets || entry.privacy.sensitivity === "secret") return false;
  if (entry.governance.supersededBy) return false;
  return true;
}

export function supersedeMemory(oldId: string, newId: string): { ok: true } | { ok: false; reason: "self-supersede" | "old-not-found" | "new-not-found" } {
  if (oldId === newId) return { ok: false, reason: "self-supersede" };
  if (!findEntry(oldId)) return { ok: false, reason: "old-not-found" };
  if (!findEntry(newId)) return { ok: false, reason: "new-not-found" };
  updateEntry(oldId, (entry) => ({
    ...entry,
    status: "superseded",
    updatedAt: nowIso(),
    governance: { ...entry.governance, supersededBy: newId, autoInject: "never" },
  }));
  updateEntry(newId, (entry) => ({
    ...entry,
    updatedAt: nowIso(),
    governance: { ...entry.governance, supersedes: Array.from(new Set([...(entry.governance.supersedes ?? []), oldId])) },
  }));
  appendAudit("supersede", oldId, { supersededBy: newId });
  return { ok: true };
}

export function autoExtractMemory(request: string): void {
  const extracted = extractMemoriesFromPrompt(request);
  for (const item of extracted) saveExtractedMemory(item);
}

export function extractMemoriesFromPrompt(request: string): ExtractedMemory[] {
  const body = normalizeWhitespace(request);
  if (!body) return [];
  if (isExplicitRememberPrompt(body)) return [{ text: body, status: "active", source: "auto-extract-explicit", reason: "explicit-remember" }];
  if (isCandidateMemoryPrompt(body)) return [{ text: body, status: "candidate", source: "auto-extract-candidate", reason: "candidate-signal" }];
  return [];
}

export function saveExtractedMemory(item: ExtractedMemory): SaveMemoryResult {
  const body = normalizeWhitespace(item.text);
  if (!body) return { ok: false, message: "Memory not saved: text is required.", reason: "empty-input" };
  if (mayContainSecret(body)) {
    appendMetric({ operation: item.source, rejected: "secret-like-input", requestHash: sha256(body) });
    return { ok: false, message: "Memory not saved: secret-like text was detected. Redact the secret first, then save memory again.", reason: "secret-like-input" };
  }
  const summary = body.slice(0, 500);
  const duplicate = readEntries().find((entry) => entry.content.summary === summary);
  if (duplicate) {
    const shouldPromote = canPromoteMemory(duplicate) && (item.status === "active" || item.status === "candidate");
    const promoted = shouldPromote ? promoteMemory(duplicate.memoryId, item.status === "active" ? "explicit-duplicate" : "repeated-observation", item.source) : null;
    appendMetric({ operation: item.source, excluded: "duplicate-summary", requestHash: sha256(body), existingMemoryId: duplicate.memoryId, promotedToActive: Boolean(promoted) });
    return { ok: true, entry: promoted ?? duplicate };
  }
  ensureProjectMemoryIgnored();
  const entry = createMemory(body, {
    status: item.status,
    source: item.source,
    createdBy: "agent",
    evidenceSummary: `Automatically extracted from prompt (${item.reason}).`,
    autoInject: item.status === "active" ? "when-relevant" : "never",
    confidence: item.status === "active" ? "explicit" : "medium",
  });
  appendJsonl(entriesFile(), entry);
  appendAudit("auto-extract", entry.memoryId, { status: entry.status, source: item.source, reason: item.reason });
  appendMetric({ operation: item.source, selectedMemoryIds: [entry.memoryId], selectedRenderHashes: [entry.rendering.stableRenderHash], status: entry.status, reason: item.reason });
  return { ok: true, entry };
}

export function isExplicitRememberPrompt(text: string): boolean {
  return /(기억해(?:줘|라|자)?(?:$|[\s.!?。])|remember\b|앞으로\s*항상|항상\s*.*기억|이\s*프로젝트에서는|절대\s+.*(?:해|하지|말|금지)|always\s+remember|from\s+now\s+on|never\s+)/i.test(text);
}

export function isCandidateMemoryPrompt(text: string): boolean {
  return /(아니야|아니라|정정|수정[:：]|correction|not\s+.*but|instead|workflow|gate|failure|failed|blocked|guard|dpaa|sbadr|todo|후속|다음에|나중에|해야\s*해|해야\s*한다|결정|decision|주의|pitfall|실패|깨짐)/i.test(text);
}

export function createMemory(text: string, options: CreateMemoryOptions = {}): MemoryEntry {
  const timestamp = nowIso();
  const memoryId = `mem_${timestamp.replace(/[-:.TZ]/g, "").slice(0, 14)}_${crypto.randomBytes(3).toString("hex")}`;
  const summary = normalizeWhitespace(text).slice(0, 500);
  const type = inferType(summary);
  const useAs = inferUseAs(type, summary);
  const containsSecrets = mayContainSecret(summary);
  const status = containsSecrets ? "disabled" : options.status ?? "active";
  const autoInject = containsSecrets ? "never" : options.autoInject ?? (status === "active" ? "when-relevant" : "never");
  const entry: MemoryEntry = {
    schemaVersion: 1,
    memoryId,
    createdAt: timestamp,
    updatedAt: timestamp,
    scope: { level: "project", workspaceRoot: "<PROJECT_ROOT>" },
    type,
    status,
    confidence: options.confidence ?? "explicit",
    importance: summary.includes("절대") || /must|never|required/i.test(summary) ? "high" : "normal",
    content: { summary },
    index: { topics: extractTopics(summary), files: extractFiles(summary), symbols: [], appliesToPhases: extractPhases(summary) },
    provenance: { source: options.source ?? "user-explicit", createdBy: options.createdBy ?? "user", evidence: [{ kind: "user-message", summary: options.evidenceSummary ?? "Created through /memory remember." }] },
    governance: { userEditable: true, userDeletable: true, autoInject, requiresApprovalBeforeActive: false },
    privacy: { sensitivity: containsSecrets ? "secret" : "internal", redactionLevel: "paths-only", exportable: false, containsSecrets, notes: containsSecrets ? "Potential secret-like text detected; auto-injection and export disabled." : undefined },
    retrieval: { useCount: 0 },
    lifecycle: { lastVerifiedAt: timestamp, staleness: "fresh", conflictsWith: [] },
    rendering: { useAs, stableRenderHash: "sha256:" + "0".repeat(64) },
  };
  return withRenderHash(entry);
}

export function withRenderHash(entry: MemoryEntry): MemoryEntry {
  const stable = stableRender(entry);
  return { ...entry, rendering: { ...entry.rendering, stableRenderHash: sha256Prefixed(stable) } };
}

export function inferType(text: string): MemoryType {
  if (/결정|decision/i.test(text)) return "decision";
  if (/절대|금지|must not|never/i.test(text)) return "constraint";
  if (/선호|prefer|preference|좋아/i.test(text)) return "preference";
  if (/pitfall|주의|실패|깨짐|broken|failed/i.test(text)) return "pitfall";
  if (/workflow|phase|gate/i.test(text)) return "workflow";
  return "fact";
}

export function inferUseAs(type: MemoryType, text: string): MemoryUseAs {
  if (type === "constraint") return "constraint";
  if (type === "decision") return "decision";
  if (type === "preference" || /prefer/i.test(text)) return "preference";
  if (type === "pitfall") return "warning";
  return "context";
}

export function normalizeWhitespace(value: string): string { return value.replace(/\s+/g, " ").trim(); }
export function tokenize(value: string): string[] { return Array.from(new Set(value.toLowerCase().match(/[a-z0-9가-힣_.\/-]{2,}/g) ?? [])); }
export function extractTopics(value: string): string[] { return tokenize(value).filter((token) => !token.includes("/") && !token.includes(".")).slice(0, 20); }
export function extractFiles(value: string): string[] { return Array.from(new Set(value.match(/[A-Za-z0-9_./-]+\.[A-Za-z0-9]+/g) ?? [])).slice(0, 20); }
export function extractPhases(value: string): string[] {
  const phases = ["interview", "plan", "plan_review", "implement", "code_review", "review_approved", "document", "commit", "push", "done"];
  const lower = value.toLowerCase();
  const found = phases.filter((phase) => lower.includes(phase));
  return found.length ? found : ["any"];
}
export function mayContainSecret(value: string): boolean { return /(api[_-]?key|secret|token|password|passwd|authorization|bearer\s+[a-z0-9._-]+|BEGIN (RSA |OPENSSH |EC |DSA )?PRIVATE KEY|AKIA[0-9A-Z]{16})/i.test(value); }

export function enableBlockers(entry: MemoryEntry): string[] {
  const blockers: string[] = [];
  if (entry.privacy.containsSecrets || entry.privacy.sensitivity === "secret" || mayContainSecret(`${entry.content.summary} ${entry.content.details ?? ""}`)) blockers.push("secret-like content is present; create a redacted replacement instead");
  if (entry.lifecycle.staleness === "stale") blockers.push("memory is marked stale; edit or replace it before enabling");
  if (entry.lifecycle.conflictsWith.length > 0) blockers.push(`memory conflicts with: ${entry.lifecycle.conflictsWith.join(", ")}`);
  if (entry.governance.supersededBy) blockers.push(`memory is superseded by ${entry.governance.supersededBy}`);
  return blockers;
}

export function searchMemory(query: string, options: SearchOptions): MemoryMatch[] {
  const queryTokens = tokenize(query);
  const feedbackEntries = readJsonl(feedbackFile());
  const context: ScoringContext = { currentPhase: options.currentPhase, feedbackEntries };
  const entries = readEntries().filter((entry) => {
    if (entry.lifecycle?.staleness === "stale") return false;
    if (["rejected", "deprecated", "superseded"].includes(entry.status)) return false;
    if (!options.includeDisabled && entry.status !== "active") return false;
    if (!options.includeDisabled && entry.governance.autoInject === "never") return false;
    return true;
  });
  return entries.map((entry) => scoreEntry(entry, queryTokens, query, context)).filter((match) => match.score > 0).sort((a, b) => b.score - a.score || a.entry.memoryId.localeCompare(b.entry.memoryId)).slice(0, options.limit);
}

export function scoreEntry(entry: MemoryEntry, queryTokens: string[], rawQuery: string, context: ScoringContext = {}): MemoryMatch {
  const reasons: string[] = [];
  let score = 0;
  const haystack = tokenize([entry.content.summary, entry.content.details ?? "", entry.index.topics.join(" "), entry.index.files.join(" "), entry.index.symbols?.join(" ") ?? ""].join(" "));
  const overlap = queryTokens.filter((token) => haystack.includes(token));
  if (overlap.length) { score += Math.min(8, overlap.length * 2); reasons.push("keyword"); }
  if (entry.index.files.some((file) => rawQuery.includes(file))) { score += 5; reasons.push("file"); }
  const phaseSignals = entry.index.appliesToPhases.filter((phase) => phase !== "any");
  if (context.currentPhase && phaseSignals.includes(context.currentPhase)) { score += 5; reasons.push("phase"); }
  else if (phaseSignals.some((phase) => rawQuery.toLowerCase().includes(phase))) { score += 2; reasons.push("phase-text"); }
  if (entry.status === "active") { score += 2; reasons.push("active"); }
  if (["constraint", "decision"].includes(entry.rendering.useAs)) { score += 1; reasons.push(entry.rendering.useAs); }
  if (entry.importance === "critical") { score += 2; reasons.push("critical"); }
  if (entry.importance === "high") { score += 1; reasons.push("high"); }
  if (entry.confidence === "explicit") { score += 2; reasons.push("explicit"); }
  else if (entry.confidence === "high") { score += 1; reasons.push("high-confidence"); }
  if (entry.lifecycle.staleness === "aging") { score -= 1; reasons.push("aging"); }
  const feedbackAdjustment = computeFeedbackAdjustment(entry.memoryId, context.feedbackEntries ?? []);
  score += feedbackAdjustment;
  if (feedbackAdjustment > 0) reasons.push("feedback-boost");
  if (feedbackAdjustment < 0) reasons.push("feedback-penalty");
  return { entry, score, matchedReasons: reasons, renderHash: entry.rendering.stableRenderHash };
}

export function computeFeedbackAdjustment(memoryId: string, feedbackEntries: any[]): number {
  const helpfulCount = feedbackEntries.filter((item) => item.memoryId === memoryId && item.kind === "helpful").length;
  const irrelevantCount = feedbackEntries.filter((item) => item.memoryId === memoryId && item.kind === "irrelevant").length;
  const helpfulComponent = helpfulCount >= 2 ? helpfulCount : 0;
  const irrelevantComponent = irrelevantCount >= 2 ? irrelevantCount : 0;
  const rawAdjustment = helpfulComponent - irrelevantComponent;
  return Math.max(-4, Math.min(4, rawAdjustment));
}

export function selectMemories(request: string, matches: MemoryMatch[], limit: number): MemoryMatch[] {
  if (!request) return [];
  const previous = readInjectionState();
  const stickyIds = new Set<string>(previous?.selectedMemoryIds ?? []);
  return matches
    .map((match) => ({ ...match, score: match.score + (stickyIds.has(match.entry.memoryId) ? 1 : 0) }))
    .filter((match) => match.score >= 3)
    .sort((a, b) => b.score - a.score || stableRender(a.entry).localeCompare(stableRender(b.entry)))
    .slice(0, limit)
    .sort((a, b) => renderPriority(a.entry) - renderPriority(b.entry) || b.score - a.score || a.entry.memoryId.localeCompare(b.entry.memoryId));
}

export function renderPriority(entry: MemoryEntry): number {
  return { constraint: 0, decision: 1, warning: 2, preference: 3, context: 4 }[entry.rendering.useAs];
}

export function stableRender(entry: MemoryEntry): string {
  return `${entry.memoryId} | ${entry.type} | ${entry.importance} | ${entry.rendering.useAs} | ${entry.content.summary}`;
}

export function renderMemoryBlock(matches: MemoryMatch[]): string {
  if (matches.length === 0) return "";
  return [
    "",
    "[External Memory Context v1]",
    ...matches.map((match) => `- ${stableRender(match.entry)}`),
    "[/External Memory Context]",
  ].join("\n");
}

export function renderEntryLine(entry: MemoryEntry): string { return `- ${entry.memoryId} | ${entry.status} | ${entry.type} | ${entry.importance} | ${entry.content.summary}`; }
export function formatMemoryList(entries: MemoryEntry[]): string { return entries.length ? ["🧠 External memory", ...entries.map(renderEntryLine)].join("\n") : "🧠 External memory\nNo memories found."; }
export function formatMatches(matches: MemoryMatch[]): string { return matches.length ? ["🔎 Memory search", ...matches.map((m) => `${renderEntryLine(m.entry)}\n  score=${m.score}; reasons=${m.matchedReasons.join(",") || "unknown"}`)].join("\n") : "🔎 Memory search\nNo matches."; }
export function formatExplain(injection: any): string {
  if (!injection || !injection.selectedMemoryIds?.length) return "🧠 Memory explain\nNo memory was injected for the latest prompt.";
  return [
    "🧠 Memory explain",
    `Request hash: ${injection.requestHash}`,
    `Dynamic block hash: ${injection.dynamicBlockHash}`,
    ...injection.selectedMemoryIds.map((id: string, index: number) => `- ${id} | ${injection.selectedRenderHashes?.[index] ?? "unknown"} | score=${injection.selectedScores?.[id] ?? "unknown"} | reasons=${(injection.matchedReasons?.[id] ?? []).join(",") || "unknown"}`),
  ].join("\n");
}

export function appendAudit(action: string, memoryId: string, data: any = {}): void { appendJsonl(auditFile(), { schemaVersion: 1, timestamp: nowIso(), action, memoryId, ...data }); }
export function appendMetric(data: any): void { appendJsonl(metricsFile(), { schemaVersion: 1, timestamp: nowIso(), ...data }); }
export function appendFeedback(memoryId: string, kind: FeedbackKind, note = ""): void { appendJsonl(feedbackFile(), { schemaVersion: 1, timestamp: nowIso(), memoryId, kind, noteHash: sha256(note), notePreview: note.slice(0, 160) }); }

export function metricFromMatches(operation: string, request: string, candidates: MemoryMatch[], selected: MemoryMatch[], dynamic = ""): any {
  const reasonCounts: Record<string, number> = {};
  for (const match of selected) for (const reason of match.matchedReasons) reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
  const previous = readInjectionState();
  const previousIds = JSON.stringify(previous?.selectedMemoryIds ?? []);
  const selectedIds = selected.map((m) => m.entry.memoryId);
  return {
    operation,
    requestHash: sha256(request),
    candidateCount: candidates.length,
    selectedMemoryIds: selectedIds,
    selectedRenderHashes: selected.map((m) => m.renderHash),
    selectedScores: Object.fromEntries(selected.map((m) => [m.entry.memoryId, m.score])),
    selectedReasons: Object.fromEntries(selected.map((m) => [m.entry.memoryId, m.matchedReasons])),
    stickySetReused: previousIds === JSON.stringify(selectedIds),
    dynamicBlockHash: sha256(dynamic),
    cacheChurn: !previous ? "none" : previousIds === JSON.stringify(selectedIds) ? "none" : "high",
    matchedReasons: reasonCounts,
    excludedCounts: { belowThreshold: Math.max(0, candidates.length - selected.length) },
  };
}

export function wasRecentlyInjected(id: string): boolean {
  const injection = readInjectionState();
  if (!injection?.timestamp) return false;
  return injection.selectedMemoryIds?.includes(id) && Date.now() - Date.parse(injection.timestamp) < 10 * 60_000;
}
export function readInjectionState(): any { return readJson(injectionStateFile()); }

export function inspectJsonlFile(label: string, file: string): MemoryFileHealth {
  if (!fs.existsSync(file)) return { label, file, exists: false, ok: true, count: 0 };
  try {
    const lines = fs.readFileSync(file, "utf-8").split(/\r?\n/).filter(Boolean);
    for (const line of lines) JSON.parse(line);
    return { label, file, exists: true, ok: true, count: lines.length };
  } catch (error) {
    return { label, file, exists: true, ok: false, error: String(error).slice(0, 200) };
  }
}

export function inspectJsonFile(label: string, file: string): MemoryFileHealth {
  if (!fs.existsSync(file)) return { label, file, exists: false, ok: true };
  try {
    JSON.parse(fs.readFileSync(file, "utf-8"));
    return { label, file, exists: true, ok: true };
  } catch (error) {
    return { label, file, exists: true, ok: false, error: String(error).slice(0, 200) };
  }
}

export function formatFileHealth(item: MemoryFileHealth): string {
  const state = item.exists ? (item.ok ? "ok" : "parse-error") : "missing";
  const count = typeof item.count === "number" ? ` count=${item.count}` : "";
  const error = item.error ? ` error=${item.error}` : "";
  return `- ${item.label}: ${state}${count} path=${item.file}${error}`;
}

export function formatDoctor(): string {
  const entries = readEntries();
  const countsByStatus = countBy(entries, (entry) => entry.status);
  const statusSummary = Object.entries(countsByStatus).map(([key, value]) => `${key}=${value}`).join(", ") || "none";
  const injection = readInjectionState();
  const recentIds = injection?.selectedMemoryIds ?? [];
  const recentReasons = Array.from(new Set(recentIds.flatMap((id: string) => injection?.matchedReasons?.[id] ?? [])));
  const fileHealth = [
    inspectJsonlFile("entries.jsonl", entriesFile()),
    inspectJsonlFile("audit.jsonl", auditFile()),
    inspectJsonlFile("metrics.jsonl", metricsFile()),
    inspectJsonlFile("feedback.jsonl", feedbackFile()),
    inspectJsonFile("injection-state.json", injectionStateFile()),
  ];
  return [
    "🩺 Memory doctor",
    `Project root: ${projectRoot()}`,
    `Memory dir: ${memoryDir()}`,
    "File health:",
    ...fileHealth.map(formatFileHealth),
    `Entry counts: total=${entries.length}${statusSummary === "none" ? "" : ` (${statusSummary})`}`,
    entries.length ? "" : "No memory entries saved.",
    "Recent injection:",
    `- ids=${recentIds.length ? recentIds.join(",") : "none"}`,
    `- reasons=${recentReasons.length ? recentReasons.join(",") : "none"}`,
    `- matched=${recentIds.map((id: string) => `${id}:${(injection?.matchedReasons?.[id] ?? []).join(",") || "unknown"}`).join("; ") || "none"}`,
    `- Dynamic block hash: ${injection?.dynamicBlockHash ?? "none"}`,
    `- Request hash: ${injection?.requestHash ?? "none"}`,
  ].filter((line) => line !== "").join("\n");
}

export function formatStats(): string {
  const entries = readEntries();
  const metrics = readJsonl(metricsFile());
  const feedback = readJsonl(feedbackFile());
  const injections = metrics.filter((m) => m.operation === "inject");
  const avgSelected = injections.length ? injections.reduce((sum, m) => sum + (m.selectedMemoryIds?.length ?? 0), 0) / injections.length : 0;
  const stickyReuse = injections.length ? injections.filter((m) => m.stickySetReused).length / injections.length : 0;
  const countsByStatus = countBy(entries, (entry) => entry.status);
  const feedbackCounts = countBy(feedback, (item) => item.kind ?? "unknown");
  return [
    "📊 Memory stats",
    `- memories: ${entries.length} (${Object.entries(countsByStatus).map(([k, v]) => `${k}=${v}`).join(", ") || "none"})`,
    `- injections: ${injections.length}`,
    `- avg selected memories: ${avgSelected.toFixed(2)}`,
    `- sticky reuse rate: ${(stickyReuse * 100).toFixed(1)}%`,
    `- feedback: ${Object.entries(feedbackCounts).map(([k, v]) => `${k}=${v}`).join(", ") || "none"}`,
  ].join("\n");
}
export function countBy<T>(items: T[], keyFn: (item: T) => string): Record<string, number> { return items.reduce((acc, item) => { const key = keyFn(item); acc[key] = (acc[key] ?? 0) + 1; return acc; }, {} as Record<string, number>); }

export function extractRequestText(event: any): string {
  const direct = event.userPrompt ?? event.prompt ?? event.input ?? event.request;
  if (typeof direct === "string") return direct;
  if (Array.isArray(event.messages)) {
    const last = [...event.messages].reverse().find((message) => message?.role === "user");
    if (typeof last?.content === "string") return last.content;
  }
  return "";
}

export function extractCurrentPhase(event: any, request: string): string | undefined {
  const phases = ["plan_review", "code_review", "review_approved", "interview", "implement", "document", "commit", "push", "plan", "done"];
  const parts = [event.systemPrompt, event.prompt, event.input, event.request, request]
    .filter((value) => typeof value === "string")
    .join("\n")
    .toLowerCase();
  const explicit = parts.match(/current phase:\s*([a-z_]+)/i);
  if (explicit?.[1] && phases.includes(explicit[1])) return explicit[1];
  return phases.find((phase) => new RegExp(`\\b${phase}\\b`, "i").test(parts));
}
