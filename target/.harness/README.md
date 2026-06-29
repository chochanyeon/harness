# Pi Workflow Runtime State

This directory stores runtime state, policy, authority files, and compatibility proposal artifacts for the Pi workflow extension.

The executable workflow integration lives under `.pi/extensions/workflow.ts` and `.pi/extensions/workflow/`. This `.harness/` directory is data/config only.

## State flow

The default phase model is declared in `.harness/workflow-policy.json`:

```text
interview -> plan -> plan_review -> implement -> code_review -> review_approved -> document -> commit -> push -> done
```

Automatic progress windows:

```text
interview -> plan -> plan_review -> implement
implement -> code_review
review_approved -> document -> commit
```

Approval boundaries:

```text
commit -> push
```

`plan_review -> implement` is an automatic DPAA/SBADR-gated transition, not a user approval boundary.

## Pi workflow commands

Use Pi's workflow tools or `/workflow` commands from the Pi TUI:

```text
/workflow start <goal>
/workflow status
/workflow approve
/workflow list
/workflow load
/workflow history
/workflow snapshot <reason>
/workflow submit-review-package critical=0 major=0 minor=0 summary="..."
/workflow undo
/workflow redo
/workflow skip <gate> <reason>
/workflow failures [export]
/workflow doctor
/workflow state <phase>
/workflow abort
/workflow checkpoint <reason>
/workflow checkpoints
/workflow restore <checkpoint-prefix>
/workflow dpaa-audit
```

## Mechanical gates

- `plan_review -> implement`: requires plan-review evidence, then runs DPAA/SBADR ambiguity checks. Low-risk documentation/cosmetic/discovery work may be advisory; API/schema/security/migration/data/deploy work remains strict.
- `code_review -> review_approved`: requires `submit_review_package` evidence and code quality verification.
- `commit -> push`: scans risky changed paths and requires policy review or a one-use accepted-risk exception if findings are present.
- Push guard: blocks `git -C <path> push`, workspace/branch mismatches, and pushes outside the `push` phase.
- Workspace checkpoints: stores staged/unstaged patches and untracked files under `.harness/checkpoints/<workflow-id>/` and can restore by prefix. Phase transitions create checkpoints; `/workflow undo` and `/workflow redo` restore workspace state as well as phase state.
- Field logs: gate failures and policy blocks append JSONL events to `.project-memory/harness/events.jsonl`.
- Workflow catalog: `/workflow list` shows the active/persisted workflow and `.pi/workflows/*.md` catalog entries.
- Context management: implementation, code review, large diff analysis, and log analysis should prefer subagents so the main agent remains a workflow controller.

## Workflow artifacts

Primary Pi-compatible artifacts:

- `.ai/interview/spec.md`
- `.ai/interview/spec.ko.md`
- `.ai/interview/plan.md`
- `.ai/interview/plan.ko.md`
- `docs/superpowers/plans/*.md`

Compatibility proposal files:

- `.harness/proposal/interview.md`
- `.harness/proposal/interview.yaml`
- `.harness/proposal/implementation-summary.md`
- `.harness/proposal/docs-summary.md`

## Protected gate files

These files are workflow runtime state or authority records. Agents should not edit them directly unless a workflow command or approved edit scope performs the change.

- `.harness/state.json`
- `.harness/workflow.json`
- `.harness/.authority-runtime/**` — generated runtime recovery/skip artifacts; ignored by `.harness/.gitignore`
- `.harness/workflow-policy.json` — workflow policy declaration
- `.harness/checkpoints/**`, `.harness/dpaa-runs/**` — generated runtime artifacts; ignored by `.harness/.gitignore`
- `.harness/authority/**`
- `.harness/policy.yaml`

## User/reviewer authority files

- `.harness/authority/plan-review.json`
- `.harness/authority/review-package.json`
- `.harness/authority/push-approval.json`

To approve implementation, a human/reviewer updates `plan-review.json`:

```json
{
  "status": "approved",
  "approved_allowed_files": ["src/main/java/example/Foo.java"],
  "notes": "Plan reviewed."
}
```

To submit a review package, use the Pi workflow tool rather than editing authority files by hand.
