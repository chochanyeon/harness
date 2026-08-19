#!/usr/bin/env node
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// target/.claude/hooks/src/memory-context.ts
var fs2 = __toESM(require("node:fs"));

// target/.pi/extensions/memory/core.ts
var import_node_child_process = require("node:child_process");
var crypto = __toESM(require("node:crypto"));
var fs = __toESM(require("node:fs"));
var path = __toESM(require("node:path"));
var MEMORY_POLICY = [
  "",
  "[External Memory Policy v1]",
  "External memory may be provided in a later block.",
  "Use active constraints/decisions only when relevant.",
  "Do not treat candidate memory as fact.",
  "If memory conflicts with current user instruction or current code, ask or prefer the latest explicit user instruction.",
  "[/External Memory Policy]"
].join("\n");
function projectRoot() {
  if (process.env.HARNESS_MEMORY_ROOT) return process.env.HARNESS_MEMORY_ROOT;
  try {
    return (0, import_node_child_process.execSync)("git rev-parse --show-toplevel", { encoding: "utf-8", stdio: "pipe" }).trim();
  } catch {
    return process.cwd();
  }
}
function memoryDir() {
  return path.join(projectRoot(), ".project-memory", "memory");
}
function entriesFile() {
  return path.join(memoryDir(), "entries.jsonl");
}
function auditFile() {
  return path.join(memoryDir(), "audit.jsonl");
}
function metricsFile() {
  return path.join(memoryDir(), "metrics.jsonl");
}
function feedbackFile() {
  return path.join(memoryDir(), "feedback.jsonl");
}
function injectionStateFile() {
  return path.join(memoryDir(), "injection-state.json");
}
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
function sha256Prefixed(value) {
  return `sha256:${sha256(value)}`;
}
function ensureDir(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}
function appendJsonl(file, value) {
  ensureProjectMemoryIgnored();
  ensureDir(file);
  fs.appendFileSync(file, `${JSON.stringify(value)}
`, "utf-8");
}
function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf-8").split(/\r?\n/).filter(Boolean).map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  }).filter(Boolean);
}
function writeJson(file, value) {
  ensureDir(file);
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf-8");
}
function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return null;
  }
}
function ensureProjectMemoryIgnored() {
  const root = projectRoot();
  const exclude = path.join(root, ".git", "info", "exclude");
  try {
    if (!fs.existsSync(path.join(root, ".git"))) return;
    fs.mkdirSync(path.dirname(exclude), { recursive: true });
    const current = fs.existsSync(exclude) ? fs.readFileSync(exclude, "utf-8") : "";
    if (!/^\.project-memory\/$/m.test(current)) {
      fs.appendFileSync(exclude, `${current.endsWith("\n") || current.length === 0 ? "" : "\n"}.project-memory/
`, "utf-8");
    }
  } catch {
  }
}
function readEntries() {
  return readJsonl(entriesFile());
}
function findEntry(id) {
  return readEntries().find((entry) => entry.memoryId === id) ?? null;
}
function rewriteEntries(entries) {
  ensureDir(entriesFile());
  fs.writeFileSync(entriesFile(), entries.map((entry) => JSON.stringify(entry)).join("\n") + (entries.length ? "\n" : ""), "utf-8");
}
function updateEntry(id, updater) {
  const entries = readEntries();
  const index = entries.findIndex((entry) => entry.memoryId === id);
  if (index < 0) return null;
  entries[index] = withRenderHash(updater(entries[index]));
  rewriteEntries(entries);
  return entries[index];
}
function promoteMemory(id, reason, source, evidence) {
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
    provenance: { ...entry.provenance, updatedBy: "agent", evidence: [...entry.provenance.evidence ?? [], { kind: "autopilot", summary: evidenceSummary }] },
    governance: { ...entry.governance, autoInject: "when-relevant" }
  }));
  if (promoted) {
    appendAudit("auto-promote", id, { reason, source, status: "active", evidence });
    appendMetric({ operation: "auto-promote", selectedMemoryIds: [id], selectedRenderHashes: [promoted.rendering.stableRenderHash], reason, source });
  }
  return promoted;
}
function searchCandidateMemory(request, currentPhase, limit) {
  return searchMemory(request, { includeDisabled: true, limit, currentPhase }).filter((match) => match.entry.status === "candidate");
}
function renderCandidateShortlist(matches) {
  if (matches.length === 0) return "";
  return [
    "",
    "[Candidate Memory Shortlist v1]",
    "Unverified memory. Call memory_use_candidate before treating any line below as fact. Call memory_promote_candidate only when a concrete trigger signal is present.",
    ...matches.map((match) => `- ${match.entry.memoryId}: ${match.entry.content.summary.slice(0, 80)}`),
    "[/Candidate Memory Shortlist]"
  ].join("\n");
}
function agentsMdStatus(entry) {
  return entry.governance.agentsMdProposalStatus ?? "none";
}
function isAgentsMdPromotionCandidate(entry, feedbackEntries, useCountThreshold) {
  if (entry.status !== "active") return false;
  if ((entry.retrieval?.useCount ?? 0) < useCountThreshold) return false;
  const hasHelpfulFeedback = feedbackEntries.some((item) => item.memoryId === entry.memoryId && item.kind === "helpful");
  if (!hasHelpfulFeedback) return false;
  if (agentsMdStatus(entry) !== "none") return false;
  return true;
}
function searchAgentsMdPromotionCandidates(limit) {
  const feedbackEntries = readJsonl(feedbackFile());
  return readEntries().filter((entry) => isAgentsMdPromotionCandidate(entry, feedbackEntries, 5)).sort((a, b) => (b.retrieval?.useCount ?? 0) - (a.retrieval?.useCount ?? 0) || a.memoryId.localeCompare(b.memoryId)).slice(0, limit);
}
function renderAgentsMdPromotionShortlist(entries) {
  if (entries.length === 0) return "";
  return [
    "",
    "[AGENTS.md Promotion Candidates v1]",
    "Repeatedly validated project memory. Call memory_propose_agents_promotion only when you actually present this suggestion to the user in this reply. Never edit AGENTS.md before the user explicitly approves.",
    ...entries.map((entry) => `- ${entry.memoryId}: ${entry.content.summary.slice(0, 80)} (useCount=${entry.retrieval?.useCount ?? 0})`),
    "[/AGENTS.md Promotion Candidates]"
  ].join("\n");
}
function canPromoteMemory(entry) {
  if (entry.status !== "candidate") return false;
  if (entry.lifecycle.staleness === "stale") return false;
  if (entry.lifecycle.conflictsWith.length > 0) return false;
  if (entry.privacy.containsSecrets || entry.privacy.sensitivity === "secret") return false;
  if (entry.governance.supersededBy) return false;
  return true;
}
function autoExtractMemory(request) {
  const extracted = extractMemoriesFromPrompt(request);
  for (const item of extracted) saveExtractedMemory(item);
}
function extractMemoriesFromPrompt(request) {
  const body = normalizeWhitespace(request);
  if (!body) return [];
  if (isExplicitRememberPrompt(body)) return [{ text: body, status: "active", source: "auto-extract-explicit", reason: "explicit-remember" }];
  if (isCandidateMemoryPrompt(body)) return [{ text: body, status: "candidate", source: "auto-extract-candidate", reason: "candidate-signal" }];
  return [];
}
function saveExtractedMemory(item) {
  const body = normalizeWhitespace(item.text);
  if (!body) return { ok: false, message: "Memory not saved: text is required.", reason: "empty-input" };
  if (mayContainSecret(body)) {
    appendMetric({ operation: item.source, rejected: "secret-like-input", requestHash: sha256(body) });
    return { ok: false, message: "Memory not saved: secret-like text was detected. Redact the secret first, then save memory again.", reason: "secret-like-input" };
  }
  const summary = body.slice(0, 500);
  const duplicate = readEntries().find((entry2) => entry2.content.summary === summary);
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
    confidence: item.status === "active" ? "explicit" : "medium"
  });
  appendJsonl(entriesFile(), entry);
  appendAudit("auto-extract", entry.memoryId, { status: entry.status, source: item.source, reason: item.reason });
  appendMetric({ operation: item.source, selectedMemoryIds: [entry.memoryId], selectedRenderHashes: [entry.rendering.stableRenderHash], status: entry.status, reason: item.reason });
  return { ok: true, entry };
}
function isExplicitRememberPrompt(text) {
  return /(기억해(?:줘|라|자)?(?:$|[\s.!?。])|remember\b|앞으로\s*항상|항상\s*.*기억|이\s*프로젝트에서는|절대\s+.*(?:해|하지|말|금지)|always\s+remember|from\s+now\s+on|never\s+)/i.test(text);
}
function isCandidateMemoryPrompt(text) {
  return /(아니야|아니라|정정|수정[:：]|correction|not\s+.*but|instead|workflow|gate|failure|failed|blocked|guard|dpaa|sbadr|todo|후속|다음에|나중에|해야\s*해|해야\s*한다|결정|decision|주의|pitfall|실패|깨짐)/i.test(text);
}
function createMemory(text, options = {}) {
  const timestamp = nowIso();
  const memoryId = `mem_${timestamp.replace(/[-:.TZ]/g, "").slice(0, 14)}_${crypto.randomBytes(3).toString("hex")}`;
  const summary = normalizeWhitespace(text).slice(0, 500);
  const type = inferType(summary);
  const useAs = inferUseAs(type, summary);
  const containsSecrets = mayContainSecret(summary);
  const status = containsSecrets ? "disabled" : options.status ?? "active";
  const autoInject = containsSecrets ? "never" : options.autoInject ?? (status === "active" ? "when-relevant" : "never");
  const entry = {
    schemaVersion: 1,
    memoryId,
    createdAt: timestamp,
    updatedAt: timestamp,
    scope: { level: "project", workspaceRoot: "<PROJECT_ROOT>" },
    type,
    status,
    confidence: options.confidence ?? "explicit",
    importance: summary.includes("\uC808\uB300") || /must|never|required/i.test(summary) ? "high" : "normal",
    content: { summary },
    index: { topics: extractTopics(summary), files: extractFiles(summary), symbols: [], appliesToPhases: extractPhases(summary) },
    provenance: { source: options.source ?? "user-explicit", createdBy: options.createdBy ?? "user", evidence: [{ kind: "user-message", summary: options.evidenceSummary ?? "Created through /memory remember." }] },
    governance: { userEditable: true, userDeletable: true, autoInject, requiresApprovalBeforeActive: false },
    privacy: { sensitivity: containsSecrets ? "secret" : "internal", redactionLevel: "paths-only", exportable: false, containsSecrets, notes: containsSecrets ? "Potential secret-like text detected; auto-injection and export disabled." : void 0 },
    retrieval: { useCount: 0 },
    lifecycle: { lastVerifiedAt: timestamp, staleness: "fresh", conflictsWith: [] },
    rendering: { useAs, stableRenderHash: "sha256:" + "0".repeat(64) }
  };
  return withRenderHash(entry);
}
function withRenderHash(entry) {
  const stable = stableRender(entry);
  return { ...entry, rendering: { ...entry.rendering, stableRenderHash: sha256Prefixed(stable) } };
}
function inferType(text) {
  if (/결정|decision/i.test(text)) return "decision";
  if (/절대|금지|must not|never/i.test(text)) return "constraint";
  if (/선호|prefer|preference|좋아/i.test(text)) return "preference";
  if (/pitfall|주의|실패|깨짐|broken|failed/i.test(text)) return "pitfall";
  if (/workflow|phase|gate/i.test(text)) return "workflow";
  return "fact";
}
function inferUseAs(type, text) {
  if (type === "constraint") return "constraint";
  if (type === "decision") return "decision";
  if (type === "preference" || /prefer/i.test(text)) return "preference";
  if (type === "pitfall") return "warning";
  return "context";
}
function normalizeWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}
function tokenize(value) {
  return Array.from(new Set(value.toLowerCase().match(/[a-z0-9가-힣_.\/-]{2,}/g) ?? []));
}
function extractTopics(value) {
  return tokenize(value).filter((token) => !token.includes("/") && !token.includes(".")).slice(0, 20);
}
function extractFiles(value) {
  return Array.from(new Set(value.match(/[A-Za-z0-9_./-]+\.[A-Za-z0-9]+/g) ?? [])).slice(0, 20);
}
function extractPhases(value) {
  const phases = ["interview", "plan", "plan_review", "implement", "code_review", "review_approved", "document", "commit", "push", "done"];
  const lower = value.toLowerCase();
  const found = phases.filter((phase) => lower.includes(phase));
  return found.length ? found : ["any"];
}
function mayContainSecret(value) {
  return /(api[_-]?key|secret|token|password|passwd|authorization|bearer\s+[a-z0-9._-]+|BEGIN (RSA |OPENSSH |EC |DSA )?PRIVATE KEY|AKIA[0-9A-Z]{16})/i.test(value);
}
function searchMemory(query, options) {
  const queryTokens = tokenize(query);
  const feedbackEntries = readJsonl(feedbackFile());
  const context = { currentPhase: options.currentPhase, feedbackEntries };
  const entries = readEntries().filter((entry) => {
    if (entry.lifecycle?.staleness === "stale") return false;
    if (["rejected", "deprecated", "superseded"].includes(entry.status)) return false;
    if (!options.includeDisabled && entry.status !== "active") return false;
    if (!options.includeDisabled && entry.governance.autoInject === "never") return false;
    return true;
  });
  return entries.map((entry) => scoreEntry(entry, queryTokens, query, context)).filter((match) => match.score > 0).sort((a, b) => b.score - a.score || a.entry.memoryId.localeCompare(b.entry.memoryId)).slice(0, options.limit);
}
function scoreEntry(entry, queryTokens, rawQuery, context = {}) {
  const reasons = [];
  let score = 0;
  const haystack = tokenize([entry.content.summary, entry.content.details ?? "", entry.index.topics.join(" "), entry.index.files.join(" "), entry.index.symbols?.join(" ") ?? ""].join(" "));
  const overlap = queryTokens.filter((token) => haystack.includes(token));
  if (overlap.length) {
    score += Math.min(8, overlap.length * 2);
    reasons.push("keyword");
  }
  if (entry.index.files.some((file) => rawQuery.includes(file))) {
    score += 5;
    reasons.push("file");
  }
  const phaseSignals = entry.index.appliesToPhases.filter((phase) => phase !== "any");
  if (context.currentPhase && phaseSignals.includes(context.currentPhase)) {
    score += 5;
    reasons.push("phase");
  } else if (phaseSignals.some((phase) => rawQuery.toLowerCase().includes(phase))) {
    score += 2;
    reasons.push("phase-text");
  }
  if (entry.status === "active") {
    score += 2;
    reasons.push("active");
  }
  if (["constraint", "decision"].includes(entry.rendering.useAs)) {
    score += 1;
    reasons.push(entry.rendering.useAs);
  }
  if (entry.importance === "critical") {
    score += 2;
    reasons.push("critical");
  }
  if (entry.importance === "high") {
    score += 1;
    reasons.push("high");
  }
  if (entry.confidence === "explicit") {
    score += 2;
    reasons.push("explicit");
  } else if (entry.confidence === "high") {
    score += 1;
    reasons.push("high-confidence");
  }
  if (entry.lifecycle.staleness === "aging") {
    score -= 1;
    reasons.push("aging");
  }
  const feedbackAdjustment = computeFeedbackAdjustment(entry.memoryId, context.feedbackEntries ?? []);
  score += feedbackAdjustment;
  if (feedbackAdjustment > 0) reasons.push("feedback-boost");
  if (feedbackAdjustment < 0) reasons.push("feedback-penalty");
  return { entry, score, matchedReasons: reasons, renderHash: entry.rendering.stableRenderHash };
}
function computeFeedbackAdjustment(memoryId, feedbackEntries) {
  const helpfulCount = feedbackEntries.filter((item) => item.memoryId === memoryId && item.kind === "helpful").length;
  const irrelevantCount = feedbackEntries.filter((item) => item.memoryId === memoryId && item.kind === "irrelevant").length;
  const helpfulComponent = helpfulCount >= 2 ? helpfulCount : 0;
  const irrelevantComponent = irrelevantCount >= 2 ? irrelevantCount : 0;
  const rawAdjustment = helpfulComponent - irrelevantComponent;
  return Math.max(-4, Math.min(4, rawAdjustment));
}
function selectMemories(request, matches, limit) {
  if (!request) return [];
  const previous = readInjectionState();
  const stickyIds = new Set(previous?.selectedMemoryIds ?? []);
  return matches.map((match) => ({ ...match, score: match.score + (stickyIds.has(match.entry.memoryId) ? 1 : 0) })).filter((match) => match.score >= 3).sort((a, b) => b.score - a.score || stableRender(a.entry).localeCompare(stableRender(b.entry))).slice(0, limit).sort((a, b) => renderPriority(a.entry) - renderPriority(b.entry) || b.score - a.score || a.entry.memoryId.localeCompare(b.entry.memoryId));
}
function renderPriority(entry) {
  return { constraint: 0, decision: 1, warning: 2, preference: 3, context: 4 }[entry.rendering.useAs];
}
function stableRender(entry) {
  return `${entry.memoryId} | ${entry.type} | ${entry.importance} | ${entry.rendering.useAs} | ${entry.content.summary}`;
}
function renderMemoryBlock(matches) {
  if (matches.length === 0) return "";
  return [
    "",
    "[External Memory Context v1]",
    ...matches.map((match) => `- ${stableRender(match.entry)}`),
    "[/External Memory Context]"
  ].join("\n");
}
function appendAudit(action, memoryId, data = {}) {
  appendJsonl(auditFile(), { schemaVersion: 1, timestamp: nowIso(), action, memoryId, ...data });
}
function appendMetric(data) {
  appendJsonl(metricsFile(), { schemaVersion: 1, timestamp: nowIso(), ...data });
}
function metricFromMatches(operation, request, candidates, selected, dynamic = "") {
  const reasonCounts = {};
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
    excludedCounts: { belowThreshold: Math.max(0, candidates.length - selected.length) }
  };
}
function readInjectionState() {
  return readJson(injectionStateFile());
}

// target/.claude/hooks/src/memory-context.ts
function readStdinJson() {
  try {
    const raw = fs2.readFileSync(0, "utf8").trim();
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
function emitContext(hookEventName, message) {
  if (!message) process.exit(0);
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName, additionalContext: message } }));
  process.exit(0);
}
function buildInjection(request) {
  if (!request) return "";
  autoExtractMemory(request);
  const matches = searchMemory(request, { includeDisabled: false, limit: 12 });
  const selected = selectMemories(request, matches, 3);
  const dynamic = renderMemoryBlock(selected);
  writeJson(injectionStateFile(), {
    timestamp: nowIso(),
    requestHash: sha256(request),
    selectedMemoryIds: selected.map((m) => m.entry.memoryId),
    selectedRenderHashes: selected.map((m) => m.renderHash),
    selectedScores: Object.fromEntries(selected.map((m) => [m.entry.memoryId, m.score])),
    dynamicBlockHash: sha256(dynamic),
    matchedReasons: Object.fromEntries(selected.map((m) => [m.entry.memoryId, m.matchedReasons]))
  });
  appendMetric(metricFromMatches("inject", request, matches, selected, dynamic));
  const candidateBlock = renderCandidateShortlist(searchCandidateMemory(request, void 0, 5));
  const agentsMdBlock = renderAgentsMdPromotionShortlist(searchAgentsMdPromotionCandidates(5));
  return [dynamic, candidateBlock, agentsMdBlock].filter(Boolean).join("\n");
}
function main() {
  const [, , command] = process.argv;
  const input = readStdinJson();
  if (command === "session-start") {
    try {
      const activeCount = readEntries().filter((e) => e.status === "active").length;
      const message = activeCount > 0 ? `[External Memory] ${activeCount} active memory entr${activeCount === 1 ? "y" : "ies"} available. Use /memory list to browse or /memory search <query>.` : "";
      emitContext("SessionStart", message);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Memory context internal error (session-start): ${message}`);
      process.exit(0);
    }
    return;
  }
  if (command === "user-prompt") {
    try {
      const request = String(input.prompt ?? "").trim();
      emitContext("UserPromptSubmit", buildInjection(request));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Memory context internal error (user-prompt): ${message}`);
      process.exit(0);
    }
    return;
  }
  process.exit(0);
}
main();
