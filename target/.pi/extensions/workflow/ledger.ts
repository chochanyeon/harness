import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { WorkflowInstance, WorkflowPhase, WorkflowTaskStatus } from "./types";

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
  review: { submitted: boolean; summary?: { critical: number; major: number; minor: number; reviewedFileCount?: number } };
  nextSafeAction: { phase: WorkflowPhase; summary: string };
};

export type WorkflowLedgerUpdate = {
  planArtifactPaths?: string[];
  changedFiles?: string[];
  verification?: { commandId: string; ok: boolean; exitCode: number | null; artifactPath?: string };
  review?: { critical: number; major: number; minor: number; reviewedFiles?: string[] };
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
  return {
    schemaVersion: 1,
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
      artifactPaths: (update.planArtifactPaths ?? defaultPlanArtifactPaths()).map((item) => item.replace(/\\/g, "/")),
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
    review: {
      submitted: Boolean(update.review),
      summary: update.review ? {
        critical: update.review.critical,
        major: update.review.major,
        minor: update.review.minor,
        reviewedFileCount: update.review.reviewedFiles?.length,
      } : undefined,
    },
    nextSafeAction: {
      phase: workflow.phase,
      summary: summarizeNextSafeAction(workflow.phase),
    },
  };
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

function summarizeNextSafeAction(phase: WorkflowPhase): string {
  const actions: Record<WorkflowPhase, string> = {
    interview: "Clarify requirements and record interview score evidence.",
    plan: "Write DPAA-ready spec and plan artifacts, then advance to plan_review.",
    plan_review: "Run DPAA/SBADR and repair plan ambiguity before implementation.",
    implement: "implement: complete approved scope, collect verification evidence, then advance to code_review.",
    code_review: "Collect self-review, independent review, and quality gate evidence before submitting review package.",
    review_approved: "Prepare documentation updates for the approved changes.",
    document: "Update required docs and prepare commit summary.",
    commit: "Stage reviewed changes and create the approved commit.",
    push: "Run the guarded git-push command and observe success.",
    done: "Workflow is complete.",
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
