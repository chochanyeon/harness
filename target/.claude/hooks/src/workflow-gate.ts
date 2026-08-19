import * as fs from "node:fs";
import { loadPersistedWorkflow } from "../../../.pi/extensions/workflow/state";
import { formatWorkflowPrompt } from "../../../.pi/extensions/workflow/format";
import { isGitPush } from "../../../.pi/extensions/workflow/git";
import {
  validateWorkflowWorkspace,
  formatWorkspaceMismatch,
  scanPushPolicy,
  formatPushPolicyScanBlocked,
} from "../../../.pi/extensions/workflow/gates";
import { consumeClaudeSkipToken } from "./lib/skip-tokens";

function readStdinJson(): any {
  try {
    const raw = fs.readFileSync(0, "utf8").trim();
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function allow(): never {
  process.exit(0);
}

function deny(reason: string): never {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    }),
  );
  process.exit(0);
}

function injectContext(hookEventName: string, message: string): never {
  if (!message) allow();
  process.stdout.write(
    JSON.stringify({ hookSpecificOutput: { hookEventName, additionalContext: message } }),
  );
  process.exit(0);
}

function checkToolCall(event: any): void {
  const toolName = event.tool_name ?? event.toolName ?? "";
  if (toolName !== "Bash") return allow();

  const command = String(event.tool_input?.command ?? event.toolInput?.command ?? "");
  if (!isGitPush(command)) return allow();

  const workflow = loadPersistedWorkflow();
  if (!workflow) {
    return deny("Blocked by workflow gate. No active workflow. Run /workflow start, work through the phases, and /workflow approve into the push phase before pushing.");
  }
  if (workflow.phase !== "push") {
    return deny(`Blocked by workflow gate. git push is allowed only in the push phase. Current phase: ${workflow.phase}. Run /workflow approve to advance toward push once ready.`);
  }
  const hasPushTransition = workflow.history.some((t) => t.from === "commit" && t.to === "push");
  if (!hasPushTransition) {
    return deny("Blocked by workflow gate. No recorded commit -> push transition in workflow history. Run /workflow approve from the commit phase.");
  }
  const workspace = validateWorkflowWorkspace(workflow);
  if (!workspace.ok) {
    return deny(formatWorkspaceMismatch(workspace));
  }
  const scan = scanPushPolicy(workflow.gitRoot);
  if (!scan.ok) {
    const skip = consumeClaudeSkipToken("policy-scan", workflow.id);
    if (!skip) return deny(formatPushPolicyScanBlocked(scan));
  }
  return allow();
}

function main(): void {
  const [, , command] = process.argv;
  const input = readStdinJson();

  switch (command) {
    case "check-tool-call":
      try {
        checkToolCall(input);
      } catch (error) {
        // This is the only hard-blocking gate in the adapter. An uncaught
        // exception here would exit non-zero, and Claude Code treats a
        // failed hook as fail-open (proceeds with the tool call anyway) --
        // so a push that should have been denied could go through. Fail
        // closed instead: deny with a clear reason rather than crashing.
        const message = error instanceof Error ? error.message : String(error);
        deny(`Workflow gate internal error: ${message}`);
      }
      break;
    case "session-start":
    case "user-prompt":
    case "reevaluate": {
      const hookEventName =
        command === "session-start" ? "SessionStart" : command === "user-prompt" ? "UserPromptSubmit" : "PostToolUse";
      try {
        injectContext(hookEventName, formatWorkflowPrompt(loadPersistedWorkflow()));
      } catch (error) {
        // Unlike check-tool-call, these three hook events are advisory-only
        // context injections -- only check-tool-call may ever deny a tool
        // call. An uncaught exception here would otherwise crash the process
        // with a raw, unhandled exception instead of failing open cleanly.
        // Log for diagnosis and allow the session/prompt to proceed silently.
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Workflow gate internal error (${command}): ${message}`);
        allow();
      }
      break;
    }
    default:
      allow();
  }
}

main();
