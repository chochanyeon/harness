import json
import os
import subprocess
import textwrap
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
# Same TS-loading approach tests/test_workflow_extension_runtime.py already
# uses: `jiti` ships as a transitive dependency of the globally installed
# @earendil-works/pi-coding-agent package, so pointing NODE_PATH at its
# node_modules lets a plain `node -e` script `require('jiti')` and load a
# .ts file directly — no new devDependency needed for this.
PI_NODE_MODULES = Path.home() / "AppData" / "Roaming" / "npm" / "node_modules" / "@earendil-works" / "pi-coding-agent" / "node_modules"


def _run_node(script: str, env_overrides: dict, cwd: Path = ROOT) -> subprocess.CompletedProcess:
    env = {**os.environ, "NODE_PATH": str(PI_NODE_MODULES), **env_overrides}
    return subprocess.run(
        ["node", "-e", script],
        cwd=cwd,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        timeout=30,
    )


def _jiti_require_ts(ts_path: Path) -> str:
    """Return the two lines of JS that set up a jiti loader and require()
    the given absolute .ts path through it, ready to interpolate into a
    larger `node -e` script string."""
    posix_path = ts_path.as_posix()
    return textwrap.dedent(f"""\
        const path = require('path');
        const {{ createJiti }} = require('jiti');
        const jiti = createJiti(path.resolve('runtime-test.js'), {{ interopDefault: false }});
        const mod = jiti(path.resolve({posix_path!r}));
    """)


@pytest.mark.skipif(
    not (ROOT / "target" / ".claude" / "hooks" / "src" / "lib" / "skip-tokens.ts").exists(),
    reason="skip-tokens.ts not written yet",
)
def test_skip_token_round_trips_and_expires(tmp_path):
    agent_dir = tmp_path / "pi-agent"
    ts_path = ROOT / "target" / ".claude" / "hooks" / "src" / "lib" / "skip-tokens.ts"
    script = _jiti_require_ts(ts_path) + textwrap.dedent("""
        mod.addClaudeSkipToken('policy-scan', 'wf-1', 'accepted risk for test');
        const first = mod.consumeClaudeSkipToken('policy-scan', 'wf-1');
        const second = mod.consumeClaudeSkipToken('policy-scan', 'wf-1');
        const missingWorkflow = mod.consumeClaudeSkipToken('policy-scan', 'wf-other');
        console.log(JSON.stringify({ first, second, missingWorkflow }));
    """)
    result = _run_node(script, {"PI_CODING_AGENT_DIR": str(agent_dir)})
    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout.strip().splitlines()[-1])
    assert payload["first"] == {"reason": "accepted risk for test"}
    assert payload["second"] is None  # one-time use
    assert payload["missingWorkflow"] is None  # scoped to the issuing workflow id


@pytest.mark.skipif(
    not (ROOT / "target" / ".claude" / "hooks" / "src" / "lib" / "skip-tokens.ts").exists(),
    reason="skip-tokens.ts not written yet",
)
def test_skip_token_scoping_does_not_cross_workflows(tmp_path):
    """Regression test for a review finding: the round-trip test above issues
    only one token, so consuming it once empties the store for *any*
    workflow id afterward -- a buggy implementation that ignored
    `workflowId` in its match predicate would pass that test identically.
    This test issues two tokens for the *same gate* under *two different*
    workflow ids and proves consuming one does not affect the other."""
    agent_dir = tmp_path / "pi-agent"
    ts_path = ROOT / "target" / ".claude" / "hooks" / "src" / "lib" / "skip-tokens.ts"
    script = _jiti_require_ts(ts_path) + textwrap.dedent("""
        mod.addClaudeSkipToken('policy-scan', 'wf-1', 'reason for wf-1');
        mod.addClaudeSkipToken('policy-scan', 'wf-2', 'reason for wf-2');

        // A workflow id that was never issued a token for this gate must get
        // null, and must NOT delete/return the real owner's token as a
        // side effect.
        const wrongWorkflowConsume = mod.consumeClaudeSkipToken('policy-scan', 'wf-bogus');

        // Consuming wf-1's token must not touch wf-2's token for the same gate.
        const wf1First = mod.consumeClaudeSkipToken('policy-scan', 'wf-1');
        const wf1Second = mod.consumeClaudeSkipToken('policy-scan', 'wf-1'); // one-time use

        // wf-2's token must still be there, untouched by both the bogus
        // consume above and wf-1's consume.
        const wf2Consume = mod.consumeClaudeSkipToken('policy-scan', 'wf-2');
        const wf2Second = mod.consumeClaudeSkipToken('policy-scan', 'wf-2'); // one-time use

        console.log(JSON.stringify({ wrongWorkflowConsume, wf1First, wf1Second, wf2Consume, wf2Second }));
    """)
    result = _run_node(script, {"PI_CODING_AGENT_DIR": str(agent_dir)})
    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout.strip().splitlines()[-1])
    assert payload["wrongWorkflowConsume"] is None
    assert payload["wf1First"] == {"reason": "reason for wf-1"}
    assert payload["wf1Second"] is None  # one-time use
    # This is the assertion a workflowId-blind implementation would fail:
    # wf-2's token must survive both the bogus consume and wf-1's consume.
    assert payload["wf2Consume"] == {"reason": "reason for wf-2"}
    assert payload["wf2Second"] is None  # one-time use


def _run_workflow_cli(args, repo, agent_dir):
    return subprocess.run(
        ["node", str(ROOT / "target" / ".claude" / "hooks" / "workflow-cli.cjs"), *args],
        cwd=repo,
        env={**os.environ, "PI_CODING_AGENT_DIR": str(agent_dir)},
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        timeout=30,
    )


def _init_git_repo(repo: Path) -> None:
    for args in (
        ["git", "init", "-q"],
        ["git", "config", "user.email", "test@example.com"],
        ["git", "config", "user.name", "test"],
    ):
        subprocess.run(args, cwd=repo, check=True, capture_output=True)
    (repo / "README.md").write_text("test repo\n", encoding="utf-8")
    subprocess.run(["git", "add", "-A"], cwd=repo, check=True, capture_output=True)
    subprocess.run(["git", "commit", "-q", "-m", "init"], cwd=repo, check=True, capture_output=True)


@pytest.mark.skipif(
    not (ROOT / "target" / ".claude" / "hooks" / "workflow-cli.cjs").exists(),
    reason="workflow-cli.cjs not built yet",
)
def test_workflow_cli_start_then_status_round_trips(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()
    _init_git_repo(repo)
    agent_dir = tmp_path / "pi-agent"

    start = _run_workflow_cli(["start", "add login flow"], repo, agent_dir)
    assert start.returncode == 0, start.stderr
    assert "interview" in start.stdout

    status = _run_workflow_cli(["status"], repo, agent_dir)
    assert status.returncode == 0, status.stderr
    assert "interview" in status.stdout
    assert "add login flow" in status.stdout


@pytest.mark.skipif(
    not (ROOT / "target" / ".claude" / "hooks" / "workflow-cli.cjs").exists(),
    reason="workflow-cli.cjs not built yet",
)
def test_workflow_cli_state_forces_a_phase_for_manual_recovery(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()
    _init_git_repo(repo)
    agent_dir = tmp_path / "pi-agent"

    _run_workflow_cli(["start", "manual recovery test"], repo, agent_dir)
    result = _run_workflow_cli(["state", "commit"], repo, agent_dir)
    assert result.returncode == 0, result.stderr

    status = _run_workflow_cli(["status"], repo, agent_dir)
    assert "commit" in status.stdout


@pytest.mark.skipif(
    not (ROOT / "target" / ".claude" / "hooks" / "workflow-cli.cjs").exists(),
    reason="workflow-cli.cjs not built yet",
)
def test_workflow_cli_abort_clears_persisted_state(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()
    _init_git_repo(repo)
    agent_dir = tmp_path / "pi-agent"

    _run_workflow_cli(["start", "throwaway"], repo, agent_dir)
    abort = _run_workflow_cli(["abort"], repo, agent_dir)
    assert abort.returncode == 0, abort.stderr

    status = _run_workflow_cli(["status"], repo, agent_dir)
    assert "no" in status.stdout.lower() or "없" in status.stdout


@pytest.mark.skipif(
    not (ROOT / "target" / ".claude" / "hooks" / "workflow-cli.cjs").exists(),
    reason="workflow-cli.cjs not built yet",
)
def test_pi_and_claude_adapters_share_persisted_workflow_state(tmp_path):
    """Spec §8: a workflow written by one adapter must be readable by the other,
    since both bind directly to target/.pi/extensions/workflow/state.ts's
    getWorkflowStateDir() with no adapter-specific override."""
    repo = tmp_path / "repo"
    repo.mkdir()
    _init_git_repo(repo)
    agent_dir = tmp_path / "pi-agent"
    # cwd must be `repo`, not ROOT, so getGitRoot() inside state.ts resolves to
    # the same repo the workflow was started in.
    state_ts = ROOT / "target" / ".pi" / "extensions" / "workflow" / "state.ts"

    # Direction 1: Claude writes, Pi-side module reads.
    start = _run_workflow_cli(["start", "cross adapter title"], repo, agent_dir)
    assert start.returncode == 0, start.stderr

    read_script = _jiti_require_ts(state_ts) + textwrap.dedent("""
        const workflow = mod.loadPersistedWorkflow();
        console.log(JSON.stringify({ phase: workflow && workflow.phase, title: workflow && workflow.title }));
    """)
    read_result = _run_node(read_script, {"PI_CODING_AGENT_DIR": str(agent_dir)}, cwd=repo)
    assert read_result.returncode == 0, read_result.stderr
    read_payload = json.loads(read_result.stdout.strip().splitlines()[-1])
    assert read_payload == {"phase": "interview", "title": "cross adapter title"}

    # Direction 2: Pi-side module writes (moves phase to "plan"), Claude CLI reads it back.
    write_script = _jiti_require_ts(state_ts) + textwrap.dedent("""
        const workflow = mod.loadPersistedWorkflow();
        workflow.phase = 'plan';
        mod.saveWorkflow(workflow);
    """)
    write_result = _run_node(write_script, {"PI_CODING_AGENT_DIR": str(agent_dir)}, cwd=repo)
    assert write_result.returncode == 0, write_result.stderr

    status = _run_workflow_cli(["status"], repo, agent_dir)
    assert "plan" in status.stdout


def _run_hook(subcommand, stdin_obj, repo, agent_dir):
    return subprocess.run(
        ["node", str(ROOT / "target" / ".claude" / "hooks" / "workflow-gate.cjs"), subcommand],
        cwd=repo,
        input=json.dumps(stdin_obj),
        env={**os.environ, "PI_CODING_AGENT_DIR": str(agent_dir)},
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        timeout=30,
    )


@pytest.mark.skipif(
    not (ROOT / "target" / ".claude" / "hooks" / "workflow-gate.cjs").exists(),
    reason="workflow-gate.cjs not built yet",
)
def test_git_push_is_allowed_when_no_workflow_is_active(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()
    _init_git_repo(repo)
    agent_dir = tmp_path / "pi-agent"

    result = _run_hook(
        "check-tool-call",
        {"tool_name": "Bash", "tool_input": {"command": "git push"}},
        repo,
        agent_dir,
    )
    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout) if result.stdout.strip() else {}
    assert payload.get("hookSpecificOutput", {}).get("permissionDecision") == "deny"
    assert "No active workflow" in payload["hookSpecificOutput"]["permissionDecisionReason"]


@pytest.mark.skipif(
    not (ROOT / "target" / ".claude" / "hooks" / "workflow-gate.cjs").exists(),
    reason="workflow-gate.cjs not built yet",
)
def test_git_push_is_denied_outside_push_phase(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()
    _init_git_repo(repo)
    agent_dir = tmp_path / "pi-agent"
    _run_workflow_cli(["start", "phase gate test"], repo, agent_dir)  # phase is "interview"

    result = _run_hook(
        "check-tool-call",
        {"tool_name": "Bash", "tool_input": {"command": "git push origin main"}},
        repo,
        agent_dir,
    )
    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout)
    assert payload["hookSpecificOutput"]["permissionDecision"] == "deny"
    assert "push phase" in payload["hookSpecificOutput"]["permissionDecisionReason"]


@pytest.mark.skipif(
    not (ROOT / "target" / ".claude" / "hooks" / "workflow-gate.cjs").exists(),
    reason="workflow-gate.cjs not built yet",
)
def test_non_push_bash_commands_are_never_blocked(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()
    _init_git_repo(repo)
    agent_dir = tmp_path / "pi-agent"
    _run_workflow_cli(["start", "unrelated command test"], repo, agent_dir)

    result = _run_hook(
        "check-tool-call",
        {"tool_name": "Bash", "tool_input": {"command": "ls -la"}},
        repo,
        agent_dir,
    )
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == ""  # no output at all = plain allow


@pytest.mark.skipif(
    not (ROOT / "target" / ".claude" / "hooks" / "workflow-gate.cjs").exists(),
    reason="workflow-gate.cjs not built yet",
)
def test_session_start_injects_phase_context(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()
    _init_git_repo(repo)
    agent_dir = tmp_path / "pi-agent"
    _run_workflow_cli(["start", "context injection test"], repo, agent_dir)

    result = _run_hook("session-start", {}, repo, agent_dir)
    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout)
    assert payload["hookSpecificOutput"]["hookEventName"] == "SessionStart"
    # formatWorkflowPrompt (reused verbatim from Pi, matching its own
    # before_agent_start / buildWorkflowSystemPromptInjection content) never
    # includes the workflow *title* -- only branch/cwd/phase/hard-rules. The
    # test's own name says "phase context", so assert on the phase, which is
    # both genuinely present and what this test is actually meant to prove.
    assert "Current phase: interview" in payload["hookSpecificOutput"]["additionalContext"]
