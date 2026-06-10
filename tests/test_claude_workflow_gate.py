from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_target_no_longer_ships_claude_code_workflow_assets():
    assert not (ROOT / "target" / ".claude").exists()
    assert not (ROOT / "target" / ".claude" / "hooks" / "workflow-gate.cjs").exists()


def test_install_scripts_do_not_reference_removed_claude_workflow_component():
    scripts = [
        ROOT / "scripts" / "init-target-harness.py",
        ROOT / "scripts" / "init-target-harness.sh",
        ROOT / "scripts" / "init-target-harness.ps1",
        ROOT / "scripts" / "update-harness.sh",
        ROOT / "scripts" / "update-harness.ps1",
    ]
    for script in scripts:
        src = script.read_text(encoding="utf-8")
        assert "claude-workflow" not in src
        assert "workflow-gate.cjs" not in src
