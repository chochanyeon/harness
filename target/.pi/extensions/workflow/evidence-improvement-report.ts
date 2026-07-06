import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { getGitRoot } from "./git";

export type EvidenceImprovementSeverity = "blocker" | "critical" | "major" | "warning" | "info";

export type EvidenceImprovementFinding = {
  category: string;
  improvementKind: string;
  severity: EvidenceImprovementSeverity;
  occurrences: number;
  recommendation: string;
  targetFilesHint: string[];
  acceptanceCriteria: string[];
  evidenceRefs: string[];
};

export type EvidenceImprovementReportOptions = {
  root?: string;
  workflowId?: string | null;
  now?: Date;
  limit?: number;
  includeMemoryAudit?: boolean;
  includeLedger?: boolean;
};

export type EvidenceImprovementReport = {
  path: string;
  markdown: string;
  findings: EvidenceImprovementFinding[];
  inputSummary: {
    fieldEventsRead: number;
    fieldEventsIncluded: number;
    fieldEventsSkipped: number;
    auditEventsRead: number;
    memoryAuditEventsRead: number;
    ledgerIncluded: boolean;
  };
};

type JsonObject = Record<string, any>;

type Group = {
  category: string;
  improvementKind: string;
  severity: EvidenceImprovementSeverity;
  recommendation: string;
  targetFilesHint: Set<string>;
  acceptanceCriteria: Set<string>;
  evidenceRefs: string[];
  occurrences: number;
};

const MEMORY_DIR = path.join(".project-memory", "harness");
const EVENTS_FILE = "events.jsonl";
const AUDIT_FILE = "audit.jsonl";
const ARTIFACTS_DIR = path.join(".ai", "workflow-artifacts");
const SEVERITY_ORDER: EvidenceImprovementSeverity[] = ["blocker", "critical", "major", "warning", "info"];

function projectRoot(explicitRoot?: string): string {
  return explicitRoot || process.env.HARNESS_FIELD_LOG_ROOT || getGitRoot() || process.cwd();
}

function readJsonl(file: string, max = 500): JsonObject[] {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf-8")
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-max)
    .map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter(Boolean);
}

function shortHash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 10);
}

function timestampForFile(now: Date): string {
  return now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
}

function sanitize(value: unknown, root: string, fallback = "unknown"): string {
  const raw = String(value ?? fallback);
  const normalizedRoot = root.replace(/\\/g, "/");
  return raw
    .replaceAll(root, "<PROJECT_ROOT>")
    .replaceAll(normalizedRoot, "<PROJECT_ROOT>")
    .replace(/https?:\/\/[^\s)]+/g, "<URL>")
    .replace(/([A-Za-z0-9_\-.]*?(?:secret|token|password|credential|apikey|api_key)[A-Za-z0-9_\-.]*?)\s*[:=]?\s*[A-Za-z0-9_\-./+=]{6,}/gi, "<REDACTED_SECRET>")
    .slice(0, 220);
}

function normalizeSeverity(value: unknown): EvidenceImprovementSeverity {
  const severity = String(value ?? "info");
  return (SEVERITY_ORDER.includes(severity as EvidenceImprovementSeverity) ? severity : "info") as EvidenceImprovementSeverity;
}

function strongerSeverity(a: EvidenceImprovementSeverity, b: EvidenceImprovementSeverity): EvidenceImprovementSeverity {
  return SEVERITY_ORDER.indexOf(a) <= SEVERITY_ORDER.indexOf(b) ? a : b;
}

function arrayOfStrings(value: unknown, root: string): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => sanitize(item, root, "")).filter(Boolean).slice(0, 8);
}

function findingKey(event: JsonObject): string {
  const category = String(event?.event?.category ?? "unknown");
  const packet = event?.llmAnalysisPacket ?? {};
  const kind = String(packet.improvementKind ?? "unknown");
  const candidate = String(packet.candidateChange ?? packet.problemForHarnessRepo ?? "unknown");
  return `${category}\u0000${kind}\u0000${candidate}`;
}

function eventIsExportable(event: JsonObject): boolean {
  return event?.privacy?.exportableToHarnessRepo === true;
}

function eventRef(event: JsonObject, root: string): string {
  const id = sanitize(event?.eventId ?? "event", root);
  const time = sanitize(event?.timestamp ?? "unknown-time", root);
  return `${id}@${time}`;
}

function fallbackRecommendation(event: JsonObject, root: string): string {
  const category = sanitize(event?.event?.category, root);
  const type = sanitize(event?.event?.type, root);
  return `Investigate repeated ${category} ${type} evidence and add a regression guard.`;
}

function buildFindings(events: JsonObject[], root: string): EvidenceImprovementFinding[] {
  const groups = new Map<string, Group>();

  for (const event of events) {
    const packet = event?.llmAnalysisPacket ?? {};
    const key = findingKey(event);
    const category = sanitize(event?.event?.category, root);
    const improvementKind = sanitize(packet.improvementKind, root);
    const severity = normalizeSeverity(event?.event?.severity);
    const recommendation = sanitize(packet.candidateChange ?? packet.problemForHarnessRepo ?? fallbackRecommendation(event, root), root);
    const existing = groups.get(key);
    const group = existing ?? {
      category,
      improvementKind,
      severity,
      recommendation,
      targetFilesHint: new Set<string>(),
      acceptanceCriteria: new Set<string>(),
      evidenceRefs: [],
      occurrences: 0,
    };
    group.occurrences += 1;
    group.severity = strongerSeverity(group.severity, severity);
    for (const file of arrayOfStrings(packet.targetFilesHint, root)) group.targetFilesHint.add(file);
    for (const criterion of arrayOfStrings(packet.acceptanceCriteria, root)) group.acceptanceCriteria.add(criterion);
    group.evidenceRefs.push(eventRef(event, root));
    groups.set(key, group);
  }

  return [...groups.values()]
    .map((group) => ({
      category: group.category,
      improvementKind: group.improvementKind,
      severity: group.severity,
      occurrences: group.occurrences,
      recommendation: group.recommendation,
      targetFilesHint: [...group.targetFilesHint].slice(0, 8),
      acceptanceCriteria: [...group.acceptanceCriteria].slice(0, 8),
      evidenceRefs: group.evidenceRefs.slice(0, 8),
    }))
    .sort((a, b) => b.occurrences - a.occurrences || SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) || a.category.localeCompare(b.category));
}

function countBy(values: string[]): string {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([value, count]) => `${value}=${count}`)
    .join(", ") || "none";
}

function readLedger(root: string, workflowId: string | null | undefined): JsonObject | null {
  if (!workflowId) return null;
  const file = path.join(root, ".ai", "interview", "runs", workflowId, "ledger.json");
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, "utf-8")); } catch { return null; }
}

function renderMarkdown(params: {
  root: string;
  now: Date;
  findings: EvidenceImprovementFinding[];
  fieldEvents: JsonObject[];
  includedEvents: JsonObject[];
  skippedEvents: number;
  auditEvents: JsonObject[];
  memoryAuditEvents: JsonObject[];
  ledger: JsonObject | null;
}): string {
  const { root, now, findings, fieldEvents, includedEvents, skippedEvents, auditEvents, memoryAuditEvents, ledger } = params;
  const lines: string[] = [
    "# Harness Improvement Report",
    "",
    `Generated: ${now.toISOString()}`,
    "",
    "## Safety boundary",
    "",
    "- Local evidence only was read.",
    "- Raw log excerpts, prompts, transcripts, and non-exportable events are not copied into this report.",
    "- No automatic code changes were made.",
    "",
    "## Evidence summary",
    "",
    `- Field events read: ${fieldEvents.length}`,
    `- Field events included: ${includedEvents.length}`,
    `- Field events skipped: ${skippedEvents}`,
    `- Workflow audit events read: ${auditEvents.length}`,
    `- Memory audit events read: ${memoryAuditEvents.length}`,
    `- Included field categories: ${countBy(includedEvents.map((event) => sanitize(event?.event?.category, root)))}`,
    `- Included severities: ${countBy(includedEvents.map((event) => sanitize(event?.event?.severity, root)))}`,
  ];

  if (ledger) {
    lines.push(`- Ledger phase: ${sanitize(ledger.phase, root)}`);
    lines.push(`- Ledger next action: ${sanitize(ledger.next, root, "not recorded")}`);
  }

  lines.push("", "## Improvement candidates", "");

  if (findings.length === 0) {
    lines.push("No local harness evidence found that is safe to turn into an improvement proposal.", "");
  } else {
    findings.forEach((finding, index) => {
      lines.push(`### ${index + 1}. ${finding.category} → ${finding.improvementKind}`);
      lines.push("");
      lines.push(`- Severity: ${finding.severity}`);
      lines.push(`- Occurrences: ${finding.occurrences}`);
      lines.push(`- Recommendation: ${finding.recommendation}`);
      lines.push(`- Evidence refs: ${finding.evidenceRefs.map((ref) => `\`${ref}\``).join(", ") || "none"}`);
      lines.push("- Target files:");
      if (finding.targetFilesHint.length === 0) lines.push("  - unknown; inspect owning workflow module before editing");
      else finding.targetFilesHint.forEach((file) => lines.push(`  - ${file}`));
      lines.push("- Acceptance criteria:");
      if (finding.acceptanceCriteria.length === 0) lines.push("  - Add or update a regression test covering this evidence pattern.");
      else finding.acceptanceCriteria.forEach((criterion) => lines.push(`  - ${criterion}`));
      lines.push("");
    });
  }

  lines.push("## Residual risks", "");
  lines.push("- This report uses structured evidence packets; it does not perform LLM-based root-cause clustering yet.");
  lines.push("- Legacy records without explicit export approval are skipped conservatively.");
  lines.push("- Human/agent review is still required before implementing any proposed change.");
  lines.push("");

  return `${lines.join("\n")}\n`;
}

export function generateEvidenceImprovementReport(options: EvidenceImprovementReportOptions = {}): EvidenceImprovementReport {
  const root = projectRoot(options.root);
  const now = options.now ?? new Date();
  const limit = options.limit ?? 500;
  const fieldEvents = readJsonl(path.join(root, MEMORY_DIR, EVENTS_FILE), limit);
  const includedEvents = fieldEvents.filter(eventIsExportable);
  const auditEvents = readJsonl(path.join(root, MEMORY_DIR, AUDIT_FILE), limit);
  const memoryAuditEvents = options.includeMemoryAudit === false ? [] : readJsonl(path.join(root, ".project-memory", "memory", "audit.jsonl"), limit);
  const ledger = options.includeLedger === false ? null : readLedger(root, options.workflowId);
  const findings = buildFindings(includedEvents, root);
  const markdown = renderMarkdown({
    root,
    now,
    findings,
    fieldEvents,
    includedEvents,
    skippedEvents: fieldEvents.length - includedEvents.length,
    auditEvents,
    memoryAuditEvents,
    ledger,
  });
  const workflowPart = options.workflowId ? String(options.workflowId).replace(/[^A-Za-z0-9_.-]/g, "-") : "standalone";
  const dir = path.join(root, ARTIFACTS_DIR, workflowPart);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `harness-improvement-report-${timestampForFile(now)}-${shortHash(markdown)}.md`);
  fs.writeFileSync(file, markdown, "utf-8");
  return {
    path: file,
    markdown,
    findings,
    inputSummary: {
      fieldEventsRead: fieldEvents.length,
      fieldEventsIncluded: includedEvents.length,
      fieldEventsSkipped: fieldEvents.length - includedEvents.length,
      auditEventsRead: auditEvents.length,
      memoryAuditEventsRead: memoryAuditEvents.length,
      ledgerIncluded: Boolean(ledger),
    },
  };
}
