import type { WorkflowInstance, WorkflowPhase, WorkflowGate } from "./types";
import { listArtifactSnapshots } from "./artifacts";
import { validateWorkflowWorkspace, formatWorkspaceMismatch } from "./gates";
import { getNextPhase } from "./state";
import { banner, table } from "./ui";
import { sharedContextStrategy, sharedHardRules, sharedPhaseGuidance, sharedSubagentHandoffContract } from "./policy-core";
import { getCatalogCommandsForPhase } from "./catalog";

export function formatWorkflowStatus(workflow: WorkflowInstance | null): string {
  if (!workflow) {
    return [
      banner("⚪ Workflow 없음"),
      "시작: /workflow start <목표>",
    ].join("\n");
  }
  const next = getNextPhase(workflow.phase);
  const ws = validateWorkflowWorkspace(workflow);
  return [
    banner("🧭 Workflow 상태"),
    table([
      ["항목", "값"],
      ["목표", workflow.title],
      ["현재 단계", workflow.phase],
      ["다음 단계", next ?? "없음"],
      ["브랜치", workflow.branch],
      ["작업공간", ws.ok ? "정상" : "⚠️ 불일치"],
      ["실행 취소", workflow.history.length > 0 ? `${workflow.history.length}개 사용 가능` : "없음"],
    ]),
    "",
    formatPhaseGuidanceForUser(workflow),
  ].join("\n");
}

/** User-facing phase summary — no LLM instruction tags. */
export function formatPhaseGuidanceForUser(workflow: WorkflowInstance): string {
  const next = getNextPhase(workflow.phase);
  const lines: string[] = [];
  switch (workflow.phase) {
    case "interview":    lines.push("요구사항 정리 중. 완료 후 plan → plan_review 로 자동 진행됩니다."); break;
    case "plan":         lines.push("플랜 작성 중. 완료 후 plan_review 로 자동 진행됩니다."); break;
    case "plan_review":  lines.push("플랜 검토 중입니다. workflow_approve를 실행하면 DPAA/SBADR 검사를 거쳐 구현 단계로 자동 전이합니다."); break;
    case "implement":    lines.push("구현 중. 완료 후 code_review 로 자동 진행됩니다."); break;
    case "code_review":  lines.push("코드 리뷰 중. submit_review_package 완료 후 review_approved 로 진행됩니다."); break;
    case "review_approved": lines.push("리뷰 완료. 문서화 → commit 준비로 자동 진행됩니다."); break;
    case "document":    lines.push("문서화 중. 완료 후 commit 준비로 자동 진행됩니다."); break;
    case "commit":      lines.push("커밋 준비 완료. workflow_approve 로 push 단계로 진입하세요."); break;
    case "push":        lines.push("Push 준비 완료. workflow_run_command git-push 로 git push 를 실행하세요."); break;
    case "done":        lines.push("✅ 완료됐습니다."); break;
  }
  if (next && workflow.phase !== "done") {
    lines.push(`다음 단계: ${next}`);
  }
  return lines.join("\n");
}

export function formatWorkflowAction(workflow: WorkflowInstance | null): string {
  if (!workflow) {
    return [
      "[LLM WORKFLOW ACTION]",
      "- No active workflow.",
      "- For procedural work, ask whether to start one with /workflow start <goal>.",
      "[/LLM WORKFLOW ACTION]",
    ].join("\n");
  }

  const next = getNextPhase(workflow.phase);
  const displayNext = workflow.phase === "code_review" && next === "review_approved" ? "review-approved (after review package and gates)" : next ?? "none";
  const lines = [
    "[LLM WORKFLOW ACTION]",
    `- Current phase: ${workflow.phase}`,
    `- Next phase: ${displayNext}`,
  ];

  switch (workflow.phase) {
    case "interview":
      lines.push(
        "- Required now: clarify requirements, record interview artifacts, and call workflow_score_interview with per-dimension clarity scores after the wizard.",
        "- Transition: automatically prepare plan artifacts through plan_review; DPAA/SBADR runs there.",
      );
      break;
    case "plan":
      lines.push(
        "- Required now: produce/update the plan and DPAA/SBADR-ready artifacts.",
        "- Transition: automatically advance to plan_review for the DPAA/SBADR gate.",
      );
      break;
    case "plan_review":
      lines.push(
        "- Required now: run workflow_approve; DPAA/SBADR advances to implement only when it passes.",
        "- On a gate failure, repair the plan and retry; ask only for a genuine business decision that context cannot resolve.",
      );
      break;
    case "implement":
      lines.push(
        "- Required now: implement the approved scope, use a test-first cycle for behavior changes, run the narrowest useful verification, and summarize changed files.",
        "- Transition: automatically advance to code_review after implementation is complete.",
      );
      break;
    case "code_review":
      lines.push(
        "- Required now: run self-review, independent review, and quality gates, then call submit_review_package.",
        "- Transition: remain in code_review for review/fix cycles until the package and all gates pass.",
      );
      break;
    case "review_approved":
      lines.push("- Required now: ensure review findings are closed/accepted; automatically continue through documentation and commit preparation.");
      break;
    case "document":
      lines.push("- Required now: update required docs or state why they are not applicable; automatically continue to commit preparation.");
      break;
    case "commit":
      lines.push(
        "- Required now: provide the diff, risk/verification summaries, and proposed commit message; create the commit after approval.",
        "- Transition: workflow_approve runs the policy scan and shows the commit → push dialog.",
      );
      break;
    case "push":
      lines.push(
        "- Required now: run workflow_run_command with commandId 'git-push'; a successful push auto-advances to done.",
        "- Do not call workflow_approve in push; it cannot advance push → done.",
      );
      break;
    case "done":
      lines.push("- Required now: do not continue procedural work unless the user starts a new workflow.");
      break;
  }

  lines.push(
    "- User approval is required only at commit → push.",
    "- When you have enough information to act, act. Give a recommendation instead of listing options you will not pursue.",
    "- Do not re-litigate established decisions; use current artifacts, guard evidence, and Run Ledger state as the source of truth.",
    "- workflow_state tool or /workflow state <phase> is manual recovery only (one step at a time); never use for normal advancement.",
    "[/LLM WORKFLOW ACTION]",
  );
  return lines.join("\n");
}

export function formatWorkflowHistory(workflow: WorkflowInstance | null): string {
  if (!workflow) return "⚪ 진행 중인 workflow가 없습니다.";
  if (workflow.history.length === 0) return "⚪ Workflow 전이 이력이 없습니다.";
  const snapshots = listArtifactSnapshots(workflow.id);
  const sections = [
    banner("🕘 Workflow 전이 이력"),
    table([
      ["#", "전이", "사유"],
      ...workflow.history.map((item, index) => [String(index + 1), `${item.from} → ${item.to}`, item.reason]),
    ]),
  ];
  if (snapshots.length > 0) {
    sections.push(
      "",
      banner("📚 Artifact 버전 이력"),
      table([
        ["버전", "출처", "사유", "DPAA"],
        ...snapshots.map((snapshot) => [
          snapshot.version,
          snapshot.source,
          snapshot.reason,
          snapshot.dpaa ? `${snapshot.dpaa.level}/${snapshot.dpaa.overall}` : "-",
        ]),
      ]),
    );
  }
  return sections.join("\n");
}

export function formatWorkflowPrompt(workflow: WorkflowInstance | null): string {
  if (!workflow) {
    return [
      "• No active workflow.",
      "• For procedural work, suggest /workflow start <goal> to the user.",
    ].join("\n");
  }
  const workspace = validateWorkflowWorkspace(workflow);
  const lines = [
    `• Workflow branch: ${workflow.branch}`,
    `• Workflow cwd: ${workflow.cwd}`,
    formatWorkflowAction(workflow),
    formatHardRules(),
  ];
  if (!workspace.ok) lines.push(formatWorkspaceMismatch(workspace));
  return lines.join("\n");
}

function formatHardRules(): string {
  const rules = sharedHardRules().filter((rule) => !rule.startsWith("User approval is required"));
  return rules.length > 0 ? ["[WORKFLOW HARD RULES]", ...rules.map((rule) => `- ${rule}`), "[/WORKFLOW HARD RULES]"].join("\n") : "";
}

function formatContextStrategy(phase: WorkflowPhase): string {
  const strategy = sharedContextStrategy(phase);
  if (!strategy) return "";
  const contract = sharedSubagentHandoffContract();
  return [
    `[CONTEXT STRATEGY: ${phase}]`,
    strategy.delegateTo ? `- Delegate: ${strategy.delegateTo}` : "",
    strategy.mainKeeps.length > 0 ? `- Main keeps: ${strategy.mainKeeps.join(", ")}` : "",
    strategy.mainAvoids.length > 0 ? `- Main avoids: ${strategy.mainAvoids.join(", ")}` : "",
    contract.length > 0 ? `- Subagent returns: ${contract.join(", ")}` : "",
    "[/CONTEXT STRATEGY]",
  ].filter(Boolean).join("\n");
}

export function phaseGuidance(phase: WorkflowPhase): string {
  const shared = sharedPhaseGuidance(phase);
  if (shared) return `• Deliverable: ${shared}`;

  switch (phase) {
    case "interview":
      return "• Deliverable: clarify requirements and keep Korean source artifacts in .ai/interview/*.ko.md.";
    case "plan":
      return "• Deliverable: produce/update the implementation plan; keep English DPAA artifacts faithful to the Korean sources.";
    case "plan_review":
      return "• Deliverable: run the automatic DPAA/SBADR gate for the plan; if checks fail, autonomously repair the plan artifacts (vague phrasing, missing metrics, undefined pronouns, syntactic ambiguity) and retry workflow_approve. Ask the user only for genuine business decisions that cannot be inferred from context.";
    case "implement":
      return "• Deliverable: implement the approved plan only. After implementation and narrow verification are complete, advance to code_review automatically; do not ask user approval for this transition.";
    case "code_review":
      return "• Deliverable: run/fix the code review loop. Advancing to review_approved mechanically runs codeQualityGuard (Checkstyle/PMD) + coverageGuard (JaCoCo) after submit_review_package is complete.";
    case "review_approved":
      return "• Deliverable: ensure review findings are addressed/accepted, then continue automatically toward documentation and commit preparation.";
    case "document":
      return "• Deliverable: update required docs/Swagger/feature notes or state why they are not applicable, then continue automatically toward commit preparation.";
    case "commit":
      return "• Deliverable: present commit summary and commit only after approval. Ask for approval before push.";
    case "push":
      return "• Deliverable: push only after policy scan approval and commit → push transition history.";
    case "done":
      return "• Workflow is complete. Start a new workflow for additional procedural work.";
  }
}


// ─── Workflow board widget ─────────────────────────────────────────────────
// Renders a compact status board for ctx.ui.setWidget().
// Each line is a plain string; width enforcement is the caller's responsibility.

export type WorkflowBoardState = {
  workflow: WorkflowInstance | null;
  gateFailures: Map<WorkflowGate, number>;
  dpaaGuardSatisfied: boolean;
  codeQualityGuardSatisfied: boolean;
  reviewPackageSubmitted: boolean;
  pushGuardSatisfied: boolean;
};

export function formatWorkflowBoard(s: WorkflowBoardState): string[] {
  if (!s.workflow) {
    return [
      "⚪ 워크플로우 없음",
      "  /workflow start <목표>",
    ];
  }

  const wf = s.workflow;
  const next = getNextPhase(wf.phase);

  // Gate status indicators — only show gates relevant to the current phase
  const dpaa    = s.dpaaGuardSatisfied       ? "✅" : (s.gateFailures.get("dpaa") ?? 0) > 0         ? "❌" : "⏳";
  const quality = s.codeQualityGuardSatisfied ? "✅" : (s.gateFailures.get("code-quality") ?? 0) > 0 ? "❌" : "⏳";
  const review  = s.reviewPackageSubmitted    ? "✅" : "⏳";
  const push    = s.pushGuardSatisfied        ? "✅" : "⏳";

  type GateEntry = [string, string];
  const relevantGates: GateEntry[] = (() => {
    switch (wf.phase) {
      case "plan_review":                        return [["DPAA", dpaa]];
      case "implement":                          return [["DPAA", dpaa], ["Quality", quality]];
      case "code_review":                        return [["Quality", quality], ["Review", review]];
      case "review_approved": case "document":   return [["Quality", quality], ["Review", review], ["Push", push]];
      case "commit": case "push":                return [["Quality", quality], ["Review", review], ["Push", push]];
      default:                                   return [];
    }
  })();

  // Phase-allowed commands — truncate if too many to fit in 80 chars
  const allCmds = getCatalogCommandsForPhase(wf.phase).map((c) => c.id);
  const MAX_CMDS = 4;
  const cmdsDisplay = allCmds.length <= MAX_CMDS
    ? allCmds.join(", ") || "none"
    : `${allCmds.slice(0, MAX_CMDS).join(", ")} +${allCmds.length - MAX_CMDS}`;

  // User-friendly hint from formatPhaseGuidanceForUser
  const hint = formatPhaseGuidanceForUser(wf).split("\n")[0];
  const gatesLine = relevantGates.length > 0
    ? `Gates: ${relevantGates.map(([label, status]) => `${label} ${status}`).join("  ")}`
    : null;
  const lines: string[] = [
    `🧭 ${wf.phase.padEnd(16)}  → ${next ?? "done"}`,
    `   ${wf.title.slice(0, 60)}`,
    ``,
    ...(gatesLine ? [gatesLine] : []),
    `Cmds:  ${cmdsDisplay}`,
    ``,
    `→ ${hint}`,
  ];

  return lines;
}
