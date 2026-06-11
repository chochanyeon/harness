# Workflow Protocol Taxonomy

This document separates the default workflow path from situational protocols. The goal is to keep the workflow easy to operate while preserving safety tools for high-risk or unusual cases.

## Default Flow

The default workflow remains linear:

```text
interview → plan → plan_review → implement → code_review → review_approved → document → commit → push → done
```

Only these are part of the normal path:

| Flow step | Purpose | Required by default |
|-----------|---------|---------------------|
| `interview` | clarify goal, topology, scope, acceptance, constraints | yes |
| `plan` | write human-readable and DPAA/SBADR artifacts | yes |
| `plan_review` | review/repair plan and request implementation approval | yes |
| `implement` | change approved scope | yes |
| `code_review` | self-review, independent review, quality gates | yes |
| `document` | update required docs | yes when behavior/docs are affected |
| `commit` | record verified changes | yes for pushed work |
| `push` | publish after explicit approval | yes when requested |

## Conditional Protocols

These protocols are situational safety tools. They do **not** add mandatory steps to every workflow unless their trigger applies.

| Category | Protocol / skill | Trigger | Not part of default flow because |
|----------|------------------|---------|----------------------------------|
| Discovery | `trace` | anomaly, repeated failure, unclear cause | normal work should not require causal debugging |
| Validation | `evidence-verification` | completion claim, workflow/prompt/guard/runtime change, dogfood gap | routine checks can stay short when no workflow behavior changed |
| Execution safety | `continuation-safety` | failed tool/guard/transition, pending subagent/async/background/reviewer work | only needed when continuation state is unclear |
| Execution safety | `worktree-safety` | creating/reusing/cleaning worktrees | irrelevant when no worktree is used |
| Context | `compact-handoff` | long session or manual context compaction | compaction is occasional, not a normal phase |
| Cleanup | `cleanup` | AI slop, duplication, dead code, needless abstraction | cleanup should be scoped and behavior-preserving, not automatic refactoring |

## Use Rules

1. Start with the default flow.
2. Invoke a conditional protocol only when its trigger is present.
3. Do not add a protocol checklist to every phase summary.
4. If two protocols apply, prefer the one closest to the blocker:
   - failure or pending work → `continuation-safety`
   - completion evidence or workflow regression risk → `evidence-verification`
   - causal uncertainty → `trace`
   - context loss risk → `compact-handoff`
5. Protocols provide guidance; mechanical guard evidence still comes from the workflow extension.

## Complexity Budget

Before adding another protocol or skill, answer:

- Can this be a section in an existing protocol?
- Is the trigger distinct from existing triggers?
- Does it change runtime mechanics or only LLM guidance?
- Can README mention be replaced by a link to this taxonomy?
- Is there a static or runtime test for the behavior that must not regress?

Prefer merging over adding when the new behavior is another form of verification, continuation safety, cleanup, or context handoff.
