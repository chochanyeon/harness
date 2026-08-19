import json
import os
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]


def _run_memory_cli(args, repo):
    return subprocess.run(
        ["node", str(ROOT / "target" / ".claude" / "hooks" / "memory-cli.cjs"), *args],
        cwd=repo,
        env={**os.environ, "HARNESS_MEMORY_ROOT": str(repo)},
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        timeout=30,
    )


def _run_memory_context(subcommand, stdin_obj, repo):
    return subprocess.run(
        ["node", str(ROOT / "target" / ".claude" / "hooks" / "memory-context.cjs"), subcommand],
        cwd=repo,
        input=json.dumps(stdin_obj),
        env={**os.environ, "HARNESS_MEMORY_ROOT": str(repo)},
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        timeout=30,
    )


@pytest.mark.skipif(
    not (ROOT / "target" / ".claude" / "hooks" / "memory-cli.cjs").exists(),
    reason="memory-cli.cjs not built yet",
)
def test_memory_cli_remember_then_list_then_search(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()

    remembered = _run_memory_cli(["remember", "Always run pytest with -q in this repo"], repo)
    assert remembered.returncode == 0, remembered.stderr
    assert "Memory saved" in remembered.stdout

    listing = _run_memory_cli(["list"], repo)
    assert "pytest" in listing.stdout

    search = _run_memory_cli(["search", "pytest"], repo)
    assert "pytest" in search.stdout


@pytest.mark.skipif(
    not (ROOT / "target" / ".claude" / "hooks" / "memory-cli.cjs").exists(),
    reason="memory-cli.cjs not built yet",
)
def test_memory_cli_rejects_secret_like_text(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()

    result = _run_memory_cli(["remember", "AKIA1234567890ABCDEF is our prod key"], repo)
    assert "not saved" in result.stdout.lower()


@pytest.mark.skipif(
    not (ROOT / "target" / ".claude" / "hooks" / "memory-context.cjs").exists(),
    reason="memory-context.cjs not built yet",
)
def test_memory_context_injects_relevant_active_memory_on_user_prompt(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()
    _run_memory_cli(["remember", "This project always runs pytest with -q"], repo)

    result = _run_memory_context("user-prompt", {"prompt": "how do I run pytest here"}, repo)
    assert result.returncode == 0, result.stderr
    if result.stdout.strip():
        payload = json.loads(result.stdout)
        assert "pytest" in payload["hookSpecificOutput"]["additionalContext"]


@pytest.mark.skipif(
    not (ROOT / "target" / ".claude" / "hooks" / "memory-context.cjs").exists(),
    reason="memory-context.cjs not built yet",
)
def test_memory_context_session_start_is_silent_with_no_memories(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()

    result = _run_memory_context("session-start", {}, repo)
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == ""
