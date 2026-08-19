import {
  createWorkflow,
  loadPersistedWorkflow,
  saveWorkflow,
  clearPersistedWorkflow,
  normalizeWorkflowPhase,
  advanceWorkflow,
} from "../../../.pi/extensions/workflow/state";
import { formatWorkflowStatus } from "../../../.pi/extensions/workflow/format";
import { formatHarnessDoctor } from "../../../.pi/extensions/workflow/catalog";
import { formatLatestDpaaAudit } from "../../../.pi/extensions/workflow/artifacts";
import { formatRecentFieldLogs, exportFieldLogs } from "../../../.pi/extensions/workflow/field-log";
import { WORKFLOW_PHASES, type WorkflowPhase } from "../../../.pi/extensions/workflow/types";
import { addClaudeSkipToken } from "./lib/skip-tokens";

const [, , command, ...rest] = process.argv;

function cmdStart(title: string): void {
  const existing = loadPersistedWorkflow();
  if (existing && existing.phase !== "done") {
    console.log(`Workflow already active: [${existing.phase}] ${existing.title}\nUse /workflow status or /workflow abort first.`);
    process.exitCode = 1;
    return;
  }
  const workflow = createWorkflow(title || "workflow");
  saveWorkflow(workflow);
  console.log(formatWorkflowStatus(workflow));
}

function cmdStatus(): void {
  console.log(formatWorkflowStatus(loadPersistedWorkflow()));
}

async function cmdApprove(): Promise<void> {
  const workflow = loadPersistedWorkflow();
  if (!workflow) {
    console.log("No active workflow to approve.");
    process.exitCode = 1;
    return;
  }
  const result = await advanceWorkflow(workflow, "user_approved", {});
  console.log(result.message);
  if (!result.ok) process.exitCode = 1;
}

function cmdDoctor(): void {
  console.log(formatHarnessDoctor());
}

function cmdAbort(): void {
  const workflow = loadPersistedWorkflow();
  if (!workflow) {
    console.log("No active workflow to abort.");
    process.exitCode = 1;
    return;
  }
  clearPersistedWorkflow();
  console.log(`Workflow aborted: [${workflow.phase}] ${workflow.title}`);
}

function cmdState(phaseArg: string | undefined): void {
  const workflow = loadPersistedWorkflow();
  if (!workflow) {
    console.log("No active workflow.");
    process.exitCode = 1;
    return;
  }
  if (!phaseArg) {
    console.log("Usage: /workflow state <phase>");
    process.exitCode = 1;
    return;
  }
  const phase = normalizeWorkflowPhase(phaseArg) as WorkflowPhase;
  if (!WORKFLOW_PHASES.includes(phase)) {
    console.log(`Unknown phase: ${phaseArg}. Valid phases: ${WORKFLOW_PHASES.join(", ")}`);
    process.exitCode = 1;
    return;
  }
  workflow.phase = phase;
  workflow.updatedAt = Date.now();
  saveWorkflow(workflow);
  console.log(`Manually set workflow phase to: ${phase}. This bypasses gates — use only for recovery, per the same caveat as Pi's /workflow state.`);
}

function cmdSkip(args: string[]): void {
  const [gate, ...reasonParts] = args;
  const reason = reasonParts.join(" ").trim();
  if (!gate || !reason) {
    console.log("Usage: /workflow skip <gate> <reason>");
    process.exitCode = 1;
    return;
  }
  const workflow = loadPersistedWorkflow();
  if (!workflow) {
    console.log("No active workflow to skip a gate for.");
    process.exitCode = 1;
    return;
  }
  addClaudeSkipToken(gate, workflow.id, reason);
  console.log(`Skip token issued for gate '${gate}' (valid 10 minutes, workflow ${workflow.id}). Use only for an accepted, explicit risk.`);
}

function cmdDpaaAudit(): void {
  console.log(formatLatestDpaaAudit());
}

function cmdFailures(sub: string | undefined): void {
  if (sub === "export") {
    console.log(`Harness field logs exported: ${exportFieldLogs()}`);
    return;
  }
  console.log(formatRecentFieldLogs(10));
}

async function main(): Promise<void> {
  switch (command) {
    case "start":
      return cmdStart(rest.join(" ").trim());
    case "status":
      return cmdStatus();
    case "approve":
      return cmdApprove();
    case "doctor":
      return cmdDoctor();
    case "abort":
      return cmdAbort();
    case "state":
      return cmdState(rest[0]);
    case "skip":
      return cmdSkip(rest);
    case "dpaa-audit":
      return cmdDpaaAudit();
    case "failures":
      return cmdFailures(rest[0]);
    default:
      console.log("Usage: workflow-cli.cjs start|status|approve|doctor|abort|state|skip|dpaa-audit|failures [export]");
      process.exitCode = 1;
  }
}

main();
