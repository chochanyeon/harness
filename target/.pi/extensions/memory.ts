/**
 * memory.ts — Pi Extension
 *
 * Small, user-governable external memory layer for LLM-augmented development.
 * MVP intentionally favors manual active memories, deterministic retrieval, and
 * tracking over broad automatic memory writing.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
  MEMORY_POLICY,
  saveMemoryText,
  formatSavedMemoryToolResult,
  entriesFile,
  findEntry,
  recordCandidateUse,
  canPromoteMemory,
  checkLlmPromotionEvidence,
  promoteMemory,
  agentsMdStatus,
  updateEntry,
  appendAudit,
  appendMetric,
  readEntries,
  formatMemoryList,
  searchMemory,
  formatMatches,
  enableBlockers,
  supersedeMemory,
  appendFeedback,
  wasRecentlyInjected,
  appendJsonl,
  feedbackFile,
  sha256,
  nowIso,
  formatExplain,
  readInjectionState,
  formatDoctor,
  formatStats,
  renderEntryLine,
  metricFromMatches,
  extractRequestText,
  extractCurrentPhase,
  autoExtractMemory,
  selectMemories,
  renderMemoryBlock,
  writeJson,
  injectionStateFile,
  searchCandidateMemory,
  renderCandidateShortlist,
  searchAgentsMdPromotionCandidates,
  renderAgentsMdPromotionShortlist,
  type MemoryStatus,
  type FeedbackKind,
} from "./memory/core";

export default function (pi: ExtensionAPI) {
  const state = {
    lastInjection: null as null | {
      timestamp: string;
      requestHash: string;
      selectedMemoryIds: string[];
      selectedRenderHashes: string[];
      selectedScores?: Record<string, number>;
      dynamicBlockHash: string;
      matchedReasons: Record<string, string[]>;
    },
    llmPromotionCount: 0,
  };

  pi.registerTool({
    name: "memory_remember",
    label: "Remember external memory",
    description: [
      "Save durable, reusable project memory for future prompts.",
      "Use for explicit user memory intent or high-value lessons/rules that should persist across sessions.",
      "Do not use for raw secrets, credentials, one-off transient facts, or unverified guesses.",
    ].join(" "),
    parameters: Type.Object({
      text: Type.String({ description: "Durable memory text to save. Must not contain raw secrets or credentials." }),
    }),
    async execute(_toolCallId, params) {
      const text = String(params.text ?? "").trim();
      if (!text) {
        return { content: [{ type: "text", text: "Memory not saved: text is required." }], details: { ok: false } };
      }
      const saved = saveMemoryText(text, "memory_remember");
      if (!saved.ok) {
        return { content: [{ type: "text", text: saved.message }], details: { ok: false, reason: saved.reason } };
      }
      return {
        content: [{ type: "text", text: formatSavedMemoryToolResult(saved.entry) }],
        details: { ok: true, memoryId: saved.entry.memoryId, status: saved.entry.status, path: entriesFile() },
      };
    },
  });

  pi.registerTool({
    name: "memory_use_candidate",
    label: "Use candidate memory this turn",
    description: [
      "Pull one candidate (unverified) memory's full content into the current turn without changing its status.",
      "Call this only when the candidate shortlist looks directly relevant to what you are doing right now.",
    ].join(" "),
    parameters: Type.Object({
      memoryId: Type.String({ description: "memoryId of a candidate-status memory from the candidate shortlist." }),
      relevanceReason: Type.String({ description: "Brief reason this candidate is relevant to the current turn." }),
    }),
    async execute(_toolCallId, params) {
      const memoryId = String(params.memoryId ?? "");
      const relevanceReason = String(params.relevanceReason ?? "");
      const entry = findEntry(memoryId);
      if (!entry) {
        return { content: [{ type: "text", text: "Memory not used: no memory with this id exists." }], details: { ok: false, reason: "memory-not-found" } };
      }
      if (entry.status !== "candidate") {
        return { content: [{ type: "text", text: "Memory not used: this memory is not in candidate status." }], details: { ok: false, reason: "not-a-candidate" } };
      }
      recordCandidateUse(entry, relevanceReason);
      const text = entry.content.details ? `${entry.content.summary}\n${entry.content.details}` : entry.content.summary;
      return { content: [{ type: "text", text }], details: { ok: true, memoryId: entry.memoryId, status: entry.status } };
    },
  });

  pi.registerTool({
    name: "memory_promote_candidate",
    label: "Promote candidate memory to active",
    description: [
      "Promote a candidate (unverified) memory to active status using your own real-time judgment of a trigger signal.",
      "Use only when the user explicitly confirmed the fact, the same fact was repeated and confirmed again, or a task that relied on the fact just succeeded.",
      "Evidence must describe the concrete signal; this is capped per session and audited.",
    ].join(" "),
    parameters: Type.Object({
      memoryId: Type.String({ description: "memoryId of the candidate memory to promote." }),
      triggerKind: Type.Union([Type.Literal("explicit-confirmation"), Type.Literal("repeated-confirmation"), Type.Literal("task-success")], { description: "Which concrete trigger signal justifies this promotion." }),
      evidence: Type.String({ description: "Concrete description of the trigger signal (at least 15 characters)." }),
    }),
    async execute(_toolCallId, params) {
      const memoryId = String(params.memoryId ?? "");
      const triggerKind = String(params.triggerKind ?? "");
      const evidence = String(params.evidence ?? "");
      const entry = findEntry(memoryId);
      if (!entry) {
        return { content: [{ type: "text", text: "Memory not promoted: no memory with this id exists." }], details: { ok: false, reason: "memory-not-found" } };
      }
      if (!canPromoteMemory(entry)) {
        return { content: [{ type: "text", text: `Memory not promoted: entry is not promotable (status=${entry.status}).` }], details: { ok: false, reason: "not-promotable" } };
      }
      const evidenceProblem = checkLlmPromotionEvidence(evidence);
      if (evidenceProblem) {
        return { content: [{ type: "text", text: evidenceProblem }], details: { ok: false, reason: "insufficient-evidence" } };
      }
      if (state.llmPromotionCount >= 5) {
        return {
          content: [{ type: "text", text: "Memory not promoted: session cap of 5 LLM-initiated promotions reached. Use /memory feedback <id> helpful instead." }],
          details: { ok: false, reason: "session-cap-reached" },
        };
      }
      const promoted = promoteMemory(memoryId, triggerKind, "llm-judgment", evidence);
      if (!promoted) {
        return { content: [{ type: "text", text: "Memory not promoted: entry is not promotable." }], details: { ok: false, reason: "not-promotable" } };
      }
      state.llmPromotionCount += 1;
      return {
        content: [{ type: "text", text: `Memory promoted to active: ${promoted.memoryId}` }],
        details: { ok: true, memoryId: promoted.memoryId, status: "active", sessionPromotionCount: state.llmPromotionCount },
      };
    },
  });

  pi.registerTool({
    name: "memory_propose_agents_promotion",
    label: "Propose promoting memory into AGENTS.md",
    description: [
      "Record that you are presenting an AGENTS.md addition suggestion to the user for a repeatedly validated memory.",
      "Call this only when you actually present the suggestion to the user in this reply. Never edit AGENTS.md before the user explicitly approves.",
    ].join(" "),
    parameters: Type.Object({
      memoryId: Type.String({ description: "memoryId of the AGENTS.md promotion candidate." }),
      proposedText: Type.String({ description: "Exact wording you are suggesting to add to AGENTS.md." }),
    }),
    async execute(_toolCallId, params) {
      const memoryId = String(params.memoryId ?? "");
      const proposedText = String(params.proposedText ?? "");
      const entry = findEntry(memoryId);
      if (!entry) {
        return { content: [{ type: "text", text: "Not proposed: no memory with this id exists." }], details: { ok: false, reason: "memory-not-found" } };
      }
      const currentStatus = agentsMdStatus(entry);
      if (currentStatus !== "none") {
        return { content: [{ type: "text", text: `Not proposed: this memory's AGENTS.md proposal status is already '${currentStatus}'.` }], details: { ok: false, reason: "already-processed" } };
      }
      updateEntry(memoryId, (current) => ({ ...current, governance: { ...current.governance, agentsMdProposalStatus: "proposed" } }));
      appendAudit("agents-md-proposed", memoryId, { proposedText });
      appendMetric({ operation: "agents-md-proposed", selectedMemoryIds: [memoryId] });
      return {
        content: [{ type: "text", text: `Marked as proposed for AGENTS.md: ${memoryId}` }],
        details: { ok: true, memoryId, status: "proposed" },
      };
    },
  });

  pi.registerTool({
    name: "memory_record_agents_decision",
    label: "Record AGENTS.md promotion decision",
    description: [
      "Record the user's accept or decline decision after you presented an AGENTS.md addition suggestion.",
      "Call this only after the user has explicitly answered in conversation. This does not edit AGENTS.md itself.",
    ].join(" "),
    parameters: Type.Object({
      memoryId: Type.String({ description: "memoryId of the memory that was proposed." }),
      decision: Type.Union([Type.Literal("accepted"), Type.Literal("declined")], { description: "The user's decision." }),
      note: Type.String({ description: "Brief note about the decision context." }),
    }),
    async execute(_toolCallId, params) {
      const memoryId = String(params.memoryId ?? "");
      const decision = String(params.decision ?? "") as "accepted" | "declined";
      const note = String(params.note ?? "");
      const entry = findEntry(memoryId);
      if (!entry) {
        return { content: [{ type: "text", text: "Not recorded: no memory with this id exists." }], details: { ok: false, reason: "memory-not-found" } };
      }
      const currentStatus = agentsMdStatus(entry);
      if (currentStatus !== "proposed") {
        return { content: [{ type: "text", text: `Not recorded: this memory's AGENTS.md proposal status is '${currentStatus}', not 'proposed'.` }], details: { ok: false, reason: "not-proposed" } };
      }
      updateEntry(memoryId, (current) => ({ ...current, governance: { ...current.governance, agentsMdProposalStatus: decision } }));
      appendAudit("agents-md-decision", memoryId, { decision, note });
      appendMetric({ operation: "agents-md-decision", selectedMemoryIds: [memoryId], decision });
      return {
        content: [{ type: "text", text: `AGENTS.md proposal decision recorded: ${memoryId} -> ${decision}` }],
        details: { ok: true, memoryId, status: decision },
      };
    },
  });

  pi.registerCommand("memory", {
    description: "Manage external memory used for task-specific LLM context.",
    getArgumentCompletions: (prefix) => [
      "list", "search", "show", "remember", "disable", "enable", "delete", "explain", "doctor", "stats", "feedback", "missed", "supersede", "merge",
    ].filter((value) => value.startsWith(prefix)).map((value) => ({ value, label: value })),
    handler: async (args, ctx) => {
      const trimmed = args.trim();
      const [command = "list", ...rest] = trimmed.split(/\s+/).filter(Boolean);
      const body = trimmed.slice(command.length).trim();

      if (command === "remember") {
        if (!body) return ctx.ui.notify("Usage: /memory remember <durable memory text>", "warning");
        const saved = saveMemoryText(body, "remember");
        if (!saved.ok) return ctx.ui.notify(saved.message, "warning");
        return ctx.ui.notify(`Memory saved: ${saved.entry.memoryId}\n${renderEntryLine(saved.entry)}`, "info");
      }

      if (command === "list") {
        const entries = readEntries().filter((entry) => ["active", "candidate", "disabled", "deprecated", "superseded"].includes(entry.status));
        return ctx.ui.notify(formatMemoryList(entries.slice(-20)), "info");
      }

      if (command === "search") {
        if (!body) return ctx.ui.notify("Usage: /memory search <query>", "warning");
        const matches = searchMemory(body, { includeDisabled: true, limit: 10 });
        appendMetric(metricFromMatches("search", body, matches, matches));
        return ctx.ui.notify(formatMatches(matches), "info");
      }

      if (command === "show") {
        const id = rest[0];
        const entry = id ? findEntry(id) : null;
        return ctx.ui.notify(entry ? JSON.stringify(entry, null, 2) : `Memory not found: ${id ?? "<missing id>"}`, entry ? "info" : "warning");
      }

      if (command === "disable" || command === "enable" || command === "delete") {
        const id = rest[0];
        if (!id) return ctx.ui.notify(`Usage: /memory ${command} <id>`, "warning");
        const existing = findEntry(id);
        if (!existing) return ctx.ui.notify(`Memory not found: ${id}`, "warning");
        if (command === "enable") {
          const blockers = enableBlockers(existing);
          if (blockers.length > 0) return ctx.ui.notify(`Memory ${id} cannot be enabled:\n- ${blockers.join("\n- ")}`, "warning");
        }
        const status: MemoryStatus = command === "enable" ? "active" : command === "delete" ? "deprecated" : "disabled";
        const updated = updateEntry(id, (entry) => ({
          ...entry,
          status,
          updatedAt: nowIso(),
          governance: { ...entry.governance, autoInject: status === "active" ? "when-relevant" : "never" },
        }));
        if (!updated) return ctx.ui.notify(`Memory not found: ${id}`, "warning");
        appendAudit(command, id, { status });
        if (command !== "enable" && wasRecentlyInjected(id)) appendFeedback(id, command === "delete" ? "wrong" : "irrelevant", "inferred from immediate user action after injection");
        return ctx.ui.notify(`Memory ${id} ${command === "delete" ? "deprecated" : status}.`, "info");
      }

      if (command === "supersede") {
        const oldId = rest[0];
        const newId = rest[1];
        if (!oldId || !newId) return ctx.ui.notify("Usage: /memory supersede <oldId> <newId>", "warning");
        const result = supersedeMemory(oldId, newId);
        if (!result.ok) {
          const message = result.reason === "self-supersede"
            ? "Cannot supersede a memory with itself."
            : result.reason === "old-not-found"
              ? `Memory not found: ${oldId}`
              : `Memory not found: ${newId}`;
          return ctx.ui.notify(message, "warning");
        }
        return ctx.ui.notify(`Memory ${oldId} superseded by ${newId}.`, "info");
      }

      if (command === "merge") {
        const survivorId = rest[0];
        const mergedIds = rest.slice(1);
        if (!survivorId) return ctx.ui.notify("Usage: /memory merge <survivorId> <id2> [<id3> ...]", "warning");
        if (mergedIds.length === 0) return ctx.ui.notify("Usage: /memory merge <survivorId> <id2> [<id3> ...]", "warning");
        if (!findEntry(survivorId)) return ctx.ui.notify(`Memory not found: ${survivorId}`, "warning");
        for (const id of mergedIds) {
          if (id === survivorId) return ctx.ui.notify(`Cannot merge a memory with itself: ${id}`, "warning");
          if (!findEntry(id)) return ctx.ui.notify(`Memory not found: ${id}`, "warning");
        }
        for (const id of mergedIds) supersedeMemory(id, survivorId);
        return ctx.ui.notify(`Merged ${mergedIds.join(", ")} into ${survivorId}.`, "info");
      }

      if (command === "feedback") {
        const id = rest[0];
        const kind = rest[1] as FeedbackKind | undefined;
        if (!id || !kind || !["helpful", "irrelevant", "wrong", "stale"].includes(kind)) {
          return ctx.ui.notify("Usage: /memory feedback <id> helpful|irrelevant|wrong|stale", "warning");
        }
        appendFeedback(id, kind, body.split(/\s+/).slice(2).join(" "));
        if (kind === "helpful") promoteMemory(id, "helpful-feedback", "feedback");
        if (kind === "wrong") {
          updateEntry(id, (entry) => ({ ...entry, status: "disabled", updatedAt: nowIso(), governance: { ...entry.governance, autoInject: "never" } }));
          appendAudit("auto-demote", id, { reason: "wrong-feedback", status: "disabled" });
          appendMetric({ operation: "auto-demote", selectedMemoryIds: [id], reason: "wrong-feedback" });
        }
        if (kind === "stale") {
          updateEntry(id, (entry) => ({ ...entry, updatedAt: nowIso(), lifecycle: { ...entry.lifecycle, staleness: "stale" }, governance: { ...entry.governance, autoInject: "never" } }));
          appendAudit("auto-demote", id, { reason: "stale-feedback", autoInject: "never" });
          appendMetric({ operation: "auto-demote", selectedMemoryIds: [id], reason: "stale-feedback" });
        }
        appendMetric({ operation: "feedback", selectedMemoryIds: [id], feedback: kind });
        return ctx.ui.notify(`Memory feedback recorded: ${id} ${kind}`, "info");
      }

      if (command === "missed") {
        if (!body) return ctx.ui.notify("Usage: /memory missed <query-or-description>", "warning");
        appendJsonl(feedbackFile(), { schemaVersion: 1, timestamp: nowIso(), kind: "missed", descriptionHash: sha256(body), descriptionPreview: body.slice(0, 160) });
        appendMetric({ operation: "feedback", requestHash: sha256(body), missed: true });
        return ctx.ui.notify("Missed-memory feedback recorded. Use /memory search to locate or /memory remember to add it.", "info");
      }

      if (command === "explain") {
        return ctx.ui.notify(formatExplain(state.lastInjection ?? readInjectionState()), "info");
      }

      if (command === "doctor") {
        return ctx.ui.notify(formatDoctor(), "info");
      }

      if (command === "stats") {
        return ctx.ui.notify(formatStats(), "info");
      }

      return ctx.ui.notify("Usage: /memory list|search|show|remember|disable|enable|delete|explain|doctor|stats|feedback|missed", "warning");
    },
  });

  pi.on("before_agent_start", async (event) => {
    const request = extractRequestText(event as any);
    const currentPhase = extractCurrentPhase(event as any, request);
    if (request) autoExtractMemory(request);
    const matches = request ? searchMemory(request, { includeDisabled: false, limit: 12, currentPhase }) : [];
    const selected = selectMemories(request, matches, 3);
    const dynamic = renderMemoryBlock(selected);
    const injection = { timestamp: nowIso(), requestHash: sha256(request), selectedMemoryIds: selected.map((m) => m.entry.memoryId), selectedRenderHashes: selected.map((m) => m.renderHash), selectedScores: Object.fromEntries(selected.map((m) => [m.entry.memoryId, m.score])), dynamicBlockHash: sha256(dynamic), matchedReasons: Object.fromEntries(selected.map((m) => [m.entry.memoryId, m.matchedReasons])) };
    state.lastInjection = injection;
    writeJson(injectionStateFile(), injection);
    appendMetric(metricFromMatches("inject", request, matches, selected, dynamic));
    const candidateMatches = request ? searchCandidateMemory(request, currentPhase, 5) : [];
    const candidateBlock = renderCandidateShortlist(candidateMatches);
    const agentsMdCandidates = searchAgentsMdPromotionCandidates(5);
    const agentsMdBlock = renderAgentsMdPromotionShortlist(agentsMdCandidates);
    return { systemPrompt: event.systemPrompt + MEMORY_POLICY + dynamic + candidateBlock + agentsMdBlock };
  });
}
