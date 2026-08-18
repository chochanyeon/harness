# Claude Code Adapter — Design Spec

- **Date:** 2026-08-19
- **Status:** Draft, pending user review
- **Scope:** Bring workflow-gate + memory to Claude Code as a second, opt-in adapter. Not a full 1:1 port (skills/personas, Godot/CoreNLP integration, and Pi's live TUI/checkpoint UX stay Pi-only).

## 1. Summary

Add a `claude` install component that lets a project driven by this harness also be worked on with Claude Code, sharing the same `.harness/workflow-policy.json` phase model and the same on-disk workflow/memory state that the Pi extension already uses. The Claude side is built as a second, thinner adapter over the *same* TypeScript domain modules the Pi extension already uses — not a reimplementation.

## 2. Background / prior art

A Claude Code integration was attempted once before (`b06e155`, "Add Claude Code workflow gate") and removed nine days later (`94abe72`, "Pi 전용으로 전환") while the workflow internals were being redesigned around a "Pi extension-first" architecture (`docs/workflow-sdk-console-design.md`). That removal was a scope decision, not evidence the idea failed — but the old implementation had two problems this design deliberately avoids:

1. It **reimplemented** the phase/gate/policy logic from scratch in a single 748-line `.cjs` file (hardcoded `WORKFLOW_PHASES`, `APPROVAL_BOUNDARIES`, etc.), instead of reusing the real logic. Any future policy change would need to be made twice.
2. It read/wrote `.harness/state.json` / `.harness/workflow.json`, which is **not** where the current Pi extension actually persists state (`getWorkflowStateDir()` resolves to `$PI_CODING_AGENT_DIR/workflow-state/<git-root-hash>/state.json`, default `~/.pi/agent/...`). So even at the time, the old Claude gate could never have shared live state with a Pi session on the same project.

Since then, `target/.pi/extensions/workflow/**` was refactored into a policy/runtime split: pure, Pi-independent modules (`gates.ts`, `transitions.ts`, `state.ts`, `storage.ts`, `command-policy.ts`, `git.ts`, `field-log.ts`, `artifacts.ts`, `domain/*`, etc.) versus a thin Pi-binding layer (`workflow.ts`, `runtime-ui.ts`, `interview-ui.ts`, `markdown-box.ts`, `application/workflow-command-router.ts`, `application/continuation.ts` — the only files that import `@earendil-works/*`). `.harness/workflow-policy.json` already documents itself as "Shared workflow policy for Pi and Claude adapters." This refactor is what makes a non-duplicated Claude adapter practical now.

`memory.ts` has not had the same split yet — its ~900 lines of pure logic (`saveMemoryText`, `searchMemory`, `selectMemories`, `supersedeMemory`, audit/feedback/metrics helpers, etc.) live entirely inside the `export default function(pi)` closure. This design includes extracting that logic first, mirroring the workflow split.

## 3. Goals

- Same `interview → plan → plan_review → implement → code_review → review_approved → document → commit → push → done` phase model, driven by the same `.harness/workflow-policy.json`.
- Same on-disk state: a project opened with Pi or Claude Code sees the same workflow phase and the same memory entries (no separate Claude-only state store).
- The one real safety boundary this harness cares about — `commit → push` — is mechanically enforced from Claude Code too, not just suggested.
- Memory (`remember`/`search`/`list`/`feedback`/`supersede`/`merge`/etc.) works the same way from Claude Code.
- Installable/updatable the same way as existing components (`--component claude`, alongside `workflow`/`memory`), opt-in and additive — zero effect on Pi-only users.

## 4. Non-goals (explicit)

- **No turn-time dynamic tool-visibility control.** Pi's `setActiveTools()`/`registerTool()` let the extension change what the LLM can even see per phase. Claude Code hooks only get to allow/deny/warn on each individual tool call as it happens. We do not attempt to fake the Pi UX here — this is the reason "hybrid" enforcement (hard block only at `commit → push`, advisory elsewhere) was chosen over a full hard-gate port.
- **No custom LLM-invoked tools (no MCP server) in v1.** Pi exposes some operations as `pi.registerTool()` tools the LLM calls directly (`workflow_start`, `workflow_approve`, `memory_remember`, `memory_use_candidate`, `memory_promote_candidate`, etc.). Standing up an MCP server would be the faithful equivalent, but it's a meaningfully bigger piece of infrastructure (separate process, packaging, lifecycle) for a "doesn't need to be a perfect port" request. v1 exposes the same operations only as a bridge CLI, invoked either by the user via slash commands or by the model via `Bash` when reminders tell it to. An MCP server is left as a possible future increment (§10).
- **No Pi TUI-equivalent features**: workspace checkpoints/snapshots/undo/redo/history/restore, the interview wizard UI, and the workflow board are Pi-only for now (see §6.4 for the deferred command list).
- **No Godot/CoreNLP/skills-personas porting.** Skills/personas overlap with Claude Code's own native skills/subagents; porting them is a separate, later decision if ever needed.
- **No same-session concurrency handling.** State is shared on disk, but this design does not address two runtimes actively working the same workflow at the same time — that's a pre-existing single-writer assumption we're not changing.

## 5. Architecture

```
target/.pi/extensions/workflow/**        (existing, unchanged)
  domain/, gates.ts, transitions.ts, state.ts, storage.ts,
  command-policy.ts, git.ts, field-log.ts, artifacts.ts, ...
  → pure logic + fs-backed state, zero Pi dependency (confirmed: only
    runtime-ui.ts / interview-ui.ts / markdown-box.ts / workflow.ts /
    application/workflow-command-router.ts / application/continuation.ts
    import @earendil-works/*).

target/.pi/extensions/memory/core.ts     (new — extracted from memory.ts)
  → same split, applied to memory: storage, search/scoring, audit/feedback/
    metrics, entry lifecycle (save/update/supersede/merge), all as pure
    functions taking no `pi` argument. memory.ts becomes a thin Pi binding
    over memory/core.ts, same shape as workflow.ts today.

target/.claude/                          (new install component)
  hooks/
    lib/*.cjs            # compiled (esbuild) output of the pure workflow +
                          # memory core modules this adapter needs — build
                          # artifact, committed, not hand-written
    workflow-cli.cjs      # thin CLI over lib/: subcommands mirror the /workflow
                          # slash commands + the hook event handlers
    memory-cli.cjs        # thin CLI over lib/: subcommands mirror /memory
    workflow-gate.cjs      # hook entrypoint: PreToolUse / PostToolUse /
                          # UserPromptSubmit / SessionStart → calls workflow-cli.cjs
    memory-context.cjs    # hook entrypoint: SessionStart / UserPromptSubmit →
                          # calls memory-cli.cjs
  commands/
    workflow/*.md          # slash commands, one per subcommand (see §6.3)
    memory/*.md
  settings.json             # hook wiring (see §6.2)

scripts/
  build-claude-adapter.*    # new — esbuild bundle of the pi-independent
                            # modules into target/.claude/hooks/lib/*.cjs;
                            # dev-time only, output is committed like the
                            # rest of target/
```

Both adapters call the *same* domain functions. `workflow.ts`/`memory.ts` (the Pi bindings) are not modified beyond the memory extraction in §6.1; the Claude side is a new, separate binding over the same core.

## 6. Components

### 6.1 Memory core extraction

Move the non-`pi`-dependent declarations out of `memory.ts`'s closure into `target/.pi/extensions/memory/core.ts` (and a small `storage.ts` alongside it, mirroring the workflow layout): entry CRUD (`readEntries`/`updateEntry`/`findEntry`), search/scoring (`searchMemory`, `selectMemories`, `searchCandidateMemory`, `searchAgentsMdPromotionCandidates`), lifecycle (`saveMemoryText`, `supersedeMemory`, `promoteMemory`, `enableBlockers`), audit/feedback/metrics (`appendAudit`, `appendFeedback`, `appendMetric`), rendering (`formatMemoryList`, `formatMatches`, `formatExplain`, `formatDoctor`, `formatStats`, `renderMemoryBlock`, `renderCandidateShortlist`, `renderAgentsMdPromotionShortlist`), and path helpers (`memoryDir`, `entriesFile`, etc., already `pi`-free). `memory.ts` keeps only `pi.registerCommand`/`pi.registerTool`/`pi.on(...)` wiring, calling into `memory/core.ts`. Behavior must not change — this is a refactor, verified by the existing `tests/test_memory_extension.py` continuing to pass unmodified.

### 6.2 Hook wiring (`target/.claude/settings.json`)

Hybrid enforcement, matching the answer already given:

| Hook | Matcher | Action |
|---|---|---|
| `SessionStart` | — | `workflow-gate.cjs session-start` + `memory-context.cjs session-start`: inject current phase, next phase, hard rules from `reminderPolicy`, and top active/candidate memories — the Claude-side equivalent of Pi's `before_agent_start`. |
| `UserPromptSubmit` | — | Same reminder injection, refreshed each turn (mirrors `reminderPolicy.injectOnUserPrompt`). |
| `PreToolUse` | `Bash` | `workflow-gate.cjs check-tool-call`: if the command matches `isGitPush()`, run `scanPushPolicy()` + `validateWorkflowWorkspace()` + the `commit:push` approval-boundary check (reusing the existing gate functions, not reimplementations of them) and `deny` on failure. Any non-push Bash command is allowed through untouched — this is the one hard boundary; everything else stays advisory per §4. |
| `PostToolUse` | `Bash\|Write\|Edit\|MultiEdit\|NotebookEdit` | `workflow-gate.cjs reevaluate`: refresh persisted state/field-log evidence after writes, same intent as Pi's `tool_result` handler, but non-blocking. |

Hook scripts fail open on internal error (log to the field log, allow the tool call) except the push check itself, which fails closed (deny with an explicit message) since a broken gate must not silently turn into an unguarded push.

### 6.3 Slash commands (MVP set)

Each command is a short markdown file (frontmatter + instructions + an inline `!`node .claude/hooks/workflow-cli.cjs <sub> "$ARGUMENTS"`` call), same shape as the removed `b06e155` files, but calling the new CLI instead of a self-contained reimplementation.

| Command | Subcommand | Notes |
|---|---|---|
| `/workflow start <title>` | `start` | Same interview kick-off intent as Pi; the markdown body itself carries the kickoff instructions (Claude Code commands are prompt text, not just handlers), no `sendUserMessage` equivalent needed. |
| `/workflow status` | `status` | |
| `/workflow approve` | `approve` | Blocks with a clear message at `commit → push` if not run interactively; everywhere else, advances like Pi's advisory approve. |
| `/workflow doctor` | `doctor` | |
| `/workflow list` / `load` | `list`, `load` | |
| `/workflow state <phase>` | `state` | Manual recovery only, same caveat as today's `/workflow state`. |
| `/workflow skip <gate> <reason>` | `skip` | |
| `/workflow abort` | `abort` | |
| `/workflow dpaa-audit` | `dpaa-audit` | |
| `/workflow failures [export\|report]` | `failures` | |
| `/memory remember <text>` | `remember` | |
| `/memory list` / `search` / `show` | `list`, `search`, `show` | |
| `/memory disable` / `enable` | `disable`, `enable` | |
| `/memory feedback <id> <kind>` | `feedback` | |
| `/memory missed <desc>` | `missed` | |
| `/memory supersede` / `merge` | `supersede`, `merge` | |
| `/memory explain` / `doctor` / `stats` | `explain`, `doctor`, `stats` | |

LLM-autonomous operations that Pi exposes as `registerTool()` (`workflow_start`, `workflow_approve`, `workflow_state`, `memory_remember`, `memory_use_candidate`, `memory_promote_candidate`, `memory_propose_agents_promotion`, `memory_record_agents_decision`) are, in v1, just documented in the injected reminder text as "run `node .claude/hooks/workflow-cli.cjs <sub>` via Bash" — the model does this on its own when the injected phase/memory context calls for it, same as it already runs arbitrary shell commands today. No MCP server in v1 (§4).

### 6.4 Explicitly deferred commands

Not ported in v1: `/workflow trace`, `undo`, `redo`, `history`, `snapshot`, `checkpoint`, `checkpoints`, `restore`, `tools`, `logs`, `submit-review-package`. These lean on Pi-specific ledger/checkpoint/TUI machinery (`ledger.ts` snapshot rendering, `checkpoint-commands.ts` git checkpoint flow tied into Pi's board) that would need real new design work, not just a binding change, to reach Claude Code. Can be picked up later if the MVP proves useful.

### 6.5 Build pipeline

`target/.pi/extensions/workflow/**` and the new `memory/core.ts` are TypeScript with no npm build step today (Pi compiles/loads `.ts` itself). Claude Code hooks are plain Node with no such loader available by default. Rather than require every installed project to have a TS runner, the harness dev repo gets a small `scripts/build-claude-adapter.*` (esbuild, dev-only devDependency — first `package.json` in this repo) that bundles exactly the Pi-independent modules the Claude hooks need into `target/.claude/hooks/lib/*.cjs`. Compiled output is committed, same as everything else under `target/`. A test (mirroring `tests/test_workflow_ts_static.py`'s intent) asserts the committed bundle is up to date with its TS sources, so a source change without a rebuild fails CI instead of silently drifting.

### 6.6 Install/update

Add `claude` as a third `--component` value in `scripts/init-target-harness.{sh,ps1,py}` and `scripts/update-harness.{sh,ps1}`, copying `target/.claude/**` the same way `workflow`/`memory` already copy their trees. Fully opt-in; omitting `--component claude` (or running the default install) leaves existing behavior unchanged.

## 7. Data flow / state sharing

- **Workflow state**: `getWorkflowStateDir()` = `$PI_CODING_AGENT_DIR` (default `~/.pi/agent`) + `workflow-state/<sha256(gitRoot)[:16]>/state.json`. Neither adapter overrides this env var, so a Pi session and a Claude Code session opened on the same git root read/write the same file. No new state layer is introduced.
- **Memory**: already project-local (`.project-memory/memory/*.jsonl`), independent of runtime — used as-is.
- **Policy**: `.harness/workflow-policy.json`, already shared, used as-is (no schema change needed).

## 8. Testing

- `tests/test_memory_extension.py` continues to pass after the §6.1 extraction (behavior-preserving refactor).
- New `tests/test_claude_workflow_gate.py` (replacing the current regression test that asserts Claude assets are *absent*) drives `workflow-gate.cjs`/`workflow-cli.cjs` via `node -e`/subprocess the same way `tests/test_workflow_extension_runtime.py` drives the Pi side: PreToolUse allow/deny on `git push` at and off the `commit:push` boundary, SessionStart/UserPromptSubmit reminder content, and — importantly — a cross-adapter test that writes workflow state via the Pi-side module and confirms the Claude-side CLI reads the same phase back (and vice versa).
- New `tests/test_claude_memory_gate.py` for `memory-cli.cjs`/`memory-context.cjs`, same pattern.
- A build-freshness test for §6.5's committed bundle.
- `scripts/test_component_install_update.py` gains a `claude` component case.

## 9. Migration notes

- `tests/test_claude_workflow_gate.py` currently asserts the *absence* of `target/.claude` and of `claude-workflow` references in the install scripts. Both assertions get replaced by the new tests in §8 — this is an intentional reversal of that regression test's premise, not an oversight.
- The old `b06e155` `.cjs` is not reused as source; it's reference material for hook-plumbing mechanics only (stdin JSON shape, deny/allow output format), since its actual policy logic and state paths are both superseded by this design.

## 10. Open items / future increments (not in this pass)

- MCP server exposing the same operations as real LLM-invokable tools (closer parity with Pi's `registerTool()`).
- Porting the deferred commands in §6.4 if checkpoint/undo/redo turns out to matter in practice from Claude Code.
- Skills/personas as native Claude Code skills.
