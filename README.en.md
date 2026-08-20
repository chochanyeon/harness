# harness

[한국어 README](README.md)

![Pi Workflow Harness closed-loop overview](docs/assets/harness-overview.svg)

## What this is

**A project-local harness that turns Pi-based AI coding sessions into a governed flow: `interview → plan → guard → implement → review → document → commit/push`.**

It is not just a prompt collection. It is a reusable runtime template for AI-assisted software delivery, adding **SDLC governance, mechanical quality gates, external memory, and failure-evidence logging** to coding-agent sessions.

![Before and after applying harness](docs/assets/harness-before-after.svg)

## How it works

The key behavior is not simple automation. It is a **recoverable loop**: ambiguous plans return to planning, review findings return to implementation, and evidence feeds the next iteration.

![Harness guard and feedback loops](docs/assets/harness-guard-loop.svg)

Default phases:

```text
interview
→ plan
→ plan_review      # DPAA/SBADR ambiguity guard
→ implement        # TDD/verification-aware execution
→ code_review      # self-review + independent review + quality gate
→ review_approved
→ document
→ commit
→ push             # human approval + policy scan
→ done
```

- Safe segments can advance autonomously.
- The `commit → push` risk boundary requires human approval and policy scanning.
- Guard failures default to repair and retry, not skip.
- Run Ledger, task queue, and external memory leave restart cues for the next iteration.
- For a long-running workflow, heartbeat and `workflow_run_command` evidence reduce context pollution.
- Runtime workflow prompts inject only the current phase action, transition, and required guard evidence to reduce context noise.
- Missing Pre-code_review verification is surfaced before `code_review → review_approved`; later improvements are recorded as deferred instead of hidden.
- Declaring `Phase Template: light` in plan.md makes that one workflow skip the `document` phase. Without the declaration, the same 10-phase sequence (full) applies as today.
- Inside the `implement` phase, a successful `project-test`/`code-quality` run mechanically creates a local git checkpoint commit. `git-reset-hard-to-checkpoint <hash>` rolls back to an earlier checkpoint. The `commit` phase's `git-reset-soft-to-checkpoint-base` squashes everything back into one clean commit before push.
- `/workflow start` normally requires a human to type it, but if the user explicitly asks mid-conversation with a trigger phrase like "let's start a workflow for this", the LLM can start the workflow directly via the `workflow_start` tool. It is rejected if a workflow is already active.

## What gets installed

![Harness install footprint](docs/assets/harness-install-footprint.svg)

`target/` is the distributable template in this source repository. Installing the harness into another project copies the relevant `target/.pi/` runtime files into that project's `.pi/` directory.

## Godot 4.x project support

A project with a root-level `project.godot` is detected as Godot before generic build files (the harness source repository's special detection always remains first). Install the workflow component and provide a **Godot 4.x headless CLI** plus matching export templates for the project. The harness does not install the engine or export templates.

### Workflow command mapping

| Harness command | Godot adapter action | Behavior |
|---|---|---|
| `project-test` | `test` | Run the configured test scene inside the project root |
| `project-build` | `export` | Export with the configured preset (not compilation) |
| `code-quality` | `gate` | Review gate in `quality → test → export` order |

The `code-quality` `gate` always runs all three steps in that order and retains later-step diagnostics even when an earlier step fails. After changing `target/.pi/` in this development repository, run `bash scripts/sync-dev-harness.sh` (Windows: `powershell -File scripts\sync-dev-harness.ps1`) to synchronize `target/.pi/` into the local `.pi/`.

### `.pi/local/godot.json` contract

The configuration file is optional and accepts only these seven keys. `unset` means the value is absent and follows executable discovery or the action's required-setting rule.

| Key | Type | Default |
|---|---|---|
| `godot_bin` | string | `unset` (`GODOT_BIN` → configured value → platform candidates) |
| `test_scene` | string | `unset` (required by `test`/`gate`) |
| `export_preset` | string | `unset` (required by `export`/`gate`) |
| `export_output` | string | `unset` (required by `export`/`gate`) |
| `timeout_seconds` | number | `60.0` |
| `fail_on_warning` | boolean | `false` |
| `overwrite_export` | boolean | `false` |

Example:

```json
{
  "godot_bin": "godot4",
  "test_scene": "tests/test_scene.tscn",
  "export_preset": "Linux",
  "export_output": "build/game.pck",
  "timeout_seconds": 60.0,
  "fail_on_warning": false,
  "overwrite_export": false
}
```

Scenes and export outputs must stay below the canonical project root and may not cross symlink boundaries. Warning-only results are non-fatal by default: an action has `status: warning`, while a gate aggregate is `pass`, with process exit code `0`. `fail_on_warning: true` promotes warnings to failure. Existing regular export files are rejected by default and allowed only with `overwrite_export: true` (symlinks and non-regular files are always rejected).

Adapter statuses are `pass`, `warning`, `fail`, `config-error`, `tool-error`, and `timeout`. `pass`/`warning` use process exit code `0`; every other status uses `1`, and a fatal gate status blocks review approval.

Supported scope includes Godot 4.x detection, CLI version validation, headless editor/import and script parse/check, external-resource checks, configured test-scene execution, safe export, Windows/Linux argv execution, and JSON diagnostics. Godot 3.x, editor UI automation, gameplay semantics/art-quality judgment, engine/template installation, shell-string execution, and arbitrary test argv are excluded.

## Claude Code support

This harness is not Pi-only. The default install (`--component` omitted, or `all`) includes the `claude` component too, so the same project is immediately workable from **Claude Code** as well. If you don't use Claude Code, no action is needed — the hooks only do anything once Claude Code reads `.claude/settings.json`. The Claude side reads and writes exactly the same `.harness/workflow-policy.json` phase model, the same workflow state file (`$PI_CODING_AGENT_DIR/workflow-state/<git-root-hash>/state.json`), and the same memory store (`.project-memory/memory/*.jsonl`) that the Pi extension already uses. There is no separate state store, so opening the same project from Pi or from Claude Code always shows the same phase and the same memory.

### What gets installed

| Path | Contents |
|---|---|
| `target/.claude/settings.json` | `SessionStart`/`UserPromptSubmit`/`PreToolUse(Bash)`/`PostToolUse` hook wiring |
| `target/.claude/hooks/*.cjs` | `workflow-gate.cjs`, `workflow-cli.cjs`, `memory-context.cjs`, `memory-cli.cjs` — self-contained scripts that bundle the Pi extension's pure logic (`workflow/**`, `memory/core.ts`) via esbuild |
| `target/.claude/commands/workflow/*.md`, `target/.claude/commands/memory/*.md` | 9 `/workflow` and 14 `/memory` slash commands |

### What's enforced vs. advisory only

Claude Code hooks cannot change which tools are even visible to the model on a given turn the way the Pi extension can (no turn-time tool-visibility control, no MCP server), so there is exactly one hard enforcement point.

- **Hard gate**: a `git push` outside the `push` phase, or a `git push` during the `push` phase when policy scanning (`scanPushPolicy()`) flags an issue and there is no valid skip token, is denied outright by the `PreToolUse` hook (`Bash` matcher).
- **Everything else is advisory**: `SessionStart`/`UserPromptSubmit` inject the current phase, next phase, hard rules, and active/candidate memory as context; `PostToolUse` refreshes state/field-log evidence after edits but never blocks anything. If a hook itself fails internally, only the push check fails closed (denies); everything else fails open (allows).

### What's not supported

`/memory` supports all 14 subcommands identically to Pi. `/workflow`, on the other hand, does not port the following commands, which are tied to checkpoint/ledger/TUI machinery: `trace`, `undo`, `redo`, `history`, `snapshot`, `checkpoint`, `checkpoints`, `restore`, `tools`, `logs`, `submit-review-package`, `list`, `load` (the Claude side re-reads `state.json` fresh on every invocation, so it never needs to distinguish a "loaded" workflow from a "persisted" one). See [`docs/superpowers/specs/2026-08-19-claude-code-adapter-design.md`](docs/superpowers/specs/2026-08-19-claude-code-adapter-design.md) §4 and §6.4 for the full design background.

### Install command

```bash
curl -fsSL https://raw.githubusercontent.com/chochanyeon/harness/main/scripts/init-target-harness.sh | sh -s -- --component claude
```

## Key components

| Area | Path | Purpose |
|---|---|---|
| Workflow runtime | `target/.pi/extensions/workflow.ts`, `target/.pi/extensions/workflow/` | phases, guards, command policy, reminders, ledger |
| Memory runtime | `target/.pi/extensions/memory.ts` | durable memory, candidate memory shortlist, real-time LLM-judgment promotion/use, AGENTS.md promotion-proposal tracking, feedback-aware relevance scoring, supersede/merge lifecycle commands |
| Skills/personas | `target/.pi/skills/`, `target/.pi/personas/` | review, trace, TDD, documentation, continuation safety, etc. |
| Policies/schemas | `target/.harness/`, `target/.pi/schemas/` | workflow hard rules, field log and memory schemas |
| TUI helpers/theme | `target/.pi/themes/`, `target/.pi/extensions/assistant-markdown-box.ts` | workflow console theme and boxed markdown rendering |
| Docs | `docs/` | guard recovery, runtime events, prompt contracts, protocol taxonomy |

## Ownership boundary

| Category | Harness-managed / updateable | Project-owned |
|---|---|---|
| Runtime | `.pi/extensions/`, `.pi/skills/`, `.pi/personas/`, `.pi/workflows/`, `.pi/dpaa/`, `.pi/sbadr/` | `.pi/local/`, `.pi/config/`, `.pi/LOCAL.md` |
| Policy | `.harness/workflow-policy.json`, `.pi/WORKFLOW.md`, `.pi/GOVERNANCE.md` | `AGENTS.md` |
| Generated | `.pi/.venv/`, `.pi/.cache/`, `.pi/dpaa-runs/`, `.project-memory/` | local artifacts that should not be committed |

In installed projects, mutating runtime `.pi/extensions/**` requires explicit user confirmation. In this source repository, `target/.pi/extensions/**` is normal deployment-template source code.

---

# Commands

## Install into another project

Run from the target project's root.

### Windows PowerShell

```powershell
$p=Join-Path $env:TEMP 'init-harness.ps1'; Invoke-WebRequest https://raw.githubusercontent.com/chochanyeon/harness/main/scripts/init-target-harness.ps1 -OutFile $p; $env:HARNESS_DEST=(Get-Location).Path; powershell -NoProfile -ExecutionPolicy Bypass -File $p
```

### macOS/Linux

```bash
curl -fsSL https://raw.githubusercontent.com/chochanyeon/harness/main/scripts/init-target-harness.sh | sh
```

Then start Pi from the same project root.

```bash
pi
```

Check the installation:

```text
/workflow doctor
```

## Component-specific install

```bash
# workflow only
curl -fsSL https://raw.githubusercontent.com/chochanyeon/harness/main/scripts/init-target-harness.sh | sh -s -- --component workflow

# memory only
curl -fsSL https://raw.githubusercontent.com/chochanyeon/harness/main/scripts/init-target-harness.sh | sh -s -- --component memory

# claude only (Claude Code adapter) — already included in the default install; use this to (re)install just this component
curl -fsSL https://raw.githubusercontent.com/chochanyeon/harness/main/scripts/init-target-harness.sh | sh -s -- --component claude
```

Clean reinstall removes managed runtime files and copies them again. `AGENTS.md`, `.pi/LOCAL.md`, and `.ai/interview` artifacts are preserved.

```powershell
$p=Join-Path $env:TEMP 'init-harness.ps1'; Invoke-WebRequest https://raw.githubusercontent.com/chochanyeon/harness/main/scripts/init-target-harness.ps1 -OutFile $p; $env:HARNESS_DEST=(Get-Location).Path; powershell -NoProfile -ExecutionPolicy Bypass -File $p -Clean
```

```bash
curl -fsSL https://raw.githubusercontent.com/chochanyeon/harness/main/scripts/init-target-harness.sh | sh -s -- --clean
```

## Update an installed harness

Run from the installed project's root.

### Windows PowerShell

```powershell
$p=Join-Path $env:TEMP 'update-harness.ps1'; Invoke-WebRequest https://raw.githubusercontent.com/chochanyeon/harness/main/scripts/update-harness.ps1 -OutFile $p; powershell -NoProfile -ExecutionPolicy Bypass -File $p
```

### macOS/Linux

```bash
curl -fsSL https://raw.githubusercontent.com/chochanyeon/harness/main/scripts/update-harness.sh | sh
```

Component-specific update:

```bash
# workflow only
curl -fsSL https://raw.githubusercontent.com/chochanyeon/harness/main/scripts/update-harness.sh | sh -s -- --component workflow

# memory only
curl -fsSL https://raw.githubusercontent.com/chochanyeon/harness/main/scripts/update-harness.sh | sh -s -- --component memory

# claude only
curl -fsSL https://raw.githubusercontent.com/chochanyeon/harness/main/scripts/update-harness.sh | sh -s -- --component claude
```

Updates overwrite upstream-managed files only. Put project-specific customizations under `.pi/local/` or `.pi/config/`.

## Main runtime commands

The two blocks below are the Pi baseline (a single slash command that takes a subcommand as an argument, e.g. `/workflow <subcommand>`, `/memory <subcommand>`). Installing the `claude` component makes the same functionality runnable from Claude Code too, via hooks — but Claude Code does not namespace slash commands by directory, so each file under `target/.claude/commands/workflow/*.md` and `target/.claude/commands/memory/*.md` installs as its own independent slash command named `/workflow-<subcommand>` or `/memory-<subcommand>` (a hyphen, not a space). A line with no `# Claude: not supported` tag behaves identically on Claude Code under the hyphenated name shown to its right, and a tagged line is Pi-only (see [Claude Code support](#claude-code-support) above for details).

### Workflow

```text
/workflow start <title>   # on an explicit trigger phrase the LLM may also call the workflow_start tool directly (direct tool-call: Claude not supported; slash command: supported as /workflow-start)
/workflow status                                                  # Claude: /workflow-status
/workflow approve                                                 # Claude: /workflow-approve
/workflow doctor                                                  # Claude: /workflow-doctor
/workflow failures                                                # Claude: /workflow-failures
/workflow failures export                                         # Claude: /workflow-failures export
/workflow failures report   # alias: /workflow failures improve   # Claude: not supported
/workflow list                                                    # Claude: not supported
/workflow load <id>                                               # Claude: not supported
/workflow state <phase>                                           # Claude: /workflow-state
/workflow skip <gate> <reason>                                    # Claude: /workflow-skip
/workflow abort                                                   # Claude: /workflow-abort
/workflow dpaa-audit                                              # Claude: /workflow-dpaa-audit
/workflow trace                                                   # Claude: not supported
/workflow undo | redo | history                                   # Claude: not supported
/workflow snapshot | checkpoint | checkpoints | restore           # Claude: not supported
/workflow tools | logs                                            # Claude: not supported
submit_review_package({ ... })   # tool-call, records review evidence before code_review → review_approved   # Claude: not supported (tool-call form)
```

### Memory

`/memory` supports every subcommand identically on both Pi and Claude Code. The `memory_*` tool-call form (Pi's `registerTool()`, invoked by the LLM directly) is Pi-only; Claude Code covers the same behavior via slash commands or by running `node .claude/hooks/memory-cli.cjs <sub>`.

```text
/memory remember <text>                                            # Claude: /memory-remember
memory_remember({ text })                                          # Claude: not supported (tool-call form)
/memory list                                                       # Claude: /memory-list
/memory search <query>                                             # Claude: /memory-search
/memory show <id>                                                  # Claude: /memory-show
/memory disable <id>                                               # Claude: /memory-disable
/memory enable <id>                                                # Claude: /memory-enable
/memory delete <id>   # marks deprecated   # Claude: /memory-delete
/memory explain                                                    # Claude: /memory-explain
/memory doctor                                                     # Claude: /memory-doctor
/memory stats                                                      # Claude: /memory-stats
/memory feedback <id> helpful|irrelevant|wrong|stale               # Claude: /memory-feedback
/memory missed <description>                                       # Claude: /memory-missed
/memory supersede <oldId> <newId>       # marks oldId superseded (excluded from search/injection), records it in newId's supersedes   # Claude: /memory-supersede
/memory merge <survivorId> <id2> [<id3> ...]  # survivor's content stays unchanged, every other id is superseded by survivor (no content combining)   # Claude: /memory-merge
memory_use_candidate({ memoryId, relevanceReason })            # pull a candidate shortlist item into this turn without changing its status   # Claude: not supported (tool-call form)
memory_promote_candidate({ memoryId, triggerKind, evidence })  # promote candidate→active only on explicit/repeated confirmation or task success, capped at 5/session, evidence required   # Claude: not supported (tool-call form)
memory_propose_agents_promotion({ memoryId, proposedText })    # record that a repeatedly used + helpful-feedback memory is being suggested as an AGENTS.md addition (never edits the file itself)   # Claude: not supported (tool-call form)
memory_record_agents_decision({ memoryId, decision, note })    # record the user's accept/decline decision for a proposed AGENTS.md addition   # Claude: not supported (tool-call form)
```

## Preview the bundled target template

```bash
cd target
pi
```

## Minimum verification commands

```bash
python -m pytest tests/test_workflow_fake_llm_session.py -q
python -m pytest tests/test_harness_consumer_smoke.py -q
python -m pytest tests/test_workflow_reminders.py tests/test_workflow_run_command.py tests/test_code_quality_gate.py tests/test_workflow_tool_policy.py -q
```
