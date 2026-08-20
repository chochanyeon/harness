import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[1]


def test_python_initializer_can_install_memory_only(tmp_path):
    result = subprocess.run(
        [
            sys.executable,
            "scripts/init-target-harness.py",
            "--source",
            "target",
            "--dest",
            str(tmp_path),
            "--component",
            "memory",
        ],
        cwd=ROOT,
        text=True,
        encoding="utf-8",
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=30,
    )
    assert result.returncode == 0, result.stderr

    assert (tmp_path / "AGENTS.md").exists()
    assert (tmp_path / ".pi" / "extensions" / "memory.ts").exists()
    assert (tmp_path / ".pi" / "extensions" / "memory" / "core.ts").exists()
    assert (tmp_path / ".pi" / "schemas" / "harness-memory-entry.schema.json").exists()
    assert not (tmp_path / ".pi" / "extensions" / "workflow.ts").exists()
    assert not (tmp_path / ".pi" / "WORKFLOW.md").exists()


def test_python_initializer_can_install_workflow_only(tmp_path):
    result = subprocess.run(
        [
            sys.executable,
            "scripts/init-target-harness.py",
            "--source",
            "target",
            "--dest",
            str(tmp_path),
            "--component",
            "workflow",
        ],
        cwd=ROOT,
        text=True,
        encoding="utf-8",
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=30,
    )
    assert result.returncode == 0, result.stderr

    assert (tmp_path / "AGENTS.md").exists()
    assert (tmp_path / ".pi" / "extensions" / "workflow.ts").exists()
    assert (tmp_path / ".pi" / "extensions" / "workflow").exists()
    assert (tmp_path / ".pi" / "schemas" / "harness-field-log-event.schema.json").exists()
    assert (tmp_path / ".pi" / "themes" / "workflow-console.json").exists()
    assert (tmp_path / ".pi" / "skills" / "godot-development" / "SKILL.md").exists()
    assert (tmp_path / ".pi" / "skills" / "godot-development" / "tools" / "godot_quality.py").exists()
    assert (tmp_path / ".pi" / "workflows" / "godot-quality-gate.md").exists()
    assert (tmp_path / ".ai" / "interview").exists()
    assert not (tmp_path / ".ai" / "interview" / "feature-interview-protocol.md").exists()
    assert not (tmp_path / ".ai" / "interview" / "requirements-room-protocol.md").exists()
    assert not (tmp_path / ".pi" / "skills" / "requirements-room" / "SKILL.md").exists()
    assert not (tmp_path / ".pi" / "extensions" / "memory.ts").exists()
    assert not (tmp_path / ".pi" / "schemas" / "harness-memory-entry.schema.json").exists()


def test_python_initializer_rejects_removed_claude_workflow_component(tmp_path):
    result = subprocess.run(
        [
            sys.executable,
            "scripts/init-target-harness.py",
            "--source",
            "target",
            "--dest",
            str(tmp_path),
            "--component",
            "claude-workflow",
        ],
        cwd=ROOT,
        text=True,
        encoding="utf-8",
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=30,
    )
    assert result.returncode != 0
    assert "invalid choice: 'claude-workflow'" in result.stderr
    assert not (tmp_path / ".claude").exists()


def test_python_initializer_can_install_claude_only(tmp_path):
    result = subprocess.run(
        [
            sys.executable,
            "scripts/init-target-harness.py",
            "--source", "target",
            "--dest", str(tmp_path),
            "--component", "claude",
        ],
        cwd=ROOT,
        text=True,
        encoding="utf-8",
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=30,
    )
    assert result.returncode == 0, result.stderr
    assert (tmp_path / ".claude" / "settings.json").exists()
    assert (tmp_path / ".claude" / "hooks" / "workflow-gate.cjs").exists()
    assert (tmp_path / ".claude" / "commands" / "workflow" / "start.md").exists()
    assert (tmp_path / ".claude" / "commands" / "memory" / "remember.md").exists()
    assert not (tmp_path / ".pi").exists()  # claude component doesn't pull in Pi files


def test_python_initializer_default_all_installs_claude(tmp_path):
    result = subprocess.run(
        [sys.executable, "scripts/init-target-harness.py", "--source", "target", "--dest", str(tmp_path)],
        cwd=ROOT,
        text=True,
        encoding="utf-8",
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=30,
    )
    assert result.returncode == 0, result.stderr
    assert (tmp_path / ".claude" / "settings.json").exists()


def test_python_initializer_combining_all_with_claude_installs_both(tmp_path):
    result = subprocess.run(
        [
            sys.executable,
            "scripts/init-target-harness.py",
            "--source",
            "target",
            "--dest",
            str(tmp_path),
            "--component",
            "all",
            "--component",
            "claude",
        ],
        cwd=ROOT,
        text=True,
        encoding="utf-8",
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=30,
    )
    assert result.returncode == 0, result.stderr
    assert (tmp_path / ".pi" / "extensions" / "workflow.ts").exists()
    assert (tmp_path / ".claude" / "settings.json").exists()


@pytest.mark.skipif(
    shutil.which("bash") is None or os.name == "nt",
    reason="bash and python3 are required",
)
def test_shell_initializer_combining_all_with_claude_installs_both(tmp_path):
    result = subprocess.run(
        [
            "bash",
            "scripts/init-target-harness.sh",
            "--repo",
            str(ROOT),
            "--dest",
            str(tmp_path),
            "--component",
            "all",
            "--component",
            "claude",
        ],
        cwd=ROOT,
        text=True,
        encoding="utf-8",
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=60,
    )
    assert result.returncode == 0, result.stderr
    assert (tmp_path / ".pi" / "extensions" / "workflow.ts").exists()
    assert (tmp_path / ".claude" / "settings.json").exists()


def test_update_scripts_are_component_granular_for_claude():
    sh = (ROOT / "scripts" / "update-harness.sh").read_text(encoding="utf-8")
    ps1 = (ROOT / "scripts" / "update-harness.ps1").read_text(encoding="utf-8")
    assert ".claude/hooks" in sh
    assert '".claude/hooks"' in ps1


def test_unix_initializer_workflow_component_includes_assistant_markdown_box():
    sh = (ROOT / "scripts" / "init-target-harness.sh").read_text(encoding="utf-8")

    assert ".pi/extensions/assistant-markdown-box.ts" in sh
    selected_block = sh.split("component_selected_with()", 1)[1]
    assert ".pi/extensions/assistant-markdown-box.ts" in selected_block


def _venv_python(venv: Path) -> Path:
    return venv / ("Scripts/python.exe" if os.name == "nt" else "bin/python")


def test_sync_dev_harness_excludes_generated_cache_and_preserves_destination_venv(tmp_path):
    src = tmp_path / "src"
    dest = tmp_path / "dest"
    (src / "dpaa" / "__pycache__").mkdir(parents=True)
    (src / "dpaa" / "__pycache__" / "cli.pyc").write_bytes(b"cache")
    (src / ".venv" / "bin").mkdir(parents=True)
    (src / ".venv" / "bin" / "source-python").write_text("source venv", encoding="utf-8")
    (src / "pkg.egg-info").mkdir(parents=True)
    (src / "pkg.egg-info" / "PKG-INFO").write_text("metadata", encoding="utf-8")
    (src / "extensions").mkdir(parents=True)
    (src / "extensions" / "workflow.ts").write_text("runtime", encoding="utf-8")
    (dest / ".venv" / "Scripts").mkdir(parents=True)
    (dest / ".venv" / "Scripts" / "python.exe").write_text("destination venv", encoding="utf-8")
    (dest / "old" / "__pycache__").mkdir(parents=True)
    (dest / "old" / "__pycache__" / "stale.pyc").write_bytes(b"stale")
    (dest / ".cache").mkdir(parents=True)
    (dest / ".cache" / "stale.txt").write_text("cache", encoding="utf-8")

    result = subprocess.run(
        [sys.executable, "scripts/sync-dev-harness.py", str(src), str(dest)],
        cwd=ROOT,
        text=True,
        encoding="utf-8",
        env={**os.environ, "PYTHONIOENCODING": "utf-8"},
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=30,
    )

    assert result.returncode == 0, result.stderr
    assert (dest / "extensions" / "workflow.ts").exists()
    assert not (dest / "dpaa" / "__pycache__" / "cli.pyc").exists()
    assert (dest / ".venv" / "Scripts" / "python.exe").read_text(encoding="utf-8") == "destination venv"
    assert not (dest / ".venv" / "bin" / "source-python").exists()
    assert not (dest / "pkg.egg-info").exists()
    assert not (dest / "old" / "__pycache__" / "stale.pyc").exists()
    assert not (dest / ".cache" / "stale.txt").exists()


@pytest.mark.skipif(
    shutil.which("bash") is None or os.name == "nt",
    reason="bash and python3 are required",
)
def test_sync_dev_harness_shell_propagates_godot_adapter_and_workflow(tmp_path):
    repo = tmp_path / "repo"
    source = repo / "target" / ".pi"
    destination = repo / ".pi"
    scripts = repo / "scripts"
    scripts.mkdir(parents=True)
    shutil.copy2(ROOT / "scripts" / "sync-dev-harness.sh", scripts / "sync-dev-harness.sh")
    shutil.copy2(ROOT / "scripts" / "sync-dev-harness.py", scripts / "sync-dev-harness.py")

    rel_paths = [
        Path("skills/godot-development/tools/godot_quality.py"),
        Path("workflows/godot-quality-gate.md"),
    ]
    for relative in rel_paths:
        source_path = source / relative
        source_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / "target" / ".pi" / relative, source_path)
    (destination / "old").mkdir(parents=True)
    (destination / "old" / "stale.txt").write_text("stale", encoding="utf-8")

    result = subprocess.run(
        ["bash", "scripts/sync-dev-harness.sh"],
        cwd=repo,
        text=True,
        encoding="utf-8",
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=30,
    )

    assert result.returncode == 0, result.stderr
    for relative in rel_paths:
        assert (destination / relative).read_bytes() == (source / relative).read_bytes()
    assert not (destination / "old" / "stale.txt").exists()


def test_sync_dev_harness_preserves_real_destination_venv_pip(tmp_path):
    src = tmp_path / "src"
    dest = tmp_path / "dest"
    (src / "extensions").mkdir(parents=True)
    (src / "extensions" / "workflow.ts").write_text("runtime", encoding="utf-8")
    venv = dest / ".venv"
    subprocess.run([sys.executable, "-m", "venv", str(venv)], check=True, timeout=60)
    python = _venv_python(venv)
    subprocess.run([str(python), "-m", "pip", "--version"], check=True, stdout=subprocess.PIPE, timeout=30)

    result = subprocess.run(
        [sys.executable, "scripts/sync-dev-harness.py", str(src), str(dest)],
        cwd=ROOT,
        text=True,
        encoding="utf-8",
        env={**os.environ, "PYTHONIOENCODING": "utf-8"},
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=30,
    )

    assert result.returncode == 0, result.stderr
    assert python.exists()
    subprocess.run([str(python), "-m", "pip", "--version"], check=True, stdout=subprocess.PIPE, timeout=30)


def test_update_scripts_are_component_granular():
    sh = (ROOT / "scripts" / "update-harness.sh").read_text(encoding="utf-8")
    ps1 = (ROOT / "scripts" / "update-harness.ps1").read_text(encoding="utf-8")

    assert "--component" in sh
    assert ".pi/extensions/workflow.ts" in sh
    assert ".pi/extensions/memory.ts" in sh
    assert ".pi/extensions \\" not in sh
    assert ".pi/schemas/harness-field-log-event.schema.json" in sh
    assert ".pi/schemas/harness-memory-entry.schema.json" in sh
    assert ".pi/themes" in sh
    assert ".claude/commands/feature-interview.md" not in sh
    assert ".claude/commands/requirements-room.md" not in sh
    assert ".ai/interview/requirements-room-protocol.md" not in sh
    assert "Template directory not found in cloned repo: target" in sh
    assert "No managed harness paths were found in template" in sh

    assert "[string[]]$Component" in ps1
    assert '".pi/extensions/workflow.ts"' in ps1
    assert '".pi/extensions/memory.ts"' in ps1
    assert '".pi/extensions"' not in ps1
    assert '".pi/schemas"' not in ps1
    assert '".pi/themes"' in ps1
    assert '".ai/interview/feature-interview-protocol.md"' not in ps1
    assert '".ai/interview/requirements-room-protocol.md"' not in ps1
    assert '".claude/commands/feature-interview.md"' not in ps1
    assert '".claude/commands/requirements-room.md"' not in ps1
    assert "Template directory not found in cloned repo: target" in ps1
    assert "No managed harness paths were found in template" in ps1


def test_powershell_clean_preserve_normalizes_single_backslash_paths():
    ps1 = (ROOT / "scripts" / "init-target-harness.ps1").read_text(encoding="utf-8")

    assert "$normalized = $Rel.Replace('\\', '/')" in ps1
    assert "$Rel.Replace('\\\\', '/')" not in ps1


def test_corenlp_setup_gracefully_skips_when_port_is_already_in_use():
    ps1 = (ROOT / "target" / ".pi" / "setup_corenlp.ps1").read_text(encoding="utf-8")
    sh = (ROOT / "target" / ".pi" / "setup_corenlp.sh").read_text(encoding="utf-8")

    assert "Test-LocalPortInUse" in ps1
    assert "Port $Port is already in use" in ps1
    assert "Skipping CoreNLP container creation/start" in ps1
    assert "CORENLP_PORT" in ps1
    assert "port_in_use" in sh
    assert "port ${PORT} is already in use" in sh
    assert "Skipping CoreNLP container creation/start" in sh
    assert "CORENLP_PORT" in sh


def test_install_update_entrypoints_force_utf8_and_do_not_reference_legacy_codepages():
    paths = [
        ROOT / "scripts" / "init-target-harness.ps1",
        ROOT / "scripts" / "update-harness.ps1",
        ROOT / "scripts" / "init-target-harness.sh",
        ROOT / "scripts" / "update-harness.sh",
        ROOT / "scripts" / "init-target-harness.cmd",
        ROOT / "scripts" / "update-harness.cmd",
        ROOT / "scripts" / "init-target-harness.py",
        ROOT / "target" / ".pi" / "setup_corenlp.ps1",
    ]
    combined = "\n".join(path.read_text(encoding="utf-8") for path in paths)

    lowered = combined.lower()
    assert ("cp" + "949") not in lowered
    assert ("euc" + "-kr") not in lowered
    assert "PYTHONIOENCODING" in combined
    assert "utf-8" in combined.lower() or "UTF8" in combined
    assert "chcp 65001" in combined
    assert "[Console]::InputEncoding = [System.Text.Encoding]::UTF8" in combined
    assert "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8" in combined


def test_claude_command_names_are_not_redundantly_prefixed_by_subdirectory():
    """Claude Code namespaces project slash commands by their immediate parent
    subdirectory, invoked as /<subdir>:<name> (confirmed by live testing —
    a file at .claude/commands/workflow/start.md is invoked as /workflow:start).
    A filename that repeats its own subdirectory as a prefix (e.g.
    workflow/workflow-start.md) produces a stuttering /workflow:workflow-start
    invocation instead of the clean /workflow:start. This test fails if that
    ever happens again.
    """
    commands_root = ROOT / "target" / ".claude" / "commands"
    command_files = sorted(commands_root.glob("*/*.md"))
    assert command_files, f"expected at least one command file under {commands_root}"

    stuttering = [
        path
        for path in command_files
        if path.stem.startswith(f"{path.parent.name}-")
    ]

    assert not stuttering, (
        "Command file name redundantly repeats its subdirectory name, producing "
        f"a stuttering /<subdir>:<subdir>-<name> invocation: {stuttering}"
    )
