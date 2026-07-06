# DevCenter Harness — Workflow Guide

This file is the concise operating map. Mechanical enforcement lives in `.pi/extensions/workflow.ts`; LLM instructions should stay short and phase-focused.

## Core Workflow

```text
interview
→ plan
→ plan_review
→ implement
→ code_review
→ review_approved
→ document
→ commit
→ push
→ done
```

| Phase | LLM job | Guard / exit condition |
|------|---------|------------------------|
| `interview` | Clarify requirements and unknowns. | Auto-advances to `plan` after user approval starts forward progress. |
| `plan` | Write/update spec + plan artifacts. | Auto-advances to `plan_review`; this means "ready for plan review", not plan approval. |
| `plan_review` | Present plan and resolve ambiguity. For high-risk plans, run Architect/Critic consensus review before implementation approval. | DPAA PASS required before `implement`. Auto-advances on pass; auto-returns to `plan` on fail. |
| `implement` | Implement only the approved plan. | Auto-starts review/quality flow after implementation work is ready. |
| `code_review` | Main-agent and reviewer-agent review/fix/re-review loop. | Auto-advances to `review_approved` after review/quality gates pass. |
| `review_approved` | Review gates passed. | Auto-advances to `document`. |
| `document` | Update required docs/Swagger/feature notes. | Auto-advances to `commit`; this means "ready to prepare commit", not permission to push. |
| `commit` | Present summary and commit message. | User approval required before `push`; push policy scan is confirmed here when risky changes are present. |
| `push` | Push only after extension guards pass. | Successful push, then mark done. If workspace risk signature changed after approval, policy scan asks again. |
| `done` | No active work. | Start a new workflow if needed. |

## Default Flow vs Conditional Protocols

The default path is the phase sequence above. Conditional protocols (`trace`, `evidence-verification`, `continuation-safety`, `compact-handoff`, `worktree-safety`, `cleanup`) are situational safety tools; do not add them as mandatory checklist items unless their trigger applies. See `docs/workflow-protocol-taxonomy.md` in the repository for the full taxonomy.

## Operating Rules for the LLM

- Follow `/workflow status`; work only in the current phase.
- The only user-approval boundary is `commit → push`. Everything from interview through commit is autonomous.
- Auto-chain: `interview → plan → plan_review → implement → code_review → review_approved → document → commit`; guards must pass. `code_review → review_approved` requires `submit_review_package` after self-review, independent review, and quality gates.
- Resolve mechanical reminders, or mark them not applicable with a reason.
- Use `compact-handoff` before manual compaction in long sessions.
- Use `continuation-safety` before advancing, submitting review, committing, pushing, or compacting after a failed tool/guard/transition or uncollected delegated/background work.
- Use `evidence-verification` after changing workflow prompts, guards, interview behavior, review protocols, or runtime routing.
- Only the interactive user can approve in natural language.
- For high-risk/strict/API/security/migration/data/deploy plans, run Architect/Critic consensus in `plan_review`: rate assumptions, pre-mortem 3 failure scenarios, and executor-readiness. Repair fragile assumptions or uncovered failures before implementation.
- If DPAA/SBADR blocks, repair clear plan ambiguity autonomously and retry `/workflow approve`; ask only for genuine business decisions.
- For other guards, report the blocker and wait. Never bypass or simulate guards.
- Do not create approval/authority artifacts; guard evidence is extension-recorded.
- Runtime `.pi/extensions/**` edits need explicit interactive approval; never create approval files. In this source repo, `target/.pi/extensions/**` is normal deployment-template source.
- `/workflow abort` only cancels after confirmation; it creates no guard evidence and preserves dirty workspace for explicit handling.
- Keep changes surgical.

## Phase Protection Levels

Protection levels describe how aggressively the LLM and extension should avoid accidental progress or mutation in each phase.

| Level | Meaning | Phases |
|------|---------|--------|
| light | Guidance-focused; normal edits/checks are allowed when in scope. | `interview`, `plan`, `document` |
| medium | Evidence-focused; completion claims require explicit artifacts or verification. | `implement`, `commit` |
| heavy | Guard-focused; do not proceed until required review/gate evidence exists. | `plan_review`, `code_review`, `push` |
| terminal | No procedural continuation without a new workflow. | `done` |

Use these levels as design guidance for new reminders, tool policy, and recovery behavior. They do not replace mechanical guard evidence.

## Mechanical Guards

| Guard | Enforced by extension | Notes |
|------|------------------------|-------|
| High-risk consensus | `plan_review` LLM procedure | Architect/Critic review (assumption FRAGILE rating, pre-mortem, executor perspective) is required for high-risk metadata before requesting implementation approval. Independent layer from DPAA. |
| DPAA | `plan_review → implement` | Checks the plan and blocks ambiguous implementation. |
| Code quality | `code_review → review_approved` | Runs `codeQualityGuard` / `HARNESS_CODE_QUALITY_GUARD_CMD`. |
| Code review | `code_review → review_approved` | `submit_review_package` must include main self-review, independent reviewer/subagent review, quality-gate summary, Critical=0, and Major≤2 before review approval. It may also include reviewed/skipped file coverage and Critical/Major position-validation evidence. |
| Workspace | `git push` | Blocks wrong git root/branch and `git -C` push bypass. |
| Policy scan | `commit → push`, rechecked at `git push` | Prompts user for risky build/config/migration/Docker/CI/delete/large-change and high-risk auth/security/env/infra pushes. In `push`, prefer the `git-push` catalog command through `workflow_run_command`. The approval is reused if the workspace risk signature is unchanged. |
| Push execution | `git push` | Requires `push` phase and in-memory push guard. |

One-use gate exceptions exist only for exceptional, user-confirmed cases via `/workflow skip <gate> <reason>`.

## Artifact Conventions

- Korean source artifacts: `.ai/interview/*.ko.md`
- English DPAA artifacts: `.ai/interview/spec.md`, `.ai/interview/plan.md`
- DPAA snapshots/receipts: `.ai/interview/runs/<workflow-id>/...`
- Feature docs: `docs/feat/<feature-name>.md` and rendered HTML when required
- Large handoffs should use an artifact descriptor instead of raw inline content. Descriptor fields are `kind`, `path`, `producer`, `retention`, `sizeBytes`, `sha256`, and optional `summary`.

## Branch / Task Hints

Branch type guides which loaded workflow or skill to use; it is not the source of authority.

| Task signal | Typical workflow emphasis |
|------------|---------------------------|
| feature / new behavior | Full workflow, documentation likely required |
| fix / hotfix | Reproduce, implement minimal fix, review carefully |
| refactor | Existing tests first, no behavior change |
| chore / config | Policy scan likely needs explicit user confirmation |
| docs | Documentation-focused; code-quality guard may be irrelevant unless code changed |

## Resources

- Main project instructions: `AGENTS.md`
- Extension implementation: `.pi/extensions/workflow.ts` and `.pi/extensions/workflow/`
- Workflow templates: `.pi/workflows/`
- DPAA: `.pi/dpaa/`
- Skills: `.pi/skills/`
- Personas: `.pi/personas/`
- Governance: `.pi/GOVERNANCE.md`
