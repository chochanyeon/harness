---
name: continuation-safety
description: Use before continuing after failures or when delegated/async/background work may still be pending. Combines retryability diagnosis with pending-work checks before phase advancement, review package submission, commit, push, or compaction. Output language is Korean.
---

# Continuation Safety Skill

Use this skill when the next step might be unsafe because a tool/command/guard/edit/transition failed, or because subagents, reviewers, async jobs, background commands, or delegated workers may still be running or uncollected.

## Goal

Do not continue on top of unclear state. Classify the failure or pending work, collect the minimum evidence, and choose one safe next action.

## Safety Record

```markdown
## Continuation Safety Record
- Trigger: failure / pending work / both
- Workflow phase: <phase or none>
- Operation intent: <what we were trying to do>
- Error summary: <short exact error or none>
- Pending work: <none or list>
- Changed state: <files/state/tokens possibly changed, or none known>
- Retryability: safe retry / retry after repair / do not retry yet / user decision required
- Owner of next action: main agent / subagent / user / environment
```

## Retryability Classes

| Class | Meaning | Default action |
|------|---------|----------------|
| Safe retry | transient or no state changed | retry once with same intent |
| Retry after repair | stale input, missing prerequisite, wrong path, invalid args | repair prerequisite, then retry |
| Do not retry yet | destructive risk, unclear partial mutation, workspace mismatch, pending worker | inspect state and collect evidence |
| User decision required | business/architecture choice or accepted-risk skip | ask a targeted question |

## Pending Work Blockers

Block phase advancement, `submit_review_package`, commit, push, or compaction when any of these are true:

- a subagent/reviewer is still running or has timed out without result review
- a background command may still be mutating files, logs, ports, or generated artifacts
- delegated work produced artifacts that have not been inspected by the main agent
- review findings exist but have not been classified as fixed, accepted risk, or not applicable
- implementation work is complete but verification output has not been collected
- context compaction would lose the only reference to pending work

## Common Harness Recoveries

- `workflow_apply_approved_edit` stale hashes: discard the stale scope, propose the edit again from current file content.
- Path validation failure: do not bypass; correct the path or explain why the requested path is protected.
- DPAA/SBADR failure: return to plan, repair ambiguity/syntax, retry approval.
- Code quality failure: fix code, not checkstyle/PMD suppressions, then rerun the narrow gate.
- Workspace mismatch: stop mutating; report expected cwd/branch and wait for user/environment correction.
- Policy scan block: present the risk summary; use accepted-risk skip only after explicit user approval.
- Push failure: do not force push unless explicitly requested; inspect remote rejection reason first.

## Output Template

```markdown
## Continuation Safety Check
- Decision: clear / blocked
- Trigger: failure / pending work / both
- Retryability: <class>
- Blocking item: <item or none>
- Evidence: <status/output/artifact path>
- Next action: <single safe action>

## Do Not Do
- <unsafe shortcut to avoid>
```

## Rules

- Do not silently retry mutating operations when partial state is unclear.
- Do not submit `submit_review_package` until independent reviewer output is collected and addressed.
- Do not commit or push while a known background generator/test/server may still mutate the workspace.
- Do not treat a timed-out subagent as success.
- Do not hide guard failures from the user; fix autonomously only when the cause is mechanical and within scope.
- Prefer one focused recovery action over a long list of possibilities.
