---
name: dpaa
description: Deterministic Plan Ambiguity Analyzer workflow. Use during plan_review, before implementation, or whenever a spec/plan may contain ambiguity. The workflow extension automatically enforces DPAA when moving from plan_review to implement; this skill explains how to interpret failures and repair the plan through additional interview. Output language is Korean.
---

# DPAA Skill

DPAA is the deterministic ambiguity gate for plans. It complements the interview skill:

1. The LLM conducts a detailed interview to remove ambiguity.
2. The spec and plan are written or updated in English.
3. DPAA mechanically checks the plan.
4. If DPAA fails, do not implement. Ask targeted follow-up questions, update the plan, and run/trigger DPAA again.

DPAA currently uses English-centered deterministic rules. User-facing conversation may be Korean, but `.ai/interview/spec.md` and `.ai/interview/plan.md` must be English for reliable DPAA results.

## Output Language

Respond to the user in Korean.

## When to Use

Use this skill when:

- The workflow is in `plan_review`.
- The user asks whether ambiguity has been checked.
- A plan/spec is ready and implementation is about to begin.
- DPAA blocks transition to implementation.

## Mechanical Gate

The Pi workflow extension enforces this transition:

```text
plan_review → implement requires DPAA PASS
```

The extension looks for the current plan in this order:

1. `.ai/interview/plan.md`
2. `docs/superpowers/plans/plan.md`
3. The newest `docs/superpowers/plans/*.md`

If DPAA fails, stay in `plan_review` and repair the plan before asking the user to approve again. If the plan is written in Korean, translate/rewrite the checked spec/plan artifacts into English before re-running DPAA.

## Manual Command

When manual verification is needed, run from the project root:

```bash
python -m dpaa.cli .ai/interview/plan.md
```

or for a plan under `docs/superpowers/plans/`:

```bash
python -m dpaa.cli docs/superpowers/plans/<plan-file>.md
```

## Failure Handling

For each DPAA finding:

1. Identify the ambiguous sentence or missing constraint.
2. Ask the user a targeted follow-up question.
3. Update the spec/plan with the clarified answer.
4. Re-run DPAA or ask the user to approve the transition again.

Do not treat DPAA failure as an implementation task. It is a requirements-quality failure.

## Success Criteria

Proceed to implementation only when:

- The user has approved the plan.
- DPAA reports `PASS`.
- The checked spec/plan artifacts are written in English.
- The plan has objective acceptance criteria and no unresolved placeholders.
