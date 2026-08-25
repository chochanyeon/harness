export const EXECUTION_PROFILES = ["fast", "adaptive", "strict"] as const;

export type ExecutionProfile = typeof EXECUTION_PROFILES[number];

export type ExecutionProfileEscalation = {
  from: Exclude<ExecutionProfile, "strict">;
  to: "strict";
  reason: string;
  timestamp: number;
};

type ExecutionProfileCarrier = {
  executionProfile?: ExecutionProfile;
  executionProfileEscalation?: ExecutionProfileEscalation;
};

/**
 * Persisted workflows created before execution profiles existed must retain
 * the existing full-workflow behavior rather than silently becoming adaptive.
 */
export function resolveExecutionProfile(workflow: Pick<ExecutionProfileCarrier, "executionProfile">): ExecutionProfile {
  return isExecutionProfile(workflow.executionProfile) ? workflow.executionProfile : "strict";
}

/**
 * Raises a workflow to strict handling once. The original escalation reason is
 * retained so later runtime layers can explain why the stricter contract applies.
 */
export function escalateExecutionProfile(
  workflow: ExecutionProfileCarrier,
  reason: string,
  timestamp = Date.now(),
): boolean {
  const normalizedReason = reason.trim();
  if (!normalizedReason) throw new Error("Execution-profile escalation requires a reason.");

  const from = resolveExecutionProfile(workflow);
  if (from === "strict") return false;

  workflow.executionProfile = "strict";
  workflow.executionProfileEscalation = {
    from,
    to: "strict",
    reason: normalizedReason,
    timestamp,
  };
  return true;
}

const SENSITIVE_CHANGE_PATH_RULES: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /(^|\/)\.github\/workflows\//i, reason: "CI workflow path changed" },
  { pattern: /(^|\/)(dockerfile|docker-compose[^/]*)$/i, reason: "Container/deployment path changed" },
  { pattern: /(^|\/)(infra|infrastructure|terraform|k8s|kubernetes)\//i, reason: "Infrastructure path changed" },
  { pattern: /(^|\/)(migrations?|db|database|schema)\//i, reason: "Database/schema path changed" },
  { pattern: /(^|\/)(auth|security|permissions?)\//i, reason: "Authentication or authorization path changed" },
  { pattern: /(^|\/)(openapi|swagger)\//i, reason: "Public API contract path changed" },
];

/** Returns an escalation reason when a changed path carries a high-risk signal. */
export function sensitiveChangeReasonForPath(filePath: string): string | null {
  const normalized = filePath.replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase();
  return SENSITIVE_CHANGE_PATH_RULES.find(({ pattern }) => pattern.test(normalized))?.reason ?? null;
}

export function isExecutionProfile(value: unknown): value is ExecutionProfile {
  return typeof value === "string" && (EXECUTION_PROFILES as readonly string[]).includes(value);
}
