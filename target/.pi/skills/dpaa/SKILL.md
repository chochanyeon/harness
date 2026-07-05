---
name: dpaa
description: Interpret and repair DPAA failures during `plan_review`. The workflow extension mechanically enforces DPAA before `implement`. Output language is Korean.
---

# DPAA Skill

DPAA is the deterministic ambiguity guard for plans. The extension enforces:

```text
plan_review → implement requires DPAA PASS
```

## Output Language

Respond in Korean.

## Artifacts

- Korean source of truth: `.ai/interview/spec.ko.md`, `.ai/interview/plan.ko.md`
- English DPAA inputs: `.ai/interview/spec.md`, `.ai/interview/plan.md`
- English files must be faithful translations of the Korean source; do not change them independently.

The extension checks the current plan from:

1. `.ai/interview/plan.md`
2. `docs/superpowers/plans/plan.md`
3. newest `docs/superpowers/plans/*.md`

## Adaptive Gate Metadata

At the top of each plan, include explicit metadata so DPAA/SBADR applies the intended strictness instead of relying only on keyword fallback:

```markdown
Risk: normal
Work type: feature
Ambiguity gate: standard
```

Allowed values:

- `Risk: low|normal|high`
- `Work type: docs|cosmetic|discovery|feature|api|security|migration|data|deploy`
- `Ambiguity gate: advisory|standard|strict`

Use `advisory` only for low-risk documentation/cosmetic/discovery plans. Use `strict` for API contracts, schema/database changes, security/privacy, migrations, data loss, CI/deploy/release, or destructive behavior.

## When DPAA Blocks

Triage each finding and act autonomously where possible. **Do not ask the user unless a genuine business decision is required.**

### Autonomous repair (no user input needed)

Fix these without asking:

| Finding type | Action |
|---|---|
| Vague / passive phrasing | Rewrite as active, specific sentences |
| Undefined pronouns (it/they/this) | Replace with explicit subjects |
| Hedging language (might/could/possibly/would) | Replace with definitive statements |
| Missing measurable acceptance criteria | Infer from stated goals; make concrete and testable |
| Placeholder text or TODO markers | Expand into full statements |
| SBADR syntactic ambiguity | Rewrite sentence structure for unambiguous parse |

### SBADR-safe English plan sentences

When you write or repair `.ai/interview/plan.md`, use sentence forms that SBADR can parse deterministically:

- Use explicit subjects and explicit verbs in every requirement sentence.
- Avoid ambiguous demonstratives such as `this`, `that`, `these`, and `those`; repeat the concrete noun instead.
- Avoid weak verbs by themselves, such as `update`, `improve`, `support`, or `preserve`; pair each verb with a concrete object and measurable result.
- Avoid long prepositional attachments; split the sentence when `in`, `with`, `for`, or `by` could attach to more than one phrase.
- Avoid ambiguous parallel lists; split `A, B, C, or D` into separate bullet items when each item is a separate requirement.

Steps for autonomous repair:

1. Fix the Korean source artifact (`plan.ko.md`) first.
2. Update the English artifact (`plan.md`) as a faithful translation — every requirement must match.
3. Retry `/workflow approve` immediately without reporting to the user.
4. Repeat until DPAA PASS or a genuine business decision is reached.

### User input required

Only ask the user when:
- The correct behavior is genuinely unclear from context (business decision with multiple valid outcomes).
- A requirement is missing entirely and cannot be inferred.

When asking, explain the specific ambiguity in Korean and offer concrete options.

Use `/workflow dpaa-audit` to inspect the latest receipt/snapshot when needed.

## Manual Check

```bash
PYTHONPATH=.pi python -m dpaa.cli .ai/interview/plan.md
```

If `python` is unavailable on macOS/Linux, use `python3`:

```bash
PYTHONPATH=.pi python3 -m dpaa.cli .ai/interview/plan.md
```

or:

```bash
PYTHONPATH=.pi python -m dpaa.cli docs/superpowers/plans/<plan-file>.md
```

## Success Criteria

- User-approved plan.
- DPAA PASS.
- Korean source artifacts and English DPAA artifacts describe the same requirements.
- Acceptance criteria are objective and no placeholders remain.
