import * as path from "node:path";

import { writeTextArtifact, type ArtifactDescriptor } from "./artifact-descriptor";
import { safeWriteWorkflowLedgerSnapshot } from "./ledger";
import {
  COMMAND_CATALOG,
  PHASE_ALLOWED_BUILTIN_TOOLS,
  formatCatalogCommandResult,
  getBranch,
  getCatalogCommand,
  getCatalogCommandsForPhase,
  getGitRoot,
  isPhaseAllowed,
  runCatalogCommandAsync,
  validateWorkflowWorkspace,
  scanPushPolicy,
  pushPolicySignature,
  formatPushPolicyScanBlocked,
  type WorkflowInstance,
  type WorkflowPhase,
} from "./core";

const GIT_PUSH_NO_UPSTREAM_MARKER = "has no upstream branch";
// Force English git messages so GIT_PUSH_NO_UPSTREAM_MARKER matching does not
// depend on the caller's locale (git translates its own messages via gettext
// when LC_ALL/LANG/LANGUAGE select a non-English locale).
const GIT_PUSH_ENGLISH_LOCALE_ENV = { LC_ALL: "C", LANG: "C", LANGUAGE: "C" };

export type WorkflowCatalogCommandState = {
  workflow: WorkflowInstance | null;
  recentVerificationCommands: Array<{ command: string; timestamp: number; phase?: WorkflowPhase }>;
  policyApprovals?: Array<{ timestamp: number; totalChanged: number; categories: string[]; signature?: string }>;
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

  if (spec.id === "git-push" && state.workflow) {
    const guard = validateWorkflowGitPushCatalogCommand(state);
    if (!guard.ok) {
      return {
        content: [{ type: "text", text: guard.message }],
        details: { ok: false, reason: "workflow-push-guard-blocked", commandId: spec.id },
      };
    }
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
  const onHeartbeat = ({ commandId, elapsedMs }: { commandId: string; elapsedMs: number }) => {
    if (!ctx.hasUI || typeof ctx.ui?.notify !== "function") return;
    ctx.ui.notify(`workflow_run_command ${commandId} still running (${Math.floor(elapsedMs / 1000)}s elapsed)`, "info");
  };
  const envOverride = spec.id === "git-push" ? GIT_PUSH_ENGLISH_LOCALE_ENV : undefined;
  let result = await runCatalogCommandAsync(spec, gitRoot, userArgs, { onHeartbeat, envOverride });

  if (spec.id === "git-push" && !result.ok && gitRoot && result.output.includes(GIT_PUSH_NO_UPSTREAM_MARKER)) {
    const branch = getBranch(gitRoot);
    // "unknown" means `git rev-parse --abbrev-ref HEAD` failed; do not push to a
    // literal branch named "unknown" — leave the original failure result intact.
    if (branch !== "unknown") {
      result = await runCatalogCommandAsync(spec, gitRoot, ["--set-upstream", "origin", branch], { onHeartbeat, envOverride });
    }
  }
  const commandArtifact = writeCommandOutputArtifact(state, spec.id, result, gitRoot);
  const artifactNote = commandArtifact
    ? `\n\nCommand output artifact: ${path.relative(gitRoot ?? process.cwd(), commandArtifact.path)} (${commandArtifact.sizeBytes} bytes, sha256=${commandArtifact.sha256.slice(0, 12)}…)`
    : "";
  const formatted = `${formatCatalogCommandResult(result, spec)}${artifactNote}`;

  if (["code-quality", "project-test"].includes(spec.id)) {
    state.recentVerificationCommands.push({ command: spec.id, timestamp: Date.now(), phase: phase ?? undefined });
    if (state.recentVerificationCommands.length > 20) state.recentVerificationCommands.shift();
  }
  safeWriteWorkflowLedgerSnapshot(state.workflow, gitRoot ?? undefined, {
    verification: {
      commandId: spec.id,
      ok: result.ok,
      exitCode: result.exitCode,
      artifactPath: commandArtifact ? path.relative(gitRoot ?? process.cwd(), commandArtifact.path) : undefined,
    },
  });

  return {
    content: [{ type: "text", text: formatted }],
    details: { ok: result.ok, commandId: spec.id, exitCode: result.exitCode, elapsedMs: result.elapsedMs, truncated: result.truncated, commandArtifact },
  };
}

function validateWorkflowGitPushCatalogCommand(
  state: WorkflowCatalogCommandState,
): { ok: true } | { ok: false; message: string } {
  const workflow = state.workflow;
  if (!workflow) return { ok: true };

  const workspace = validateWorkflowWorkspace(workflow);
  if (!workspace.ok) {
    return { ok: false, message: workspace.problems.join("\n") };
  }

  if (workflow.phase !== "push") {
    return { ok: false, message: `git push blocked: current phase is "${workflow.phase}", required phase is "push".` };
  }

  if (!workflow.history.some((item) => item.from === "commit" && item.to === "push")) {
    return {
      ok: false,
      message: [
        "Workflow git push blocked: missing commit → push transition history.",
        "Use workflow_approve from commit phase so the final user approval and policy scan run before git-push.",
      ].join("\n"),
    };
  }

  const scan = scanPushPolicy(workflow.gitRoot ?? getGitRoot());
  const signature = pushPolicySignature(scan);
  const approved = state.policyApprovals?.at(-1)?.signature === signature;
  if (!scan.ok && !approved) {
    return { ok: false, message: formatPushPolicyScanBlocked(scan) };
  }

  return { ok: true };
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
