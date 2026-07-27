import type { WorkflowPhase } from "../types";

export type PhaseTemplateName = "full" | "light";

/**
 * Reads a `Phase Template: <name>` metadata line from plan text, mirroring
 * ambiguity-gate-policy.ts's parseAmbiguityPolicyMetadata scan range and style.
 * Returns undefined when no line matches or the matched value is unrecognized.
 */
export function parsePhaseTemplateMetadata(planText: string): PhaseTemplateName | undefined {
  for (const line of planText.split(/\r?\n/).slice(0, 40)) {
    const match = line.match(/^\s*(?:[-*]\s*)?phase\s*template\s*:\s*([^#]+?)\s*$/i);
    if (!match) continue;
    const value = match[1].trim().toLowerCase();
    if (value === "light" || value === "full") return value;
  }
  return undefined;
}

/**
 * Filters basePhases for a given template name. "light" removes the document
 * phase. Any other value (including undefined) returns basePhases unchanged.
 * basePhases is passed in by the caller (policy-core.ts's sharedWorkflowPhases())
 * rather than imported here, to avoid a circular import between this module
 * and policy-core.ts.
 */
export function getPhaseTemplatePhases(templateName: PhaseTemplateName | undefined, basePhases: WorkflowPhase[]): WorkflowPhase[] {
  if (templateName === "light") return basePhases.filter((phase) => phase !== "document");
  return basePhases;
}
