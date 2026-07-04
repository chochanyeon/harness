import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { WorkflowInstance, WorkflowPhase, WorkflowTaskStatus } from "./types";

export type WorkflowLedgerCoverageStatus = "covered" | "needs_verification" | "unknown";

export type WorkflowLedgerCoverageItem = {
  id: string;
  label: string;
  status: WorkflowLedgerCoverageStatus;
  evidence: string[];
};

export type WorkflowLedgerSnapshot = {
  schemaVersion: 1;
  workflowId: string;
  title: string;
  branch: string;
  cwd: string;
  gitRoot: string | null;
  phase: { current: WorkflowPhase; historyCount: number; lastTransition?: { from: WorkflowPhase; to: WorkflowPhase; reason: string; timestamp: number } };
  startedAt: string;
  updatedAt: string;
  planCoverage: { artifactPaths: string[]; taskCounts: Record<WorkflowTaskStatus | "none", number>; activeTask?: { id: string; title: string; acceptanceCount: number; verificationCount: number } };
  diffCoverage: { changedFileCount: number; changedFiles: string[]; truncated: boolean };
  verification: { commandCount: number; lastCommand?: { commandId: string; ok: boolean; exitCode: number | null; artifactPath?: string } };
  verificationCoverage: { items: WorkflowLedgerCoverageItem[]; counts: { covered: number; needsVerification: number; unknown: number } };
  review: { submitted: boolean; summary?: { critical: number; major: number; minor: number; reviewedFileCount?: number } };
  nextSafeAction: { phase: WorkflowPhase; summary: string };
  resume: { summary: string; generatedAt: string };
};

export type WorkflowLedgerUpdate = {
  planArtifactPaths?: string[];
  changedFiles?: string[];
  verification?: { commandId: string; ok: boolean; exitCode: number | null; artifactPath?: string };
  review?: { critical: number; major: number; minor: number; reviewedFiles?: string[]; reviewedFileCount?: number };
};

export type WorkflowLedgerDescriptor = { path: string; workflowId: string; updatedAt: string };

const MAX_CHANGED_FILES = 20;

export function getWorkflowLedgerPath(workflow: Pick<WorkflowInstance, "id">, root = process.cwd()): string {
  return path.join(root, ".ai", "interview", "runs", workflow.id, "ledger.json");
}

export function createWorkflowLedgerSnapshot(workflow: WorkflowInstance, update: WorkflowLedgerUpdate = {}): WorkflowLedgerSnapshot {
  const lastTransition = workflow.history.at(-1);
  const taskCounts = summarizeTaskCounts(workflow);
  const activeTask = workflow.taskQueue?.activeTaskId
    ? workflow.taskQueue.tasks.find((task) => task.id === workflow.taskQueue?.activeTaskId)
    : undefined;
  const changedFiles = Array.from(new Set((update.changedFiles ?? collectChangedFiles(workflow.gitRoot ?? workflow.cwd)).map((file) => file.replace(/\\/g, "/"))));
  const artifactPaths = (update.planArtifactPaths ?? defaultPlanArtifactPaths()).map((item) => item.replace(/\\/g, "/"));
  const verificationCoverage = createVerificationCoverage(workflow, artifactPaths, update.verification);
  const reviewSummary = update.review ? {
    critical: update.review.critical,
    major: update.review.major,
    minor: update.review.minor,
    reviewedFileCount: update.review.reviewedFiles?.length ?? update.review.reviewedFileCount,
  } : undefined;
  const baseSnapshot = {
    schemaVersion: 1 as const,
    workflowId: workflow.id,
    title: workflow.title,
    branch: workflow.branch,
    cwd: workflow.cwd,
    gitRoot: workflow.gitRoot,
    phase: {
      current: workflow.phase,
      historyCount: workflow.history.length,
      lastTransition: lastTransition ? {
        from: lastTransition.from,
        to: lastTransition.to,
        reason: truncate(lastTransition.reason, 160),
        timestamp: lastTransition.timestamp,
      } : undefined,
    },
    startedAt: new Date(workflow.startedAt).toISOString(),
    updatedAt: new Date(workflow.updatedAt).toISOString(),
    planCoverage: {
      artifactPaths,
      taskCounts,
      activeTask: activeTask ? {
        id: activeTask.id,
        title: truncate(activeTask.title, 160),
        acceptanceCount: activeTask.acceptanceCriteria.length,
        verificationCount: activeTask.verification.length,
      } : undefined,
    },
    diffCoverage: {
      changedFileCount: changedFiles.length,
      changedFiles: changedFiles.slice(0, MAX_CHANGED_FILES),
      truncated: changedFiles.length > MAX_CHANGED_FILES,
    },
    verification: {
      commandCount: update.verification ? 1 : 0,
      lastCommand: update.verification ? {
        commandId: update.verification.commandId,
        ok: update.verification.ok,
        exitCode: update.verification.exitCode,
        artifactPath: update.verification.artifactPath?.replace(/\\/g, "/"),
      } : undefined,
    },
    verificationCoverage,
    review: {
      submitted: Boolean(update.review),
      summary: reviewSummary,
    },
    nextSafeAction: {
      phase: workflow.phase,
      summary: summarizeNextSafeAction(workflow.phase, update),
    },
  };
  const snapshot = {
    ...baseSnapshot,
    resume: { summary: "", generatedAt: new Date(workflow.updatedAt).toISOString() },
  } satisfies WorkflowLedgerSnapshot;
  snapshot.resume.summary = formatWorkflowLedgerResumeSummary(snapshot);
  return snapshot;
}

export function writeWorkflowLedgerSnapshot(workflow: WorkflowInstance, root = workflow.gitRoot ?? process.cwd(), update: WorkflowLedgerUpdate = {}): WorkflowLedgerDescriptor {
  const file = getWorkflowLedgerPath(workflow, root);
  const previous = readExistingLedger(file);
  const mergedUpdate: WorkflowLedgerUpdate = {
    planArtifactPaths: update.planArtifactPaths ?? previous?.planCoverage?.artifactPaths,
    changedFiles: update.changedFiles,
    verification: update.verification ?? previous?.verification?.lastCommand,
    review: update.review ?? (previous?.review?.summary ? { ...previous.review.summary } : undefined),
  };
  const snapshot = createWorkflowLedgerSnapshot(workflow, mergedUpdate);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(snapshot, null, 2)}\n`, "utf-8");
  return { path: file, workflowId: workflow.id, updatedAt: snapshot.updatedAt };
}

export function safeWriteWorkflowLedgerSnapshot(workflow: WorkflowInstance | null | undefined, root?: string, update: WorkflowLedgerUpdate = {}): WorkflowLedgerDescriptor | null {
  if (!workflow) return null;
  try {
    return writeWorkflowLedgerSnapshot(workflow, root ?? workflow.gitRoot ?? process.cwd(), update);
  } catch {
    return null;
  }
}

export function readWorkflowLedgerSnapshot(workflow: Pick<WorkflowInstance, "id" | "gitRoot">, root = workflow.gitRoot ?? process.cwd()): WorkflowLedgerSnapshot | null {
  return readExistingLedger(getWorkflowLedgerPath(workflow, root));
}

export function formatWorkflowLedgerResumeSummary(snapshot: WorkflowLedgerSnapshot): string {
  const verification = snapshot.verification.lastCommand
    ? `${snapshot.verification.lastCommand.commandId}:${snapshot.verification.lastCommand.ok ? "pass" : "fail"}`
    : "none";
  const review = snapshot.review.summary
    ? `Cr${snapshot.review.summary.critical}/Maj${snapshot.review.summary.major}/Min${snapshot.review.summary.minor}`
    : "none";
  const counts = snapshot.verificationCoverage?.counts ?? { covered: 0, needsVerification: 0, unknown: 0 };
  return [
    `phase=${snapshot.phase.current}`,
    `verification=${verification}`,
    `coverage=${counts.covered}/${counts.needsVerification}/${counts.unknown}`,
    `review=${review}`,
    `diff=${snapshot.diffCoverage.changedFileCount}`,
    `next=${truncate(snapshot.nextSafeAction.summary, 180)}`,
  ].join("; ");
}

export function formatWorkflowLedgerResumePrompt(workflow: Pick<WorkflowInstance, "id" | "gitRoot">, root = workflow.gitRoot ?? process.cwd()): string | null {
  const snapshot = readWorkflowLedgerSnapshot(workflow, root);
  if (!snapshot) return null;
  return ["[Run Ledger Resume]", formatWorkflowLedgerResumeSummary(snapshot), "[/Run Ledger Resume]"].join("\n");
}

function summarizeTaskCounts(workflow: WorkflowInstance): Record<WorkflowTaskStatus | "none", number> {
  if (!workflow.taskQueue) return { none: 1, pending: 0, active: 0, done: 0, blocked: 0, deferred: 0 };
  return workflow.taskQueue.tasks.reduce((acc, task) => {
    acc[task.status] = (acc[task.status] ?? 0) + 1;
    return acc;
  }, { none: 0, pending: 0, active: 0, done: 0, blocked: 0, deferred: 0 } as Record<WorkflowTaskStatus | "none", number>);
}

function defaultPlanArtifactPaths(): string[] {
  return [".ai/interview/spec.ko.md", ".ai/interview/spec.md", ".ai/interview/plan.ko.md", ".ai/interview/plan.md"];
}

function createVerificationCoverage(workflow: WorkflowInstance, artifactPaths: string[], verification: WorkflowLedgerUpdate["verification"]): WorkflowLedgerSnapshot["verificationCoverage"] {
  const activeTask = workflow.taskQueue?.activeTaskId
    ? workflow.taskQueue.tasks.find((task) => task.id === workflow.taskQueue?.activeTaskId)
    : undefined;
  const evidence = verification ? [`${verification.commandId}:${verification.ok ? "pass" : "fail"}`] : [];
  const status: WorkflowLedgerCoverageStatus = verification ? (verification.ok ? "covered" : "needs_verification") : "unknown";
  const items: WorkflowLedgerCoverageItem[] = activeTask?.acceptanceCriteria.length
    ? activeTask.acceptanceCriteria.map((label, index) => ({
      id: `${activeTask.id}:acceptance:${index + 1}`,
      label: truncate(label, 160),
      status,
      evidence,
    }))
    : [
      {
        id: "plan-artifacts",
        label: "Plan artifacts available",
        status: artifactPaths.length > 0 ? "covered" : "unknown",
        evidence: artifactPaths.length > 0 ? [`planArtifacts:${artifactPaths.length}`] : [],
      },
      {
        id: "latest-verification",
        label: "Latest verification evidence",
        status,
        evidence,
      },
    ];
  return { items, counts: countCoverageItems(items) };
}

function countCoverageItems(items: WorkflowLedgerCoverageItem[]): WorkflowLedgerSnapshot["verificationCoverage"]["counts"] {
  return items.reduce((acc, item) => {
    if (item.status === "needs_verification") acc.needsVerification += 1;
    else acc[item.status] += 1;
    return acc;
  }, { covered: 0, needsVerification: 0, unknown: 0 });
}

function collectChangedFiles(root: string): string[] {
  try {
    const output = execFileSync("git", ["-C", root, "status", "--short"], { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] });
    return output
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map((line) => line.slice(3).trim().replace(/^(.+)\s+->\s+(.+)$/, "$2"))
      .filter((file) => file && !isGeneratedWorkflowArtifactPath(file));
  } catch {
    return [];
  }
}

function isGeneratedWorkflowArtifactPath(file: string): boolean {
  const normalized = file.replace(/\\/g, "/");
  return normalized === ".ai" || normalized === ".ai/" || normalized.startsWith(".ai/") || normalized === ".project-memory" || normalized === ".project-memory/" || normalized.startsWith(".project-memory/");
}

function summarizeNextSafeAction(phase: WorkflowPhase, update: WorkflowLedgerUpdate): string {
  const hasVerification = Boolean(update.verification);
  const hasReview = Boolean(update.review);
  if (phase === "implement" && !hasVerification) return "implement: run targeted verification for current changes before code_review.";
  if (phase === "implement") return "implement: verification evidence exists; finish the approved scope and advance to code_review.";
  if (phase === "code_review" && !hasReview) return "code_review: collect self-review, independent review, and quality gate evidence before submit_review_package.";
  if (phase === "code_review") return "code_review: review evidence exists; submit the review package when quality evidence is complete.";
  if (phase === "commit" && !hasVerification) return "commit: check verification evidence before staging and committing.";
  const actions: Record<WorkflowPhase, string> = {
    interview: "interview: clarify requirements and record interview score evidence.",
    plan: "plan: write DPAA-ready spec and plan artifacts, then advance to plan_review.",
    plan_review: "plan_review: run DPAA/SBADR and repair plan ambiguity before implementation.",
    implement: "implement: complete approved scope, collect verification evidence, then advance to code_review.",
    code_review: "code_review: collect self-review, independent review, and quality gate evidence before submitting review package.",
    review_approved: "review_approved: prepare documentation updates for the approved changes.",
    document: "document: update required docs and prepare commit summary.",
    commit: "commit: stage reviewed changes and create the approved commit.",
    push: "push: run the guarded git-push command and observe success.",
    done: "done: workflow is complete.",
  };
  return actions[phase];
}

function readExistingLedger(file: string): WorkflowLedgerSnapshot | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8")) as WorkflowLedgerSnapshot;
  } catch {
    return null;
  }
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}
