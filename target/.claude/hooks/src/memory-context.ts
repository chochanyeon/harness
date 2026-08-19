import * as fs from "node:fs";
import {
  autoExtractMemory,
  searchMemory,
  selectMemories,
  renderMemoryBlock,
  searchCandidateMemory,
  renderCandidateShortlist,
  searchAgentsMdPromotionCandidates,
  renderAgentsMdPromotionShortlist,
  readEntries,
  writeJson,
  injectionStateFile,
  nowIso,
  sha256,
  appendMetric,
  metricFromMatches,
} from "../../../.pi/extensions/memory/core";

function readStdinJson(): any {
  try {
    const raw = fs.readFileSync(0, "utf8").trim();
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function emitContext(hookEventName: string, message: string): void {
  if (!message) process.exit(0);
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName, additionalContext: message } }));
  process.exit(0);
}

function buildInjection(request: string): string {
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
    matchedReasons: Object.fromEntries(selected.map((m) => [m.entry.memoryId, m.matchedReasons])),
  });
  appendMetric(metricFromMatches("inject", request, matches, selected, dynamic));
  const candidateBlock = renderCandidateShortlist(searchCandidateMemory(request, undefined, 5));
  const agentsMdBlock = renderAgentsMdPromotionShortlist(searchAgentsMdPromotionCandidates(5));
  return [dynamic, candidateBlock, agentsMdBlock].filter(Boolean).join("\n");
}

function main(): void {
  const [, , command] = process.argv;
  const input = readStdinJson();

  if (command === "session-start") {
    const activeCount = readEntries().filter((e) => e.status === "active").length;
    const message =
      activeCount > 0
        ? `[External Memory] ${activeCount} active memory entr${activeCount === 1 ? "y" : "ies"} available. Use /memory list to browse or /memory search <query>.`
        : "";
    emitContext("SessionStart", message);
    return;
  }

  if (command === "user-prompt") {
    const request = String(input.prompt ?? "").trim();
    emitContext("UserPromptSubmit", buildInjection(request));
    return;
  }

  process.exit(0);
}

main();
