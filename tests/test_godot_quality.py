import importlib.util
import json
import os
import shutil
import stat
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
ADAPTER = ROOT / "target" / ".pi" / "skills" / "godot-development" / "tools" / "godot_quality.py"
BROKEN_FIXTURES = ROOT / "tests" / "fixtures" / "godot-project-broken"

_spec = importlib.util.spec_from_file_location("godot_quality", ADAPTER)
godot_quality = importlib.util.module_from_spec(_spec)
assert _spec.loader is not None
_spec.loader.exec_module(godot_quality)


def make_project(tmp_path, *, fake_output="", fake_code=0, config=None):
    (tmp_path / "project.godot").write_text(
        "[application]\nrun/main_scene=\"res://main.tscn\"\n",
        encoding="utf-8",
    )
    (tmp_path / "main.tscn").write_text(
        '[gd_scene load_steps=2 format=3]\n\n'
        '[ext_resource path="res://player.gd" type="Script" id="1"]\n',
        encoding="utf-8",
    )
    (tmp_path / "test.tscn").write_text("[gd_scene format=3]\n", encoding="utf-8")
    (tmp_path / "player.gd").write_text("extends Node\n", encoding="utf-8")
    (tmp_path / "export_presets.cfg").write_text(
        '[preset.0]\nname="Linux"\nplatform="Linux"\n', encoding="utf-8"
    )
    local = tmp_path / ".pi" / "local"
    local.mkdir(parents=True)
    values = {"godot_bin": str(make_fake(tmp_path, fake_output, fake_code)),
              "test_scene": "test.tscn", "export_preset": "Linux", "export_output": "build/game.pck"}
    if config:
        values.update(config)
    (local / "godot.json").write_text(json.dumps(values), encoding="utf-8")
    (tmp_path / "build").mkdir()
    return values["godot_bin"]


def make_fake(tmp_path, output="", code=0):
    if os.name == "nt":
        fake = tmp_path / "fake-godot.cmd"
        lines = ["@echo off", 'if "%1"=="--version" echo Godot Engine v4.3.stable']
        if output:
            lines.append(f"echo {output}")
        lines.append(f"exit /b {code}")
        fake.write_text("\n".join(lines) + "\n", encoding="utf-8")
        return fake
    fake = tmp_path / "fake-godot"
    fake.write_text(
        "#!/usr/bin/env python3\nimport sys\n"
        "if '--version' in sys.argv: print('Godot Engine v4.3.stable')\n"
        f"print({output!r})\n"
        f"raise SystemExit({code})\n", encoding="utf-8")
    fake.chmod(fake.stat().st_mode | stat.S_IXUSR)
    return fake


def make_behavior_fake(tmp_path, *, mode="pass", record=None):
    """Create a fake Godot that can fail or hang only for a requested action."""
    script = tmp_path / "fake-godot-behavior.py"
    script.write_text(
        "import json, sys, time\n"
        f"mode = {mode!r}\n"
        f"record = {str(record) if record else None!r}\n"
        "args = sys.argv[1:]\n"
        "if record:\n"
        "    with open(record, 'a', encoding='utf-8') as stream:\n"
        "        stream.write(json.dumps(args) + '\\n')\n"
        "if '--version' in args:\n"
        "    print('Godot Engine v4.3.stable')\n"
        "    raise SystemExit(0)\n"
        "if mode == 'timeout':\n"
        "    time.sleep(5)\n"
        "elif mode == 'script-parse-error' and '--check-only' in args:\n"
        "    print('Parse Error: invalid GDScript')\n"
        "    raise SystemExit(1)\n"
        "elif mode == 'test-failure' and '--scene' in args:\n"
        "    print('test failed')\n"
        "    raise SystemExit(7)\n"
        "elif mode == 'export-failure' and '--export-release' in args:\n"
        "    print('export failed')\n"
        "    raise SystemExit(8)\n",
        encoding="utf-8",
    )
    if os.name == "nt":
        fake = tmp_path / "fake-godot-behavior.cmd"
        fake.write_text(
            f'@echo off\n"{sys.executable}" "{script}" %*\n', encoding="utf-8"
        )
        return fake
    fake = tmp_path / "fake-godot-behavior"
    fake.write_text("#!/bin/sh\nexec \"" + sys.executable + "\" \"" + str(script) + "\" \"$@\"\n", encoding="utf-8")
    fake.chmod(fake.stat().st_mode | stat.S_IXUSR)
    return fake


def run(project, action):
    env = os.environ.copy()
    env.pop("GODOT_BIN", None)
    return subprocess.run(
        [sys.executable, str(ADAPTER), action], cwd=project, env=env,
        capture_output=True, text=True, check=False,
    )


def test_gate_uses_fixed_steps_and_returns_json(tmp_path):
    make_project(tmp_path)
    result = run(tmp_path, "gate")
    payload = json.loads(result.stdout)
    assert result.returncode == 0
    assert payload["status"] == "pass"
    assert [step["action"] for step in payload["steps"]] == ["quality", "test", "export"]
    assert all("command" in step and "exit_code" in step for step in payload["steps"])


def test_missing_resource_is_reported_without_running_arbitrary_command(tmp_path):
    make_project(tmp_path)
    (tmp_path / "main.tscn").write_text(
        '[gd_scene format=3]\n[ext_resource path="res://missing.gd" type="Script" id="1"]\n',
        encoding="utf-8",
    )
    result = run(tmp_path, "quality")
    payload = json.loads(result.stdout)
    assert result.returncode != 0
    assert payload["status"] == "fail"
    assert any("missing-resource" in error for error in payload["errors"])


def test_warning_policy_defaults_to_non_failing(tmp_path):
    make_project(tmp_path, fake_output="WARNING: harmless warning")
    result = run(tmp_path, "gate")
    payload = json.loads(result.stdout)
    assert result.returncode == 0
    assert payload["status"] == "pass"
    assert payload["warnings"]
    assert payload["errors"] == []


@pytest.mark.parametrize("line, expected", [
    ("Godot Engine v4.3 nonsense", None),
    ("4.3.stable nonsense", None),
    ("4.3.stable.official.77dcf97d8", "4"),
    ("Godot Engine v4.3.stable.official.77dcf97d8", "4"),
])
def test_version_parser_rejects_trailing_text_and_accepts_commit_hash(line, expected):
    assert godot_quality._parse_godot_version(line) == expected


def test_invalid_version_is_tool_error(tmp_path):
    if os.name == "nt":
        fake = tmp_path / "fake-godot-v3.cmd"
        fake.write_text('@echo off\necho Godot Engine v3.5.stable\n', encoding="utf-8")
    else:
        fake = make_fake(tmp_path)
        fake.write_text("#!/usr/bin/env python3\nprint('Godot Engine v3.5.stable')\n", encoding="utf-8")
        fake.chmod(fake.stat().st_mode | stat.S_IXUSR)
    make_project(tmp_path, config={"godot_bin": str(fake)})
    result = run(tmp_path, "quality")
    payload = json.loads(result.stdout)
    assert result.returncode != 0
    assert payload["status"] == "tool-error"
    assert any("invalid-godot-version" in error for error in payload["errors"])


def test_arbitrary_numeric_version_text_is_tool_error(tmp_path):
    if os.name == "nt":
        fake = tmp_path / "fake-godot-not-godot.cmd"
        fake.write_text('@echo off\necho Not Godot tool 4.3\n', encoding="utf-8")
    else:
        fake = make_fake(tmp_path)
        fake.write_text("#!/usr/bin/env python3\nprint('Not Godot tool 4.3')\n", encoding="utf-8")
        fake.chmod(fake.stat().st_mode | stat.S_IXUSR)
    make_project(tmp_path, config={"godot_bin": str(fake)})
    result = run(tmp_path, "quality")
    payload = json.loads(result.stdout)
    assert result.returncode == 1
    assert payload["status"] == "tool-error"
    assert "invalid-godot-version" in payload["errors"]


def test_version_parse_failure_is_tool_error(tmp_path):
    if os.name == "nt":
        fake = tmp_path / "fake-godot-malformed.cmd"
        fake.write_text('@echo off\necho not a Godot version\n', encoding="utf-8")
    else:
        fake = make_fake(tmp_path)
        fake.write_text("#!/usr/bin/env python3\nprint('not a Godot version')\n", encoding="utf-8")
        fake.chmod(fake.stat().st_mode | stat.S_IXUSR)
    make_project(tmp_path, config={"godot_bin": str(fake)})
    result = run(tmp_path, "quality")
    payload = json.loads(result.stdout)
    assert result.returncode == 1
    assert payload["status"] == "tool-error"
    assert "invalid-godot-version" in payload["errors"]


@pytest.mark.parametrize("config_text, expected", [
    ("{not-json", "malformed-godot-config"),
    ('{"arbitrary_argv": ["--script"]}', "unknown-godot-config-key"),
])
def test_malformed_or_unknown_config_is_rejected(tmp_path, config_text, expected):
    make_project(tmp_path)
    (tmp_path / ".pi" / "local" / "godot.json").write_text(config_text, encoding="utf-8")
    result = run(tmp_path, "test")
    payload = json.loads(result.stdout)
    assert result.returncode == 1
    assert payload["status"] == "config-error"
    assert any(expected in error for error in payload["errors"])


def test_missing_test_scene_is_config_error(tmp_path):
    make_project(tmp_path, config={"test_scene": "missing.tscn"})
    result = run(tmp_path, "test")
    payload = json.loads(result.stdout)
    assert result.returncode == 1
    assert payload["status"] == "config-error"
    assert "missing-test-scene" in payload["errors"]


def test_missing_export_preset_is_config_error(tmp_path):
    make_project(tmp_path)
    config_path = tmp_path / ".pi" / "local" / "godot.json"
    config = json.loads(config_path.read_text(encoding="utf-8"))
    del config["export_preset"]
    config_path.write_text(json.dumps(config), encoding="utf-8")
    result = run(tmp_path, "export")
    payload = json.loads(result.stdout)
    assert result.returncode == 1
    assert payload["status"] == "config-error"
    assert "missing-export-preset" in payload["errors"]


def test_non_empty_export_preset_must_exist_in_export_presets_cfg(tmp_path):
    make_project(tmp_path, config={"export_preset": "Windows"})
    result = run(tmp_path, "export")
    payload = json.loads(result.stdout)
    assert result.returncode == 1
    assert payload["status"] == "config-error"
    assert "missing-export-preset" in payload["errors"]


def test_every_declared_broken_fixture_case_is_regressed(tmp_path):
    cases = json.loads((BROKEN_FIXTURES / "cases.json").read_text(encoding="utf-8"))
    for case in cases.values():
        project = tmp_path / case["project"]
        shutil.copytree(BROKEN_FIXTURES / case["project"], project)
        fake = make_behavior_fake(tmp_path, mode=case.get("fake_mode", "pass"))
        config_path = project / ".pi" / "local" / "godot.json"
        config_path.parent.mkdir(parents=True, exist_ok=True)
        config = json.loads(config_path.read_text(encoding="utf-8")) if config_path.exists() else {}
        config.update({"godot_bin": str(fake)})
        config_path.write_text(json.dumps(config), encoding="utf-8")
        result = run(project, case["action"])
        payload = json.loads(result.stdout)
        assert result.returncode == 1, case["project"]
        assert any(case["expected_error"] in error for error in payload["errors"]), payload


def test_test_action_uses_integer_quit_after_separate_from_wall_clock_timeout(tmp_path):
    record = tmp_path / "argv.log"
    fake = make_behavior_fake(tmp_path, record=record)
    make_project(tmp_path, config={"godot_bin": str(fake), "timeout_seconds": 12.5})
    result = run(tmp_path, "test")
    payload = json.loads(result.stdout)
    assert result.returncode == 0
    assert payload["status"] == "pass"
    command = payload["command"]
    assert command[1:] == ["--headless", "--path", str(tmp_path), "--scene", "res://test.tscn", "--quit-after", "13"]
    assert "--quit" not in command
    assert "--script" not in command


def test_test_action_default_timeout_uses_integer_quit_after(tmp_path):
    fake = make_behavior_fake(tmp_path)
    make_project(tmp_path, config={"godot_bin": str(fake)})
    result = run(tmp_path, "test")
    payload = json.loads(result.stdout)
    assert result.returncode == 0
    assert payload["command"][-1] == "60"


def test_scn_main_scene_is_valid_and_scn_references_are_scanned(tmp_path):
    make_project(tmp_path)
    (tmp_path / "main.tscn").rename(tmp_path / "main.scn")
    project = tmp_path / "project.godot"
    project.write_text(
        project.read_text(encoding="utf-8").replace("main.tscn", "main.scn"),
        encoding="utf-8",
    )
    (tmp_path / "other.scn").write_text(
        '[gd_scene format=3]\n[ext_resource path="res://missing.gd" type="Script" id="1"]\n',
        encoding="utf-8",
    )
    result = run(tmp_path, "quality")
    payload = json.loads(result.stdout)
    assert result.returncode == 1
    assert payload["status"] == "fail"
    assert any("missing-resource" in error for error in payload["errors"])
    assert "main.scn" in payload["checked_files"]
    assert "other.scn" in payload["checked_files"]


def test_test_failure_is_reported(tmp_path):
    fake = make_behavior_fake(tmp_path, mode="test-failure")
    make_project(tmp_path, config={"godot_bin": str(fake)})
    result = run(tmp_path, "test")
    payload = json.loads(result.stdout)
    assert result.returncode == 1
    assert payload["status"] == "fail"
    assert "test-failure" in payload["errors"]


def test_export_failure_is_reported(tmp_path):
    fake = make_behavior_fake(tmp_path, mode="export-failure")
    make_project(tmp_path, config={"godot_bin": str(fake)})
    result = run(tmp_path, "export")
    payload = json.loads(result.stdout)
    assert result.returncode == 1
    assert payload["status"] == "fail"
    assert "export-failure" in payload["errors"]


def test_timeout_is_reported(tmp_path):
    fake = make_behavior_fake(tmp_path, mode="timeout")
    make_project(tmp_path, config={"godot_bin": str(fake), "timeout_seconds": 0.1})
    result = run(tmp_path, "test")
    payload = json.loads(result.stdout)
    assert result.returncode == 1
    assert payload["status"] == "timeout"
    assert "process-timeout" in payload["errors"]
    assert payload["command"][-1] == "1"


def test_test_scene_path_escape_is_rejected(tmp_path):
    make_project(tmp_path, config={"test_scene": "../outside.tscn"})
    result = run(tmp_path, "test")
    payload = json.loads(result.stdout)
    assert result.returncode == 1
    assert payload["status"] == "config-error"
    assert "test-scene-path-escape" in payload["errors"]


def test_symlink_scene_escape_is_rejected(tmp_path):
    outside = tmp_path.parent / "outside-scene.tscn"
    outside.write_text("[gd_scene format=3]\n", encoding="utf-8")
    link = tmp_path / "linked-scene.tscn"
    try:
        link.symlink_to(outside)
    except (OSError, NotImplementedError):
        pytest.skip("symlinks unavailable")
    make_project(tmp_path, config={"test_scene": "linked-scene.tscn"})
    result = run(tmp_path, "test")
    payload = json.loads(result.stdout)
    assert result.returncode == 1
    assert payload["status"] == "config-error"
    assert "test-scene-symlink-escape" in payload["errors"]


def test_export_path_escape_is_rejected(tmp_path):
    make_project(tmp_path, config={"export_output": "../outside/game.pck"})
    result = run(tmp_path, "export")
    payload = json.loads(result.stdout)
    assert result.returncode == 1
    assert payload["status"] == "config-error"
    assert "export-output-path-escape" in payload["errors"]


def test_existing_export_is_rejected_by_default(tmp_path):
    make_project(tmp_path)
    (tmp_path / "build" / "game.pck").write_bytes(b"old")
    result = run(tmp_path, "export")
    payload = json.loads(result.stdout)
    assert result.returncode != 0
    assert payload["status"] == "config-error"
    assert any("export-overwrite" in error for error in payload["errors"])


def test_gate_preserves_later_step_diagnostics_after_test_failure(tmp_path):
    fake = make_behavior_fake(tmp_path, mode="test-failure")
    make_project(tmp_path, config={"godot_bin": str(fake)})
    result = run(tmp_path, "gate")
    payload = json.loads(result.stdout)
    assert result.returncode == 1
    assert payload["status"] == "fail"
    assert [step["action"] for step in payload["steps"]] == ["quality", "test", "export"]
    assert payload["steps"][1]["status"] == "fail"
    assert "test-failure" in payload["steps"][1]["errors"]
    assert payload["steps"][2]["action"] == "export"


def test_warning_policy_can_promote_warning_to_failure(tmp_path):
    make_project(tmp_path, fake_output="WARNING: warning must block", config={"fail_on_warning": True})
    result = run(tmp_path, "quality")
    payload = json.loads(result.stdout)
    assert result.returncode == 1
    assert payload["status"] == "fail"
    assert "warning-policy-failure" in payload["errors"]


def test_overwrite_true_allows_existing_regular_export(tmp_path):
    make_project(tmp_path, config={"overwrite_export": True})
    output = tmp_path / "build" / "game.pck"
    output.write_bytes(b"old")
    result = run(tmp_path, "export")
    payload = json.loads(result.stdout)
    assert result.returncode == 0
    assert payload["status"] == "pass"
    assert "--export-release" in payload["command"]


def test_missing_executable_is_tool_error(tmp_path):
    make_project(tmp_path, config={"godot_bin": str(tmp_path / "missing-godot")})
    result = run(tmp_path, "quality")
    payload = json.loads(result.stdout)
    assert result.returncode == 1
    assert payload["status"] == "tool-error"
    assert "godot-executable-not-found" in payload["errors"]
