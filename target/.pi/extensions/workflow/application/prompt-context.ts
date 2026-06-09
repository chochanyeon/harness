import type { WorkflowRuntimeState } from "../runtime-state";
import { getBranch, getGitRoot } from "../git";
import { formatWorkflowAction, formatWorkflowPrompt } from "../format";
import { formatWorkflowReminders, scanWorkflowReminders } from "../reminders";
import { scanPushPolicy } from "../gates";

export function formatGuardMemoryStatus(state: WorkflowRuntimeState): string {
  const workflowId = state.workflow?.id;
  const policyScan = scanPushPolicy();
  const lastPolicy = state.policyApprovals.at(-1);
  return [
    "🧪 Guard memory/status",
    `- DPAA guard: ${workflowId && state.dpaaGuardSatisfiedToken?.workflowId === workflowId ? "satisfied" : "absent"}`,
    `- Code quality guard: ${workflowId && state.codeQualityGuardSatisfiedToken?.workflowId === workflowId ? "satisfied" : "absent"}`,
    `- Code review guard: ${state.codeReviewGuardSatisfiedToken ? `satisfied (Cr:${state.codeReviewGuardSatisfiedToken.critical} Maj:${state.codeReviewGuardSatisfiedToken.major} min:${state.codeReviewGuardSatisfiedToken.minor})` : "absent"}`,
    `- Push execution guard: ${workflowId && state.pushExecutionGuardSatisfiedToken?.workflowId === workflowId ? "satisfied" : "absent"}`,
    `- Policy scan now: ${policyScan.ok ? `ok (${policyScan.totalChanged} changed)` : `confirmation required (${policyScan.findings.map((finding) => finding.category).join(", ")})`}`,
    `- Last policy approval: ${lastPolicy ? `${new Date(lastPolicy.timestamp).toISOString()} / ${lastPolicy.totalChanged} changed / ${lastPolicy.categories.join(", ")}` : "none"}`,
  ].join("\n");
}

export function buildWorkflowSystemPromptInjection(state: WorkflowRuntimeState): string {
  const root = getGitRoot();
  const branch = root ? getBranch(root) : "unknown";
  const dpaaOk = Boolean(state.workflow && state.dpaaGuardSatisfiedToken?.workflowId === state.workflow.id);
  const qualOk = Boolean(state.workflow && state.codeQualityGuardSatisfiedToken?.workflowId === state.workflow.id);
  const reviewOk = Boolean(state.codeReviewGuardSatisfiedToken);
  const pushOk = Boolean(state.workflow && state.pushExecutionGuardSatisfiedToken?.workflowId === state.workflow.id);
  const authLines = [
    "[Workflow Guard Evidence]",
    `DPAA guard evidence: ${dpaaOk ? "present" : "absent"}  (required: plan_review → implement)`,
    `Code quality guard evidence: ${qualOk ? "present" : "absent"}  (required: code_review → review_approved)`,
    `Code review guard evidence: ${reviewOk ? "present" : "absent"}  (required: submit_review_package before review_approved)`,
    `Push transition evidence: ${pushOk ? "present" : "absent"}  (required: commit → push before git push)`,
    `Policy scan approvals this session: ${state.policyApprovals.length}`,
  ].join("\n");

  return [
    "",
    "[Harness Context]",
    `Branch: ${branch}`,
    formatWorkflowPrompt(state.workflow),
    authLines,
    formatWorkflowReminders(scanWorkflowReminders(state.workflow, {
      recentVerificationCommands: state.recentVerificationCommands,
      codeQualityGuardSatisfied: Boolean(state.workflow && state.codeQualityGuardSatisfiedToken?.workflowId === state.workflow.id),
      reviewPackageSubmitted: Boolean(state.workflow && state.reviewPackageToken?.workflowId === state.workflow.id),
    })),
  ].join("\n");
}

export function formatWorkflowStatusWithGuardMemory(state: WorkflowRuntimeState): string {
  return [formatWorkflowAction(state.workflow), "", formatGuardMemoryStatus(state)].join("\n");
}
