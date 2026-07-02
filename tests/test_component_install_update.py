import subprocess
import sys
from pathlib import Path


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


def test_unix_initializer_workflow_component_includes_assistant_markdown_box():
    sh = (ROOT / "scripts" / "init-target-harness.sh").read_text(encoding="utf-8")

    assert ".pi/extensions/assistant-markdown-box.ts" in sh
    selected_block = sh.split("component_selected_with()", 1)[1]
    assert ".pi/extensions/assistant-markdown-box.ts" in selected_block


def test_sync_dev_harness_excludes_generated_cache_and_venv_paths(tmp_path):
    src = tmp_path / "src"
    dest = tmp_path / "dest"
    (src / "dpaa" / "__pycache__").mkdir(parents=True)
    (src / "dpaa" / "__pycache__" / "cli.pyc").write_bytes(b"cache")
    (src / ".venv" / "bin").mkdir(parents=True)
    (src / ".venv" / "bin" / "python").write_text("venv", encoding="utf-8")
    (src / "pkg.egg-info").mkdir(parents=True)
    (src / "pkg.egg-info" / "PKG-INFO").write_text("metadata", encoding="utf-8")
    (src / "extensions").mkdir(parents=True)
    (src / "extensions" / "workflow.ts").write_text("runtime", encoding="utf-8")
    (dest / "old" / "__pycache__").mkdir(parents=True)
    (dest / "old" / "__pycache__" / "stale.pyc").write_bytes(b"stale")

    result = subprocess.run(
        [sys.executable, "scripts/sync-dev-harness.py", str(src), str(dest)],
        cwd=ROOT,
        text=True,
        encoding="utf-8",
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=30,
    )

    assert result.returncode == 0, result.stderr
    assert (dest / "extensions" / "workflow.ts").exists()
    assert not (dest / "dpaa" / "__pycache__" / "cli.pyc").exists()
    assert not (dest / ".venv").exists()
    assert not (dest / "pkg.egg-info").exists()
    assert not (dest / "old" / "__pycache__" / "stale.pyc").exists()


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
