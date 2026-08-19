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
      checkToolCall(input);
      break;
    case "session-start":
      injectContext("SessionStart", formatWorkflowPrompt(loadPersistedWorkflow()));
      break;
    case "user-prompt":
      injectContext("UserPromptSubmit", formatWorkflowPrompt(loadPersistedWorkflow()));
      break;
    case "reevaluate":
      injectContext("PostToolUse", formatWorkflowPrompt(loadPersistedWorkflow()));
      break;
    default:
      allow();
  }
}

main();
