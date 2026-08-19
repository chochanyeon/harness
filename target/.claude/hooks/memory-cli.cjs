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
function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return null;
  }
}
function saveMemoryText(text, source) {
  const body2 = normalizeWhitespace(text);
  if (!body2) return { ok: false, message: "Memory not saved: text is required.", reason: "empty-input" };
  if (mayContainSecret(body2)) {
    appendMetric({ operation: source, rejected: "secret-like-input", requestHash: sha256(body2) });
    return { ok: false, message: "Memory not saved: secret-like text was detected. Redact the secret first, then save memory again.", reason: "secret-like-input" };
  }
  const summary = body2.slice(0, 500);
  const duplicate = readEntries().find((entry2) => entry2.content.summary === summary);
  if (duplicate) {
    const promoted = duplicate.status !== "active" ? updateEntry(duplicate.memoryId, (entry2) => ({
      ...entry2,
      status: "active",
      updatedAt: nowIso(),
      confidence: "explicit",
      provenance: { ...entry2.provenance, source: "user-explicit", updatedBy: "user", evidence: [...entry2.provenance.evidence ?? [], { kind: "user-message", summary: "Promoted by explicit memory request with duplicate summary." }] },
      governance: { ...entry2.governance, autoInject: "when-relevant" }
    })) : null;
    appendMetric({ operation: source, excluded: "duplicate-summary", requestHash: sha256(body2), existingMemoryId: duplicate.memoryId, promotedToActive: Boolean(promoted) });
    return { ok: true, entry: promoted ?? duplicate };
  }
  ensureProjectMemoryIgnored();
  const entry = createMemory(body2);
  appendJsonl(entriesFile(), entry);
  appendAudit("create", entry.memoryId, { source });
  appendMetric({ operation: source, selectedMemoryIds: [entry.memoryId], selectedRenderHashes: [entry.rendering.stableRenderHash] });
  return { ok: true, entry };
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
function canPromoteMemory(entry) {
  if (entry.status !== "candidate") return false;
  if (entry.lifecycle.staleness === "stale") return false;
  if (entry.lifecycle.conflictsWith.length > 0) return false;
  if (entry.privacy.containsSecrets || entry.privacy.sensitivity === "secret") return false;
  if (entry.governance.supersededBy) return false;
  return true;
}
function supersedeMemory(oldId, newId) {
  if (oldId === newId) return { ok: false, reason: "self-supersede" };
  if (!findEntry(oldId)) return { ok: false, reason: "old-not-found" };
  if (!findEntry(newId)) return { ok: false, reason: "new-not-found" };
  updateEntry(oldId, (entry) => ({
    ...entry,
    status: "superseded",
    updatedAt: nowIso(),
    governance: { ...entry.governance, supersededBy: newId, autoInject: "never" }
  }));
  updateEntry(newId, (entry) => ({
    ...entry,
    updatedAt: nowIso(),
    governance: { ...entry.governance, supersedes: Array.from(/* @__PURE__ */ new Set([...entry.governance.supersedes ?? [], oldId])) }
  }));
  appendAudit("supersede", oldId, { supersededBy: newId });
  return { ok: true };
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
function enableBlockers(entry) {
  const blockers = [];
  if (entry.privacy.containsSecrets || entry.privacy.sensitivity === "secret" || mayContainSecret(`${entry.content.summary} ${entry.content.details ?? ""}`)) blockers.push("secret-like content is present; create a redacted replacement instead");
  if (entry.lifecycle.staleness === "stale") blockers.push("memory is marked stale; edit or replace it before enabling");
  if (entry.lifecycle.conflictsWith.length > 0) blockers.push(`memory conflicts with: ${entry.lifecycle.conflictsWith.join(", ")}`);
  if (entry.governance.supersededBy) blockers.push(`memory is superseded by ${entry.governance.supersededBy}`);
  return blockers;
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
function stableRender(entry) {
  return `${entry.memoryId} | ${entry.type} | ${entry.importance} | ${entry.rendering.useAs} | ${entry.content.summary}`;
}
function renderEntryLine(entry) {
  return `- ${entry.memoryId} | ${entry.status} | ${entry.type} | ${entry.importance} | ${entry.content.summary}`;
}
function formatMemoryList(entries) {
  return entries.length ? ["\u{1F9E0} External memory", ...entries.map(renderEntryLine)].join("\n") : "\u{1F9E0} External memory\nNo memories found.";
}
function formatMatches(matches) {
  return matches.length ? ["\u{1F50E} Memory search", ...matches.map((m) => `${renderEntryLine(m.entry)}
  score=${m.score}; reasons=${m.matchedReasons.join(",") || "unknown"}`)].join("\n") : "\u{1F50E} Memory search\nNo matches.";
}
function formatExplain(injection) {
  if (!injection || !injection.selectedMemoryIds?.length) return "\u{1F9E0} Memory explain\nNo memory was injected for the latest prompt.";
  return [
    "\u{1F9E0} Memory explain",
    `Request hash: ${injection.requestHash}`,
    `Dynamic block hash: ${injection.dynamicBlockHash}`,
    ...injection.selectedMemoryIds.map((id, index) => `- ${id} | ${injection.selectedRenderHashes?.[index] ?? "unknown"} | score=${injection.selectedScores?.[id] ?? "unknown"} | reasons=${(injection.matchedReasons?.[id] ?? []).join(",") || "unknown"}`)
  ].join("\n");
}
function appendAudit(action, memoryId, data = {}) {
  appendJsonl(auditFile(), { schemaVersion: 1, timestamp: nowIso(), action, memoryId, ...data });
}
function appendMetric(data) {
  appendJsonl(metricsFile(), { schemaVersion: 1, timestamp: nowIso(), ...data });
}
function appendFeedback(memoryId, kind, note = "") {
  appendJsonl(feedbackFile(), { schemaVersion: 1, timestamp: nowIso(), memoryId, kind, noteHash: sha256(note), notePreview: note.slice(0, 160) });
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
function wasRecentlyInjected(id) {
  const injection = readInjectionState();
  if (!injection?.timestamp) return false;
  return injection.selectedMemoryIds?.includes(id) && Date.now() - Date.parse(injection.timestamp) < 10 * 6e4;
}
function readInjectionState() {
  return readJson(injectionStateFile());
}
function inspectJsonlFile(label, file) {
  if (!fs.existsSync(file)) return { label, file, exists: false, ok: true, count: 0 };
  try {
    const lines = fs.readFileSync(file, "utf-8").split(/\r?\n/).filter(Boolean);
    for (const line of lines) JSON.parse(line);
    return { label, file, exists: true, ok: true, count: lines.length };
  } catch (error) {
    return { label, file, exists: true, ok: false, error: String(error).slice(0, 200) };
  }
}
function inspectJsonFile(label, file) {
  if (!fs.existsSync(file)) return { label, file, exists: false, ok: true };
  try {
    JSON.parse(fs.readFileSync(file, "utf-8"));
    return { label, file, exists: true, ok: true };
  } catch (error) {
    return { label, file, exists: true, ok: false, error: String(error).slice(0, 200) };
  }
}
function formatFileHealth(item) {
  const state = item.exists ? item.ok ? "ok" : "parse-error" : "missing";
  const count = typeof item.count === "number" ? ` count=${item.count}` : "";
  const error = item.error ? ` error=${item.error}` : "";
  return `- ${item.label}: ${state}${count} path=${item.file}${error}`;
}
function formatDoctor() {
  const entries = readEntries();
  const countsByStatus = countBy(entries, (entry) => entry.status);
  const statusSummary = Object.entries(countsByStatus).map(([key, value]) => `${key}=${value}`).join(", ") || "none";
  const injection = readInjectionState();
  const recentIds = injection?.selectedMemoryIds ?? [];
  const recentReasons = Array.from(new Set(recentIds.flatMap((id) => injection?.matchedReasons?.[id] ?? [])));
  const fileHealth = [
    inspectJsonlFile("entries.jsonl", entriesFile()),
    inspectJsonlFile("audit.jsonl", auditFile()),
    inspectJsonlFile("metrics.jsonl", metricsFile()),
    inspectJsonlFile("feedback.jsonl", feedbackFile()),
    inspectJsonFile("injection-state.json", injectionStateFile())
  ];
  return [
    "\u{1FA7A} Memory doctor",
    `Project root: ${projectRoot()}`,
    `Memory dir: ${memoryDir()}`,
    "File health:",
    ...fileHealth.map(formatFileHealth),
    `Entry counts: total=${entries.length}${statusSummary === "none" ? "" : ` (${statusSummary})`}`,
    entries.length ? "" : "No memory entries saved.",
    "Recent injection:",
    `- ids=${recentIds.length ? recentIds.join(",") : "none"}`,
    `- reasons=${recentReasons.length ? recentReasons.join(",") : "none"}`,
    `- matched=${recentIds.map((id) => `${id}:${(injection?.matchedReasons?.[id] ?? []).join(",") || "unknown"}`).join("; ") || "none"}`,
    `- Dynamic block hash: ${injection?.dynamicBlockHash ?? "none"}`,
    `- Request hash: ${injection?.requestHash ?? "none"}`
  ].filter((line) => line !== "").join("\n");
}
function formatStats() {
  const entries = readEntries();
  const metrics = readJsonl(metricsFile());
  const feedback = readJsonl(feedbackFile());
  const injections = metrics.filter((m) => m.operation === "inject");
  const avgSelected = injections.length ? injections.reduce((sum, m) => sum + (m.selectedMemoryIds?.length ?? 0), 0) / injections.length : 0;
  const stickyReuse = injections.length ? injections.filter((m) => m.stickySetReused).length / injections.length : 0;
  const countsByStatus = countBy(entries, (entry) => entry.status);
  const feedbackCounts = countBy(feedback, (item) => item.kind ?? "unknown");
  return [
    "\u{1F4CA} Memory stats",
    `- memories: ${entries.length} (${Object.entries(countsByStatus).map(([k, v]) => `${k}=${v}`).join(", ") || "none"})`,
    `- injections: ${injections.length}`,
    `- avg selected memories: ${avgSelected.toFixed(2)}`,
    `- sticky reuse rate: ${(stickyReuse * 100).toFixed(1)}%`,
    `- feedback: ${Object.entries(feedbackCounts).map(([k, v]) => `${k}=${v}`).join(", ") || "none"}`
  ].join("\n");
}
function countBy(items, keyFn) {
  return items.reduce((acc, item) => {
    const key = keyFn(item);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

// target/.claude/hooks/src/memory-cli.ts
var [, , command, ...rest] = process.argv;
var body = rest.join(" ").trim();
function cmdRemember() {
  if (!body) {
    console.log("Usage: /memory remember <durable memory text>");
    process.exitCode = 1;
    return;
  }
  const saved = saveMemoryText(body, "remember");
  if (!saved.ok) {
    console.log(saved.message);
    return;
  }
  console.log(`Memory saved: ${saved.entry.memoryId}
${renderEntryLine(saved.entry)}`);
}
function cmdList() {
  const entries = readEntries().filter(
    (e) => ["active", "candidate", "disabled", "deprecated", "superseded"].includes(e.status)
  );
  console.log(formatMemoryList(entries.slice(-20)));
}
function cmdSearch() {
  if (!body) {
    console.log("Usage: /memory search <query>");
    process.exitCode = 1;
    return;
  }
  const matches = searchMemory(body, { includeDisabled: true, limit: 10 });
  appendMetric(metricFromMatches("search", body, matches, matches));
  console.log(formatMatches(matches));
}
function cmdShow(id) {
  const entry = id ? findEntry(id) : null;
  console.log(entry ? JSON.stringify(entry, null, 2) : `Memory not found: ${id ?? "<missing id>"}`);
}
function cmdSetStatus(action, id) {
  if (!id) {
    console.log(`Usage: /memory ${action} <id>`);
    process.exitCode = 1;
    return;
  }
  const existing = findEntry(id);
  if (!existing) {
    console.log(`Memory not found: ${id}`);
    process.exitCode = 1;
    return;
  }
  if (action === "enable") {
    const blockers = enableBlockers(existing);
    if (blockers.length > 0) {
      console.log(`Memory ${id} cannot be enabled:
- ${blockers.join("\n- ")}`);
      return;
    }
  }
  const status = action === "enable" ? "active" : action === "delete" ? "deprecated" : "disabled";
  const updated = updateEntry(id, (entry) => ({
    ...entry,
    status,
    updatedAt: nowIso(),
    governance: { ...entry.governance, autoInject: status === "active" ? "when-relevant" : "never" }
  }));
  if (!updated) {
    console.log(`Memory not found: ${id}`);
    return;
  }
  appendAudit(action, id, { status });
  if (action !== "enable" && wasRecentlyInjected(id)) {
    appendFeedback(id, action === "delete" ? "wrong" : "irrelevant", "inferred from immediate user action after injection");
  }
  console.log(`Memory ${id} ${action === "delete" ? "deprecated" : status}.`);
}
function cmdSupersede(oldId, newId) {
  if (!oldId || !newId) {
    console.log("Usage: /memory supersede <oldId> <newId>");
    process.exitCode = 1;
    return;
  }
  const result = supersedeMemory(oldId, newId);
  if (!result.ok) {
    const message = result.reason === "self-supersede" ? "Cannot supersede a memory with itself." : result.reason === "old-not-found" ? `Memory not found: ${oldId}` : `Memory not found: ${newId}`;
    console.log(message);
    return;
  }
  console.log(`Memory ${oldId} superseded by ${newId}.`);
}
function cmdMerge(args) {
  const [survivorId, ...mergedIds] = args;
  if (!survivorId || mergedIds.length === 0) {
    console.log("Usage: /memory merge <survivorId> <id2> [<id3> ...]");
    process.exitCode = 1;
    return;
  }
  if (!findEntry(survivorId)) {
    console.log(`Memory not found: ${survivorId}`);
    return;
  }
  for (const id of mergedIds) {
    if (id === survivorId) {
      console.log(`Cannot merge a memory with itself: ${id}`);
      return;
    }
    if (!findEntry(id)) {
      console.log(`Memory not found: ${id}`);
      return;
    }
  }
  for (const id of mergedIds) supersedeMemory(id, survivorId);
  console.log(`Merged ${mergedIds.join(", ")} into ${survivorId}.`);
}
function cmdFeedback(args) {
  const [id, kind] = args;
  if (!id || !kind || !["helpful", "irrelevant", "wrong", "stale"].includes(kind)) {
    console.log("Usage: /memory feedback <id> helpful|irrelevant|wrong|stale");
    process.exitCode = 1;
    return;
  }
  appendFeedback(id, kind, args.slice(2).join(" "));
  if (kind === "helpful") promoteMemory(id, "helpful-feedback", "feedback");
  if (kind === "wrong") {
    updateEntry(id, (entry) => ({ ...entry, status: "disabled", updatedAt: nowIso(), governance: { ...entry.governance, autoInject: "never" } }));
    appendAudit("auto-demote", id, { reason: "wrong-feedback", status: "disabled" });
  }
  if (kind === "stale") {
    updateEntry(id, (entry) => ({ ...entry, updatedAt: nowIso(), lifecycle: { ...entry.lifecycle, staleness: "stale" }, governance: { ...entry.governance, autoInject: "never" } }));
    appendAudit("auto-demote", id, { reason: "stale-feedback", autoInject: "never" });
  }
  appendMetric({ operation: "feedback", selectedMemoryIds: [id], feedback: kind });
  console.log(`Memory feedback recorded: ${id} ${kind}`);
}
function cmdMissed() {
  if (!body) {
    console.log("Usage: /memory missed <query-or-description>");
    process.exitCode = 1;
    return;
  }
  appendJsonl(feedbackFile(), {
    schemaVersion: 1,
    timestamp: nowIso(),
    kind: "missed",
    descriptionHash: sha256(body),
    descriptionPreview: body.slice(0, 160)
  });
  appendMetric({ operation: "feedback", requestHash: sha256(body), missed: true });
  console.log("Missed-memory feedback recorded. Use /memory search to locate or /memory remember to add it.");
}
function main() {
  switch (command) {
    case "remember":
      return cmdRemember();
    case "list":
      return cmdList();
    case "search":
      return cmdSearch();
    case "show":
      return cmdShow(rest[0]);
    case "disable":
    case "enable":
    case "delete":
      return cmdSetStatus(command, rest[0]);
    case "supersede":
      return cmdSupersede(rest[0], rest[1]);
    case "merge":
      return cmdMerge(rest);
    case "feedback":
      return cmdFeedback(rest);
    case "missed":
      return cmdMissed();
    case "explain":
      return console.log(formatExplain(readInjectionState()));
    case "doctor":
      return console.log(formatDoctor());
    case "stats":
      return console.log(formatStats());
    default:
      console.log("Usage: memory-cli.cjs list|search|show|remember|disable|enable|delete|explain|doctor|stats|feedback|missed|supersede|merge");
      process.exitCode = 1;
  }
}
main();
