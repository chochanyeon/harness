import {
  saveMemoryText,
  readEntries,
  findEntry,
  updateEntry,
  supersedeMemory,
  formatMemoryList,
  formatMatches,
  formatExplain,
  formatDoctor,
  formatStats,
  searchMemory,
  appendAudit,
  appendFeedback,
  appendMetric,
  appendJsonl,
  feedbackFile,
  sha256,
  nowIso,
  renderEntryLine,
  metricFromMatches,
  wasRecentlyInjected,
  enableBlockers,
  promoteMemory,
  readInjectionState,
  type MemoryStatus,
  type FeedbackKind,
} from "../../../.pi/extensions/memory/core";

const [, , command, ...rest] = process.argv;
const body = rest.join(" ").trim();

function cmdRemember(): void {
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
  console.log(`Memory saved: ${saved.entry.memoryId}\n${renderEntryLine(saved.entry)}`);
}

function cmdList(): void {
  const entries = readEntries().filter((e) =>
    ["active", "candidate", "disabled", "deprecated", "superseded"].includes(e.status),
  );
  console.log(formatMemoryList(entries.slice(-20)));
}

function cmdSearch(): void {
  if (!body) {
    console.log("Usage: /memory search <query>");
    process.exitCode = 1;
    return;
  }
  const matches = searchMemory(body, { includeDisabled: true, limit: 10 });
  appendMetric(metricFromMatches("search", body, matches, matches));
  console.log(formatMatches(matches));
}

function cmdShow(id: string | undefined): void {
  const entry = id ? findEntry(id) : null;
  console.log(entry ? JSON.stringify(entry, null, 2) : `Memory not found: ${id ?? "<missing id>"}`);
}

function cmdSetStatus(action: "disable" | "enable" | "delete", id: string | undefined): void {
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
      console.log(`Memory ${id} cannot be enabled:\n- ${blockers.join("\n- ")}`);
      return;
    }
  }
  const status: MemoryStatus = action === "enable" ? "active" : action === "delete" ? "deprecated" : "disabled";
  const updated = updateEntry(id, (entry) => ({
    ...entry,
    status,
    updatedAt: nowIso(),
    governance: { ...entry.governance, autoInject: status === "active" ? "when-relevant" : "never" },
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

function cmdSupersede(oldId: string | undefined, newId: string | undefined): void {
  if (!oldId || !newId) {
    console.log("Usage: /memory supersede <oldId> <newId>");
    process.exitCode = 1;
    return;
  }
  const result = supersedeMemory(oldId, newId);
  if (!result.ok) {
    const message =
      result.reason === "self-supersede"
        ? "Cannot supersede a memory with itself."
        : result.reason === "old-not-found"
          ? `Memory not found: ${oldId}`
          : `Memory not found: ${newId}`;
    console.log(message);
    return;
  }
  console.log(`Memory ${oldId} superseded by ${newId}.`);
}

function cmdMerge(args: string[]): void {
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

function cmdFeedback(args: string[]): void {
  const [id, kind] = args as [string | undefined, FeedbackKind | undefined];
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

function cmdMissed(): void {
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
    descriptionPreview: body.slice(0, 160),
  });
  appendMetric({ operation: "feedback", requestHash: sha256(body), missed: true });
  console.log("Missed-memory feedback recorded. Use /memory search to locate or /memory remember to add it.");
}

function main(): void {
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
