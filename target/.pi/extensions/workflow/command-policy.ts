import * as path from "node:path";

import { writeTextArtifact, type ArtifactDescriptor } from "./artifact-descriptor";
import {
  COMMAND_CATALOG,
  PHASE_ALLOWED_BUILTIN_TOOLS,
  formatCatalogCommandResult,
  getCatalogCommand,
  getCatalogCommandsForPhase,
  getGitRoot,
  isPhaseAllowed,
  runCatalogCommand,
  type WorkflowPhase,
} from "./core";

export type WorkflowCatalogCommandState = {
  workflow: { id?: string; phase: WorkflowPhase } | null;
  recentVerificationCommands: Array<{ command: string; timestamp: number; phase?: WorkflowPhase }>;
};

export async function executeWorkflowCatalogCommand(
  state: WorkflowCatalogCommandState,
  commandId: string,
  ctx: any,
  userArgs: string[] = [],
): Promise<{ content: Array<{ type: "text"; text: string }>; details: Record<string, unknown> }> {
  const spec = getCatalogCommand(commandId);
  if (!spec) {
    const available = COMMAND_CATALOG.map((s) => `${s.id} — ${s.description}`).join("\n");
    return {
      content: [{ type: "text", text: `Unknown command ID: "${commandId}".\nAvailable:\n${available}` }],
      details: { ok: false, reason: "unknown-command" },
    };
  }
  if (userArgs.length > 0 && !spec.allowUserArgs) {
    return {
      content: [{ type: "text", text: `Command "${spec.id}" does not accept user-supplied args. Remove the args parameter.` }],
      details: { ok: false, reason: "user-args-not-allowed" },
    };
  }

  const phase = state.workflow?.phase ?? null;
  if (phase && !isPhaseAllowed(spec, phase)) {
    const allowed = getCatalogCommandsForPhase(phase).map((s) => s.id).join(", ") || "none";
    return {
      content: [{ type: "text", text: [
        `Command "${spec.id}" is not allowed in workflow phase "${phase}".`,
        `Allowed in this phase: ${allowed}`,
      ].join("\n") }],
      details: { ok: false, reason: "phase-not-allowed", phase, commandId: spec.id },
    };
  }

  if (spec.requiresApproval && ctx.hasUI) {
    const ok = await ctx.ui.confirm(
      `Run: ${spec.id}`,
      `${spec.description}\nRisk level: ${spec.riskLevel}`,
    );
    if (!ok) {
      return {
        content: [{ type: "text", text: `Command "${spec.id}" cancelled by user.` }],
        details: { ok: false, reason: "user-cancelled" },
      };
    }
  }

  const gitRoot = getGitRoot();
  const result = runCatalogCommand(spec, gitRoot, userArgs);
  const commandArtifact = writeCommandOutputArtifact(state, spec.id, result, gitRoot);
  const artifactNote = commandArtifact
    ? `\n\nCommand output artifact: ${path.relative(gitRoot ?? process.cwd(), commandArtifact.path)} (${commandArtifact.sizeBytes} bytes, sha256=${commandArtifact.sha256.slice(0, 12)}…)`
    : "";
  const formatted = `${formatCatalogCommandResult(result, spec)}${artifactNote}`;

  if (["code-quality", "project-test"].includes(spec.id)) {
    state.recentVerificationCommands.push({ command: spec.id, timestamp: Date.now(), phase: phase ?? undefined });
    if (state.recentVerificationCommands.length > 20) state.recentVerificationCommands.shift();
  }

  return {
    content: [{ type: "text", text: formatted }],
    details: { ok: result.ok, commandId: spec.id, exitCode: result.exitCode, elapsedMs: result.elapsedMs, truncated: result.truncated, commandArtifact },
  };
}

function writeCommandOutputArtifact(
  state: WorkflowCatalogCommandState,
  commandId: string,
  result: { capturedOutput?: string; output: string },
  gitRoot: string | null,
): ArtifactDescriptor | undefined {
  const capturedOutput = result.capturedOutput ?? result.output;
  if (capturedOutput.length < 2000) return undefined;
  const workflowId = state.workflow?.id ?? "no-workflow";
  const safeCommandId = commandId.replace(/[^a-zA-Z0-9._-]+/g, "-");
  const artifactPath = path.join(gitRoot ?? process.cwd(), ".ai", "workflow-artifacts", workflowId, `command-${safeCommandId}-${Date.now()}.txt`);
  try {
    return writeTextArtifact({
      filePath: artifactPath,
      content: capturedOutput,
      kind: "command-output",
      producer: { system: "harness", component: "workflow_run_command" },
      retention: "until-completion",
      summary: `Captured output for workflow_run_command ${commandId}.`,
    });
  } catch {
    return undefined;
  }
}

export function formatWorkflowToolsListing(phase: WorkflowPhase | null): string {
  const builtins = phase ? PHASE_ALLOWED_BUILTIN_TOOLS[phase] ?? [] : ["all"];
  const catalogCmds = phase ? getCatalogCommandsForPhase(phase) : COMMAND_CATALOG;
  const extensionToolNames = [
    "submit_review_package",
    "workflow_run_command",
    "workflow_approve",
    "workflow_skip_gate",
    "workflow_state",
    "workflow_propose_edit",
    "workflow_apply_approved_edit",
    "workflow_interview_wizard",
  ];
  return [
    phase ? `⚙️ Phase: ${phase}` : "No active workflow (showing all)",
    "",
    `Built-in tools: ${(builtins as readonly string[]).join(", ") || "none"}`,
    "",
    "Extension tools (always available):",
    ...extensionToolNames.map((n) => `  ${n}`),
    "",
    "Catalog commands (via workflow_run_command):",
    ...catalogCmds.map((s) => `  ${s.id.padEnd(20)} ${s.description}  [${s.riskLevel}]`),
  ].join("\n");
}
