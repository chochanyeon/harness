/**
 * workflow.ts — Pi Extension
 *
 * Implements the harness final-stage gates and advisory workflow layer as a
 * Pi extension.
 *
 * Gates:
 *   1. Code Review Gate — require /skill:code-review before git commit
 *   2. Commit Message Gate — enforce Conventional Commits format
 *
 * Additional behavior:
 *   - resources_discover: register bundled harness skills with Pi
 *   - session_start: show branch and untested-class context
 *   - before_agent_start: inject gate/workflow state into the system prompt
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// This file lives at: <harness-root>/.pi/extensions/workflow.ts
const HARNESS_ROOT = path.resolve(__dirname, "../..");

export default function (pi: ExtensionAPI) {
  // ── In-memory state ────────────────────────────────────────────────────────
  // Process memory only: the LLM cannot forge this token through shell/file writes.
  const state = {
    reviewResult: null as {
      critical: number;
      major: number;
      minor: number;
      timestamp: number;
    } | null,
    workflow: loadPersistedWorkflow(),
  };

  // ── resources_discover: register bundled harness skills ───────────────────
  pi.on("resources_discover", async () => {
    const skillsPath = path.join(HARNESS_ROOT, ".pi", "skills");
    if (!fs.existsSync(skillsPath)) return;
    return { skillPaths: [skillsPath] };
  });

  // ── Tool: submit_review_result ─────────────────────────────────────────────
  // The LLM must call this tool after completing the code-review skill.
  // This creates the in-memory commit token; commits are blocked without it.
  pi.registerTool({
    name: "submit_review_result",
    label: "리뷰 결과 제출",
    description: [
      "Call this tool after completing code review.",
      "It creates the in-memory commit approval token.",
      "Without this token, git commit is blocked at the infrastructure level.",
      "Submit the exact Critical/Major/Minor issue counts from the review.",
    ].join(" "),
    parameters: Type.Object({
      critical: Type.Number({ description: "Number of Critical issues; must be 0 to allow commit." }),
      major:    Type.Number({ description: "Number of Major issues; must be 2 or fewer to allow commit." }),
      minor:    Type.Number({ description: "Number of Minor issues." }),
    }),
    async execute(_id, params) {
      state.reviewResult = { ...params, timestamp: Date.now() };

      const ok = params.critical === 0 && params.major <= 2;
      const verdict = ok ? "✅ 커밋 가능" : "❌ 이슈 수정 필요";
      const lines = [
        `리뷰 토큰 발급됨 [${verdict}]`,
        `  Critical : ${params.critical}개  (기준: 0)`,
        `  Major    : ${params.major}개  (기준: ≤2)`,
        `  Minor    : ${params.minor}개`,
        ok
          ? "→ git commit 허용됩니다 (TTL 60분)"
          : "→ 이슈 수정 후 /skill:code-review 재실행 후 커밋하세요",
      ];
      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details: {},
      };
    },
  });

  // ── Command: /workflow — advisory workflow state manager ──────────────────
  pi.registerCommand("workflow", {
    description: "Manage the advisory interview → plan → implementation → review → push workflow state.",
    getArgumentCompletions: (prefix) => {
      const commands = ["start", "approve", "status", "undo", "redo", "history", "abort", "state", "dpaa-audit"];
      return commands
        .filter((command) => command.startsWith(prefix))
        .map((value) => ({ value, label: value }));
    },
    handler: async (args, ctx) => {
      const [command = "status", ...rest] = args.trim().split(/\s+/).filter(Boolean);

      if (command === "start") {
        if (state.workflow && state.workflow.phase !== "done") {
          ctx.ui.notify(
            `이미 진행 중인 workflow가 있습니다: ${state.workflow.phase}\n` +
              "먼저 /workflow status, /workflow approve, /workflow abort 중 하나를 사용하세요.",
            "warning",
          );
          return;
        }

        state.workflow = createWorkflow(rest.join(" "));
        saveWorkflow(state.workflow);
        ctx.ui.notify(formatWorkflowStatus(state.workflow), "info");
        return;
      }

      if (command === "approve") {
        const result = await advanceWorkflow(state.workflow, "user_approved");
        if (!result.ok) {
          ctx.ui.notify(result.message, "warning");
          return;
        }
        ctx.ui.notify(result.message, "info");
        return;
      }

      if (command === "undo") {
        const result = undoWorkflow(state.workflow);
        ctx.ui.notify(result.message, result.ok ? "info" : "warning");
        return;
      }

      if (command === "redo") {
        const result = redoWorkflow(state.workflow);
        ctx.ui.notify(result.message, result.ok ? "info" : "warning");
        return;
      }

      if (command === "history") {
        ctx.ui.notify(formatWorkflowHistory(state.workflow), "info");
        return;
      }

      if (command === "dpaa-audit") {
        ctx.ui.notify(formatLatestDpaaAudit(), "info");
        return;
      }

      if (command === "abort") {
        if (!state.workflow) {
          ctx.ui.notify("진행 중인 workflow가 없습니다.", "info");
          return;
        }
        const ok = !ctx.hasUI || (await ctx.ui.confirm("Abort workflow", `현재 workflow(${state.workflow.phase})를 종료할까요?`));
        if (!ok) return;
        state.workflow = null;
        clearPersistedWorkflow();
        ctx.ui.notify("Workflow를 종료했습니다.", "info");
        return;
      }

      if (command === "state") {
        const next = rest[0] as WorkflowPhase | undefined;
        if (!next || !WORKFLOW_PHASES.includes(next)) {
          ctx.ui.notify(`사용법: /workflow state <${WORKFLOW_PHASES.join("|")}>`, "warning");
          return;
        }
        if (!state.workflow) state.workflow = createWorkflow("manual");
        transitionWorkflow(state.workflow, next, "manual_override");
        saveWorkflow(state.workflow);
        ctx.ui.notify(formatWorkflowStatus(state.workflow), "info");
        return;
      }

      ctx.ui.notify(formatWorkflowStatus(state.workflow), "info");
    },
  });

  // ── Natural approval: "응, 진행해" → workflow advance ─────────────────────
  pi.on("input", async (event) => {
    if (event.source === "extension") return { action: "continue" };
    if (!state.workflow || state.workflow.phase === "done") return { action: "continue" };
    if (!isApprovalText(event.text)) return { action: "continue" };

    const result = await advanceWorkflow(state.workflow, "natural_language_approval");
    if (!result.ok) {
      return {
        action: "transform",
        text: [
          event.text,
          "",
          `[Workflow] Transition blocked: ${result.message}`,
          "Resolve the blocker before asking the user to approve the next phase again.",
        ].join("\n"),
      };
    }

    return {
      action: "transform",
      text: [
        event.text,
        "",
        `[Workflow] User approval advanced the workflow to '${state.workflow.phase}'.`,
        "Proceed according to the current phase. Ask for user confirmation before moving to the next phase.",
      ].join("\n"),
    };
  });

  // ── Gate: tool_call(bash) → git commit 차단 ────────────────────────────────
  pi.on("tool_call", async (event) => {
    if (event.toolName !== "bash") return;

    const cmd = String((event.input as any).command ?? "");
    if (!isGitCommit(cmd)) return;

    // ── Gate 1: Conventional Commits 형식 검사 ──────────────────────────────
    const rawMsg = extractCommitMessage(cmd);
    if (rawMsg !== null && !isConventionalCommit(rawMsg)) {
      return {
        block: true,
        reason: [
          "── 📝 COMMIT MESSAGE FORMAT ───────────",
          "",
          `  현재: "${rawMsg}"`,
          `  필요: "<type>(<scope>): <description>"`,
          "",
          "  type: feat | fix | chore | refactor | docs | test | perf | ci | style | revert",
          "  scope: 소문자 영숫자 + 하이픈 (선택)",
          "  description: 1~100자",
          "",
          "──────────────────────────────────────",
        ].join("\n"),
      };
    }

    // ── Gate 2: 코드 리뷰 토큰 없음 ─────────────────────────────────────────
    if (!state.reviewResult) {
      return {
        block: true,
        reason: [
          "── 🔍 CODE REVIEW REQUIRED ────────────",
          "",
          "  커밋 전 코드 리뷰가 필요합니다.",
          "",
          "  ① /skill:code-review 실행",
          "  ② 리뷰 완료 → submit_review_result 도구 호출",
          "  ③ Critical 0 + Major ≤2 확인",
          "  ④ 커밋 재시도",
          "",
          "  [파일 토큰 없음 — 메모리 토큰만 허용]",
          "  bash로 파일 생성하는 방식의 우회는 동작하지 않습니다.",
          "",
          "──────────────────────────────────────",
        ].join("\n"),
      };
    }

    // ── Gate 3: TTL 만료 (60분) ──────────────────────────────────────────────
    const ageMin = (Date.now() - state.reviewResult.timestamp) / 60_000;
    if (ageMin > 60) {
      const elapsed = Math.floor(ageMin);
      state.reviewResult = null;
      return {
        block: true,
        reason: [
          `── ⏰ 리뷰 만료 (${elapsed}분 경과) ────────`,
          "",
          "  리뷰 토큰의 유효 시간(60분)이 초과되었습니다.",
          "  /skill:code-review 를 다시 실행하세요.",
          "",
          "──────────────────────────────────────",
        ].join("\n"),
      };
    }

    // ── Gate 4: Critical / Major 기준 미달 ───────────────────────────────────
    const { critical, major } = state.reviewResult;
    if (critical > 0 || major > 2) {
      const r = state.reviewResult;
      state.reviewResult = null;
      return {
        block: true,
        reason: [
          "── 🔍 CODE REVIEW 미통과 ────────────",
          "",
          `  Critical : ${r.critical}개  (기준: 0)`,
          `  Major    : ${r.major}개  (기준: ≤2)`,
          "",
          "  ① 지적된 이슈 수정",
          "  ② /skill:code-review 재실행",
          "  ③ 커밋 재시도",
          "",
          "──────────────────────────────────────",
        ].join("\n"),
      };
    }

    // ✅ 모든 게이트 통과 → 토큰 소비 (단일 커밋에 1회만 유효)
    state.reviewResult = null;
  });

  // ── session_start: 상태 초기화 + 세션 컨텍스트 알림 ───────────────────────
  pi.on("session_start", async (_event, ctx) => {
    state.reviewResult = null;

    const root = getGitRoot();
    if (!root) return;

    const branch = getBranch(root);
    const untested = getUntestedClasses(root);

    const parts = [`브랜치: ${branch}`];
    if (untested.length === 0) {
      parts.push("미테스트 클래스: 없음 ✅");
    } else {
      const preview = untested.slice(0, 5).join(", ");
      const extra = untested.length > 5 ? ` 외 ${untested.length - 5}개` : "";
      parts.push(`미테스트 클래스: ${preview}${extra}`);
    }

    ctx.ui.notify(`Harness Gates 로드 | ${parts.join(" | ")}`, "info");
  });

  // ── before_agent_start: inject gate state into the system prompt ──────────
  //
  // System-prompt injection makes these constraints part of the model's rules,
  // instead of presenting them only as tool rejection messages to work around.
  pi.on("before_agent_start", async (event) => {
    const root = getGitRoot();
    const branch = root ? getBranch(root) : "unknown";

    let reviewStatus: string;
    if (!state.reviewResult) {
      reviewStatus = "not run ❌";
    } else {
      const ageMin = Math.floor((Date.now() - state.reviewResult.timestamp) / 60_000);
      const { critical, major } = state.reviewResult;
      reviewStatus = `completed ✅ (Critical: ${critical}, Major: ${major}, ${ageMin} min ago)`;
    }

    const injection = [
      "",
      "[Harness Gate — Current State]",
      `Branch: ${branch}`,
      `Code review token: ${reviewStatus}`,
      "",
      "[Workflow State — Persisted advisory]",
      formatWorkflowPrompt(state.workflow),
      "",
      "[Gate Rules — Infrastructure-enforced, not bypassable]",
      "• Run /skill:code-review before git commit.",
      "• After review, you must call submit_review_result.",
      "  (This creates the in-memory token; commits are blocked without it.)",
      "• The token exists only in process memory; creating files with bash cannot bypass the gate.",
      "• Commit messages must follow Conventional Commits:",
      "  <type>(<scope>): <description>",
    ].join("\n");

    return { systemPrompt: event.systemPrompt + injection };
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────

type WorkflowPhase =
  | "interview"
  | "plan"
  | "plan_review"
  | "implement"
  | "code_review"
  | "document"
  | "commit"
  | "push"
  | "done";

type WorkflowTransition = {
  from: WorkflowPhase;
  to: WorkflowPhase;
  reason: string;
  timestamp: number;
};

type WorkflowInstance = {
  id: string;
  title: string;
  phase: WorkflowPhase;
  history: WorkflowTransition[];
  undone: WorkflowTransition[];
  startedAt: number;
  updatedAt: number;
};

type DpaaReport = {
  overall: number;
  level: string;
  findings: Array<{
    layer: string;
    rule: string;
    line?: number;
    message: string;
    suggestion: string;
  }>;
};

type DpaaRunReceipt = {
  timestamp: string;
  workflowId: string;
  from: WorkflowPhase;
  to: WorkflowPhase;
  projectRoot: string;
  planPath: string;
  planSha256: string;
  exitCode: number;
  level: string;
  overall: number;
  findingsCount: number;
  reportSha256: string;
};

const WORKFLOW_PHASES: WorkflowPhase[] = [
  "interview",
  "plan",
  "plan_review",
  "implement",
  "code_review",
  "document",
  "commit",
  "push",
  "done",
];

function createWorkflow(title: string): WorkflowInstance {
  const now = Date.now();
  return {
    id: `wf-${new Date(now).toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-")}`,
    title: title || "workflow",
    phase: "interview",
    history: [],
    undone: [],
    startedAt: now,
    updatedAt: now,
  };
}

function getNextPhase(phase: WorkflowPhase): WorkflowPhase | null {
  const index = WORKFLOW_PHASES.indexOf(phase);
  return index >= 0 ? WORKFLOW_PHASES[index + 1] ?? null : null;
}

function transitionWorkflow(workflow: WorkflowInstance, to: WorkflowPhase, reason: string): void {
  const from = workflow.phase;
  if (from !== to) {
    workflow.history.push({ from, to, reason, timestamp: Date.now() });
    workflow.undone = [];
  }
  workflow.phase = to;
  workflow.updatedAt = Date.now();
}

async function advanceWorkflow(workflow: WorkflowInstance | null, reason: string): Promise<{ ok: boolean; message: string }> {
  if (!workflow) return { ok: false, message: "진행 중인 workflow가 없습니다. /workflow start 를 먼저 실행하세요." };
  const from = workflow.phase;
  const next = getNextPhase(from);
  if (!next) return { ok: false, message: `이미 마지막 단계입니다: ${workflow.phase}` };

  const gate = await runPreTransitionGate(workflow, from, next);
  if (!gate.ok) return gate;

  transitionWorkflow(workflow, next, reason);
  saveWorkflow(workflow);
  return { ok: true, message: `Workflow 전이: ${from} → ${workflow.phase}` };
}

async function runPreTransitionGate(workflow: WorkflowInstance, from: WorkflowPhase, to: WorkflowPhase): Promise<{ ok: boolean; message: string }> {
  if (from === "plan_review" && to === "implement") {
    return runDpaaGate(workflow, from, to);
  }
  return { ok: true, message: "" };
}

function runDpaaGate(workflow: WorkflowInstance, from: WorkflowPhase, to: WorkflowPhase): { ok: boolean; message: string } {
  const planPath = findPlanForDpaa();
  if (!planPath) {
    return {
      ok: false,
      message: [
        "DPAA 검증을 실행할 plan 파일을 찾지 못했습니다.",
        "`.ai/interview/plan.md` 또는 `docs/superpowers/plans/*.md`에 plan을 작성한 뒤 다시 승인하세요.",
      ].join("\n"),
    };
  }

  const reportPath = path.join(os.tmpdir(), `dpaa-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  let exitCode = 0;
  try {
    execSync(`python -m dpaa.cli "${escapeForDoubleQuotedArg(planPath)}" --output "${escapeForDoubleQuotedArg(reportPath)}" --no-text`, {
      cwd: HARNESS_ROOT,
      encoding: "utf-8",
      stdio: "pipe",
    });
  } catch (error) {
    // DPAA returns a non-zero exit code when ambiguity findings fail the gate.
    // The JSON report is still written and is parsed below.
    exitCode = typeof (error as { status?: unknown }).status === "number" ? (error as { status: number }).status : 1;
  }

  let report: DpaaReport;
  let receipt: DpaaRunReceipt | null = null;
  try {
    report = JSON.parse(fs.readFileSync(reportPath, "utf-8")) as DpaaReport;
    receipt = writeDpaaReceipt({ workflow, from, to, planPath, reportPath, report, exitCode });
  } catch (error) {
    return {
      ok: false,
      message: `DPAA report를 읽지 못했습니다: ${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    fs.rmSync(reportPath, { force: true });
  }

  if (report.level === "PASS") {
    return { ok: true, message: "DPAA 검증 통과" };
  }

  const findings = report.findings.slice(0, 5).map((finding, index) => {
    const line = finding.line ? `line ${finding.line}` : "line unknown";
    return `${index + 1}. [${finding.layer}/${finding.rule}] ${line}: ${finding.message}\n   → ${finding.suggestion}`;
  });

  return {
    ok: false,
    message: [
      banner("❌ DPAA 검증 실패"),
      table([
        ["항목", "값"],
        ["결과", report.level],
        ["Penalty", String(report.overall)],
        ["대상 plan", path.relative(process.cwd(), planPath)],
        ["검증 기록", receipt ? `${receipt.timestamp} / ${receipt.planSha256.slice(0, 12)}` : "저장 실패"],
      ]),
      "",
      "➡️  남은 모호성을 추가 인터뷰로 보충한 뒤 영어 plan/spec을 수정하고 다시 승인하세요.",
      "",
      "상위 Findings",
      "──────────────────────────────────────",
      ...findings,
    ].join("\n"),
  };
}

function findPlanForDpaa(): string | null {
  const directCandidates = [
    path.join(process.cwd(), ".ai", "interview", "plan.md"),
    path.join(process.cwd(), "docs", "superpowers", "plans", "plan.md"),
  ];

  for (const candidate of directCandidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }

  const planDir = path.join(process.cwd(), "docs", "superpowers", "plans");
  if (!fs.existsSync(planDir) || !fs.statSync(planDir).isDirectory()) return null;

  const plans = fs.readdirSync(planDir)
    .filter((name) => name.endsWith(".md"))
    .map((name) => path.join(planDir, name))
    .filter((candidate) => fs.statSync(candidate).isFile())
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

  return plans[0] ?? null;
}

function escapeForDoubleQuotedArg(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}

function loadPersistedWorkflow(): WorkflowInstance | null {
  const file = getWorkflowStatePath();
  if (!fs.existsSync(file)) return null;

  try {
    const workflow = JSON.parse(fs.readFileSync(file, "utf-8")) as WorkflowInstance;
    if (!WORKFLOW_PHASES.includes(workflow.phase)) return null;
    return workflow;
  } catch {
    return null;
  }
}

function saveWorkflow(workflow: WorkflowInstance): void {
  const file = getWorkflowStatePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(workflow, null, 2), "utf-8");
}

function clearPersistedWorkflow(): void {
  fs.rmSync(getWorkflowStatePath(), { force: true });
}

function getWorkflowStatePath(): string {
  return path.join(getWorkflowStateDir(), "state.json");
}

function writeDpaaReceipt(args: {
  workflow: WorkflowInstance;
  from: WorkflowPhase;
  to: WorkflowPhase;
  planPath: string;
  reportPath: string;
  report: DpaaReport;
  exitCode: number;
}): DpaaRunReceipt {
  const receipt: DpaaRunReceipt = {
    timestamp: new Date().toISOString(),
    workflowId: args.workflow.id,
    from: args.from,
    to: args.to,
    projectRoot: process.cwd(),
    planPath: args.planPath,
    planSha256: sha256File(args.planPath),
    exitCode: args.exitCode,
    level: args.report.level,
    overall: args.report.overall,
    findingsCount: args.report.findings.length,
    reportSha256: sha256File(args.reportPath),
  };

  const dir = getDpaaReceiptDir();
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${Date.now()}-${receipt.level.toLowerCase()}.json`);
  fs.writeFileSync(file, JSON.stringify(receipt, null, 2), "utf-8");
  return receipt;
}

function formatLatestDpaaAudit(): string {
  const receipt = readLatestDpaaReceipt();
  if (!receipt) {
    return "⚪ DPAA 실행 기록이 없습니다.";
  }

  const icon = receipt.level === "PASS" ? "✅" : receipt.level === "WARN" ? "⚠️" : "❌";
  return [
    banner(`${icon} 최근 DPAA 실행 기록`),
    table([
      ["항목", "값"],
      ["시간", receipt.timestamp],
      ["Workflow", receipt.workflowId],
      ["전이", `${receipt.from} → ${receipt.to}`],
      ["결과", receipt.level],
      ["Penalty", `${receipt.overall} (낮을수록 좋음)`],
      ["Exit code", String(receipt.exitCode)],
      ["Findings", String(receipt.findingsCount)],
      ["Plan", path.relative(process.cwd(), receipt.planPath)],
      ["Plan hash", receipt.planSha256],
      ["Report hash", receipt.reportSha256],
    ]),
  ].join("\n");
}

function readLatestDpaaReceipt(): DpaaRunReceipt | null {
  const dir = getDpaaReceiptDir();
  if (!fs.existsSync(dir)) return null;

  const files = fs.readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => path.join(dir, name))
    .filter((file) => fs.statSync(file).isFile())
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

  if (!files[0]) return null;
  return JSON.parse(fs.readFileSync(files[0], "utf-8")) as DpaaRunReceipt;
}

function getDpaaReceiptDir(): string {
  return path.join(getWorkflowStateDir(), "dpaa-runs");
}

function getWorkflowStateDir(): string {
  return path.join(getAgentDir(), "workflow-state", projectHash(process.cwd()));
}

function getAgentDir(): string {
  return process.env.PI_CODING_AGENT_DIR ?? path.join(os.homedir(), ".pi", "agent");
}

function projectHash(root: string): string {
  return createHash("sha256").update(path.resolve(root)).digest("hex").slice(0, 16);
}

function sha256File(file: string): string {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function undoWorkflow(workflow: WorkflowInstance | null): { ok: boolean; message: string } {
  if (!workflow) return { ok: false, message: "진행 중인 workflow가 없습니다." };
  const last = workflow.history.pop();
  if (!last) return { ok: false, message: "되돌릴 workflow 전이가 없습니다." };
  workflow.phase = last.from;
  workflow.undone.push(last);
  workflow.updatedAt = Date.now();
  saveWorkflow(workflow);
  return { ok: true, message: `Workflow undo: ${last.to} → ${last.from}` };
}

function redoWorkflow(workflow: WorkflowInstance | null): { ok: boolean; message: string } {
  if (!workflow) return { ok: false, message: "진행 중인 workflow가 없습니다." };
  const next = workflow.undone.pop();
  if (!next) return { ok: false, message: "다시 실행할 workflow 전이가 없습니다." };
  workflow.phase = next.to;
  workflow.history.push(next);
  workflow.updatedAt = Date.now();
  saveWorkflow(workflow);
  return { ok: true, message: `Workflow redo: ${next.from} → ${next.to}` };
}

function formatWorkflowStatus(workflow: WorkflowInstance | null): string {
  if (!workflow) {
    return [
      banner("⚪ Workflow 없음"),
      "시작: /workflow start <목표>",
    ].join("\n");
  }
  const next = getNextPhase(workflow.phase);
  return [
    banner("🧭 Workflow 상태"),
    table([
      ["항목", "값"],
      ["ID", workflow.id],
      ["목표", workflow.title],
      ["현재 단계", workflow.phase],
      ["다음 단계", next ?? "없음"],
      ["Undo 가능", workflow.history.length > 0 ? "yes" : "no"],
      ["Redo 가능", workflow.undone.length > 0 ? "yes" : "no"],
    ]),
  ].join("\n");
}

function formatWorkflowHistory(workflow: WorkflowInstance | null): string {
  if (!workflow) return "⚪ 진행 중인 workflow가 없습니다.";
  if (workflow.history.length === 0) return "⚪ Workflow 전이 이력이 없습니다.";
  return [
    banner("🕘 Workflow 전이 이력"),
    table([
      ["#", "전이", "사유"],
      ...workflow.history.map((item, index) => [String(index + 1), `${item.from} → ${item.to}`, item.reason]),
    ]),
  ].join("\n");
}

function banner(title: string): string {
  const width = Math.max(36, displayWidth(title) + 2);
  return [
    `╔${"═".repeat(width)}╗`,
    `║ ${padDisplay(title, width - 1)}║`,
    `╚${"═".repeat(width)}╝`,
  ].join("\n");
}

function table(rows: string[][]): string {
  const widths = rows[0].map((_, column) => Math.max(...rows.map((row) => displayWidth(String(row[column] ?? "")))));
  return rows.map((row, index) => {
    const line = `| ${row.map((cell, column) => padDisplay(String(cell ?? ""), widths[column])).join(" | ")} |`;
    if (index !== 0) return line;
    const separator = `| ${widths.map((width) => "-".repeat(width)).join(" | ")} |`;
    return `${line}\n${separator}`;
  }).join("\n");
}

function padDisplay(value: string, width: number): string {
  return value + " ".repeat(Math.max(0, width - displayWidth(value)));
}

function displayWidth(value: string): number {
  let width = 0;
  for (const char of Array.from(value)) {
    width += isWideChar(char) ? 2 : 1;
  }
  return width;
}

function isWideChar(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  return (
    (code >= 0x1100 && code <= 0x11ff) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe10 && code <= 0xfe19) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x1f000 && code <= 0x1faff)
  );
}

function formatWorkflowPrompt(workflow: WorkflowInstance | null): string {
  if (!workflow) {
    return [
      "• No active workflow.",
      "• For procedural work, suggest /workflow start <goal> to the user.",
    ].join("\n");
  }
  const next = getNextPhase(workflow.phase);
  const lines = [
    `• Current phase: ${workflow.phase}`,
    `• Next phase: ${next ?? "none"}`,
    "• Present the current phase deliverable first, then ask for user confirmation before advancing.",
    "• The user can approve the next transition with /workflow approve or natural language such as '응, 진행해'.",
    "• This workflow state is persisted outside the workspace; commit approval tokens are not persisted.",
    "• This workflow is advisory except for enforced transition gates such as DPAA before implementation.",
  ];
  if (workflow.phase === "plan_review") {
    lines.push("• Moving from plan_review to implement requires DPAA to pass against the current English plan.");
    lines.push("• Ensure .ai/interview/spec.md and .ai/interview/plan.md are written in English for DPAA compatibility.");
    lines.push("• If DPAA fails, conduct additional interview, update the English plan, and ask for approval again.");
  }
  return lines.join("\n");
}

function isApprovalText(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return false;
  const approvals = ["응", "네", "예", "좋아", "좋습니다", "진행해", "진행해줘", "계속해", "다음", "승인", "approve", "approved", "ok", "okay", "go ahead", "continue"];
  return approvals.some((token) => normalized === token || normalized.includes(token));
}

/** bash 명령이 git commit인지 판별 (hook-common.sh의 is_git_commit과 동일 로직) */
function isGitCommit(cmd: string): boolean {
  const normalized = cmd
    .replace(/'[^']*'/g, "")
    .replace(/"[^"]*"/g, "")
    .replace(/git\s+-C\s+\S+/g, "git");
  return /(?:^|[|;&\s])git\s+commit(?:\s|$)/.test(normalized);
}

/** -m 옵션의 커밋 메시지 추출. heredoc/-F 방식이면 null 반환 (검사 불가) */
function extractCommitMessage(cmd: string): string | null {
  const sq = cmd.match(/-m\s+'([^']+)'/);
  if (sq) return sq[1];
  const dq = cmd.match(/-m\s+"([^"]+)"/);
  if (dq) return dq[1];
  return null;
}

/** Conventional Commits 형식 검사 (guard-commit-message.sh 패턴과 동일) */
function isConventionalCommit(msg: string): boolean {
  return /^(feat|fix|chore|refactor|docs|test|perf|ci|style|revert)(\([a-z0-9][a-z0-9-]*\))?!?:\s.{1,100}$/.test(
    msg.trim()
  );
}

function getGitRoot(): string | null {
  try {
    return execSync("git rev-parse --show-toplevel", {
      encoding: "utf-8",
      stdio: "pipe",
    }).trim();
  } catch {
    return null;
  }
}

function getBranch(root: string): string {
  try {
    return execSync(`git -C "${root}" rev-parse --abbrev-ref HEAD`, {
      encoding: "utf-8",
      stdio: "pipe",
    }).trim();
  } catch {
    return "unknown";
  }
}

/**
 * 테스트 없는 production Java 클래스 목록 반환.
 * hook-common.sh의 is_unimportant_file 패턴과 동일한 제외 규칙 적용.
 */
function getUntestedClasses(root: string): string[] {
  const EXCLUDE_SUFFIX =
    /(DTO|Request|Response|Config|Configuration|Application|Properties|Exception|Error|Enum|Record|Constants|Client|Publisher|Checker|Aspect|Controller|Result)$/;
  const EXCLUDE_PREFIX = /^Q[A-Z]|^Migration/;

  try {
    const out = execSync(
      `find "${root}" -path "*/src/main/java/*.java" ! -name "package-info.java" 2>/dev/null`,
      { encoding: "utf-8", stdio: "pipe" }
    ).trim();
    if (!out) return [];

    const untested: string[] = [];
    for (const mainFile of out.split("\n").filter(Boolean)) {
      const className = path.basename(mainFile, ".java");
      if (EXCLUDE_SUFFIX.test(className) || EXCLUDE_PREFIX.test(className)) continue;
      if (/\/dto\/|\/entity\/|\/model\/|\/repository\//.test(mainFile)) continue;

      const testDir = mainFile
        .replace("/src/main/java/", "/src/test/java/")
        .replace(`/${path.basename(mainFile)}`, "");
      const testFile = path.join(testDir, `${className}Test.java`);
      if (!fs.existsSync(testFile)) {
        untested.push(className);
      }
    }
    return untested;
  } catch {
    return [];
  }
}
