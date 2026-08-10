#!/usr/bin/env python3
"""Safe, JSON-producing Godot 4 quality adapter.

The adapter deliberately exposes a small command surface.  Project configuration
can select project content and policy, but never a shell command or subprocess
arguments.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import re
import signal
import shutil
import subprocess
import sys
import threading
import time
from pathlib import Path, PureWindowsPath
from typing import Any, Iterable, Optional


CONFIG_KEYS = {
    "godot_bin",
    "test_scene",
    "export_preset",
    "export_output",
    "timeout_seconds",
    "fail_on_warning",
    "overwrite_export",
}
DEFAULT_TIMEOUT = 60.0
MAX_TIMEOUT = 3600.0
MAX_OUTPUT = 256 * 1024
STATUS = {"pass", "warning", "fail", "config-error", "tool-error", "timeout"}


def _result(status: str, *, action: str = "", command: Optional[list[str]] = None,
            exit_code: Optional[int] = None, elapsed_ms: int = 0,
            errors: Optional[list[str]] = None, warnings: Optional[list[str]] = None,
            checked_files: Optional[list[str]] = None, **extra: Any) -> dict[str, Any]:
    if status not in STATUS:
        status = "fail"
    value: dict[str, Any] = {
        "status": status,
        "steps": [],
        "command": command or [],
        "exit_code": exit_code,
        "elapsed_ms": elapsed_ms,
        "errors": errors or [],
        "warnings": warnings or [],
        "checked_files": checked_files or [],
    }
    if action:
        value["action"] = action
    value.update(extra)
    return value


def _diagnostics(stdout: str, stderr: str) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    for line in (stdout + "\n" + stderr).splitlines():
        text = line.strip()
        if not text:
            continue
        lower = text.lower()
        if re.search(r"\bwarning\b|\bwarn(?:ing)?[: ]", lower):
            if text not in warnings:
                warnings.append(text)
        if (re.search(r"\berror\b|\bfailed?\b|parse error|cannot open|can't open|invalid|missing|orphan", lower)
                and text not in errors):
            errors.append(text)
    return errors, warnings


def _bounded_reader(stream: Any, holder: list[str]) -> None:
    size = 0
    try:
        while True:
            chunk = stream.read(4096)
            if not chunk:
                break
            if isinstance(chunk, bytes):
                chunk = chunk.decode("utf-8", errors="replace")
            if size < MAX_OUTPUT:
                portion = chunk[: MAX_OUTPUT - size]
                holder.append(portion)
                size += len(portion)
    finally:
        try:
            stream.close()
        except OSError:
            pass


def _terminate_process_group(process: subprocess.Popen[bytes]) -> None:
    if os.name == "nt":
        try:
            process.send_signal(signal.CTRL_BREAK_EVENT)
        except (AttributeError, OSError, ValueError):
            pass
        try:
            process.kill()
        except OSError:
            pass
        return
    try:
        os.killpg(process.pid, signal.SIGTERM)
        try:
            process.wait(timeout=1)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
    except (ProcessLookupError, OSError):
        try:
            process.kill()
        except OSError:
            pass


def _run_process(command: list[str], cwd: Path, timeout: float) -> dict[str, Any]:
    started = time.monotonic()
    kwargs: dict[str, Any] = {
        "cwd": str(cwd),
        "shell": False,
        "stdout": subprocess.PIPE,
        "stderr": subprocess.PIPE,
    }
    if os.name == "nt":
        kwargs["creationflags"] = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
    else:
        kwargs["start_new_session"] = True
    try:
        process = subprocess.Popen(command, **kwargs)
    except (OSError, ValueError) as exc:
        return {
            "exit_code": None, "elapsed_ms": int((time.monotonic() - started) * 1000),
            "stdout": "", "stderr": "", "error": f"process-start: {exc}", "timeout": False,
        }
    stdout_parts: list[str] = []
    stderr_parts: list[str] = []
    readers = [
        threading.Thread(target=_bounded_reader, args=(process.stdout, stdout_parts), daemon=True),
        threading.Thread(target=_bounded_reader, args=(process.stderr, stderr_parts), daemon=True),
    ]
    for reader in readers:
        reader.start()
    timed_out = False
    try:
        process.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        timed_out = True
        _terminate_process_group(process)
    for reader in readers:
        reader.join(timeout=2)
    return {
        "exit_code": None if timed_out else process.returncode,
        "elapsed_ms": int((time.monotonic() - started) * 1000),
        "stdout": "".join(stdout_parts), "stderr": "".join(stderr_parts),
        "error": None, "timeout": timed_out,
    }


def _config_error(action: str, message: str, checked: Optional[list[str]] = None) -> dict[str, Any]:
    return _result("config-error", action=action, exit_code=1, errors=[message], checked_files=checked)


def _load_config(root: Path) -> tuple[dict[str, Any], Optional[dict[str, Any]]]:
    path = root / ".pi" / "local" / "godot.json"
    if not path.exists():
        return {
            "timeout_seconds": DEFAULT_TIMEOUT,
            "fail_on_warning": False,
            "overwrite_export": False,
        }, None
    try:
        with path.open("r", encoding="utf-8") as stream:
            raw = json.load(stream)
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        return {}, {"error": f"malformed-godot-config: {exc}"}
    if not isinstance(raw, dict):
        return {}, {"error": "malformed-godot-config: expected JSON object"}
    unknown = sorted(set(raw) - CONFIG_KEYS)
    if unknown:
        return {}, {"error": "unknown-godot-config-key: " + ", ".join(unknown)}
    validators = {
        "godot_bin": lambda value: isinstance(value, str) and bool(value.strip()),
        "test_scene": lambda value: isinstance(value, str) and bool(value.strip()),
        "export_preset": lambda value: isinstance(value, str) and bool(value.strip()),
        "export_output": lambda value: isinstance(value, str) and bool(value.strip()),
        "timeout_seconds": lambda value: isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and 0 < value <= MAX_TIMEOUT,
        "fail_on_warning": lambda value: isinstance(value, bool),
        "overwrite_export": lambda value: isinstance(value, bool),
    }
    for key, value in raw.items():
        if not validators[key](value):
            return {}, {"error": f"invalid-godot-config-value: {key}"}
    config = {
        "timeout_seconds": DEFAULT_TIMEOUT,
        "fail_on_warning": False,
        "overwrite_export": False,
        **raw,
    }
    return config, None


def _candidate_paths() -> Iterable[str]:
    if os.name == "nt":
        yield "godot4"
        yield "godot"
        for variable in ("PROGRAMFILES", "PROGRAMFILES(X86)"):
            base = os.environ.get(variable)
            if base:
                yield str(Path(base) / "Godot" / "godot.exe")
    else:
        yield "godot4"
        yield "godot"
        yield "/usr/bin/godot4"
        yield "/usr/bin/godot"


def _find_executable(config: dict[str, Any], root: Path) -> tuple[Optional[str], Optional[str]]:
    values: list[str] = []
    if os.environ.get("GODOT_BIN", "").strip():
        values.append(os.environ["GODOT_BIN"].strip())
    configured = config.get("godot_bin")
    if configured:
        values.append(configured)
    values.extend(_candidate_paths())
    for value in values:
        if "\x00" in value or "\n" in value or "\r" in value:
            continue
        if os.path.isabs(value) or os.sep in value or (os.altsep and os.altsep in value):
            candidate = Path(value)
            if not candidate.is_absolute():
                candidate = root / candidate
            if candidate.is_file() and os.access(candidate, os.X_OK):
                return str(candidate), None
        else:
            found = shutil.which(value)
            if found:
                return found, None
    return None, "godot-executable-not-found"


def _parse_godot_version(text: str) -> Optional[str]:
    """Return the major version only for an explicitly Godot-shaped version line."""
    version = r"v?(?P<major>\d+)\.\d+(?:\.\d+)?"
    channel = r"(?:stable|beta|alpha|rc|dev|official)"
    commit = r"[0-9a-f]{7,40}"
    metadata = r"(?:[ \t]+\([^()\r\n]+\))?"
    prefixed = re.compile(
        rf"Godot(?: Engine)?[ \t]+{version}(?:\.{channel}){{0,2}}"
        rf"(?:\.{commit})?{metadata}[ \t]*",
        re.IGNORECASE,
    )
    bare = re.compile(
        rf"[ \t]*{version}(?:\.{channel}){{1,2}}(?:\.{commit})?"
        rf"{metadata}[ \t]*",
        re.IGNORECASE,
    )
    for line in text.splitlines():
        match = prefixed.fullmatch(line) or bare.fullmatch(line)
        if match:
            return match.group("major")
    return None


def _version(executable: str, root: Path, timeout: float) -> tuple[Optional[dict[str, Any]], Optional[str]]:
    command = [executable, "--version"]
    run = _run_process(command, root, timeout)
    if run["timeout"]:
        return run, "process-timeout"
    if run["error"]:
        return run, run["error"]
    if run["exit_code"] != 0:
        return run, "invalid-godot-version"
    text = run["stdout"] + "\n" + run["stderr"]
    major = _parse_godot_version(text)
    if major != "4":
        return run, "invalid-godot-version"
    return run, None


def _resource_path(root: Path, value: str, *, kind: str, require_exists: bool = True,
                   allow_absolute: bool = False) -> tuple[Optional[Path], Optional[str]]:
    if not isinstance(value, str) or "\x00" in value:
        return None, f"{kind}-path-invalid"
    is_absolute = Path(value).is_absolute() or PureWindowsPath(value).is_absolute()
    if value.startswith("res://"):
        relative = value[6:]
        candidate = root.joinpath(*Path(relative).parts)
    elif is_absolute and allow_absolute:
        relative = value
        candidate = Path(value)
    else:
        relative = value
        candidate = root.joinpath(*Path(relative).parts)
    if (not relative or ".." in Path(relative).parts
            or ".." in PureWindowsPath(relative).parts):
        return None, f"{kind}-path-escape"
    if is_absolute and not allow_absolute:
        return None, f"{kind}-path-escape"
    try:
        parts = candidate.relative_to(root).parts
    except ValueError:
        return None, f"{kind}-path-escape"
    try:
        resolved = candidate.resolve(strict=False)
        root_resolved = root.resolve(strict=True)
        resolved.relative_to(root_resolved)
    except (OSError, ValueError):
        return None, f"{kind}-path-escape"
    current = root
    for part in parts:
        current = current / part
        if current.is_symlink():
            return None, f"{kind}-symlink-escape"
    if require_exists and not candidate.is_file():
        return None, f"missing-{kind}"
    return candidate, None


def _project_files(root: Path) -> tuple[Optional[dict[str, Any]], list[str]]:
    project_file = root / "project.godot"
    checked = ["project.godot"]
    if not project_file.is_file() or project_file.is_symlink():
        return None, checked
    try:
        content = project_file.read_text(encoding="utf-8")
    except (OSError, UnicodeError):
        return None, checked
    if not re.search(r"(?m)^\s*\[application\]\s*$", content):
        return None, checked
    main_match = re.search(r"(?m)^\s*run/main_scene\s*=\s*\"([^\"]+)\"", content)
    if not main_match:
        return {"main_scene": None, "errors": ["missing-main-scene"], "content": content}, checked
    main_scene, error = _resource_path(root, main_match.group(1), kind="main-scene")
    if error or main_scene is None or main_scene.suffix.lower() not in {".tscn", ".scn"}:
        return {"main_scene": None, "errors": [error or "invalid-main-scene"], "content": content}, checked
    checked.append(str(main_scene.relative_to(root)).replace(os.sep, "/"))
    errors: list[str] = []
    # Check project-level res:// references, including the main scene.
    refs = re.findall(r"res://[^\s\"']+", content)
    for ref in refs:
        path, ref_error = _resource_path(root, ref, kind="resource")
        if ref_error:
            errors.append(ref_error)
        elif path:
            relative = str(path.relative_to(root)).replace(os.sep, "/")
            if relative not in checked:
                checked.append(relative)
    scenes: list[Path] = []
    try:
        scenes = [
            path for pattern in ("*.tscn", "*.scn")
            for path in root.rglob(pattern)
            if not path.is_symlink()
        ]
    except OSError:
        pass
    for scene in scenes:
        relative = str(scene.relative_to(root)).replace(os.sep, "/")
        if relative not in checked:
            checked.append(relative)
        try:
            scene_content = scene.read_text(encoding="utf-8")
        except (OSError, UnicodeError):
            errors.append(f"invalid-scene: {relative}")
            continue
        for ref in re.findall(r"res://[^\s\"']+", scene_content):
            path, ref_error = _resource_path(root, ref, kind="resource")
            if ref_error:
                errors.append(f"{ref_error}: {ref}")
            elif path:
                ref_relative = str(path.relative_to(root)).replace(os.sep, "/")
                if ref_relative not in checked:
                    checked.append(ref_relative)
    try:
        for script in root.rglob("*.gd"):
            if not script.is_symlink():
                relative = str(script.relative_to(root)).replace(os.sep, "/")
                if relative not in checked:
                    checked.append(relative)
    except OSError:
        pass
    return {"main_scene": main_scene, "errors": errors, "content": content}, checked


def _base(action: str, root: Path, config: dict[str, Any], executable: Optional[str]) -> dict[str, Any]:
    checked: list[str] = []
    if not root.is_dir():
        return _config_error(action, "invalid-project-root")
    try:
        root = root.resolve(strict=True)
    except OSError:
        return _config_error(action, "invalid-project-root")
    project, checked = _project_files(root)
    if project is None:
        return _result("fail", action=action, exit_code=1, errors=["invalid-project-godot"], checked_files=checked)
    if project["errors"]:
        return _result("fail", action=action, exit_code=1, errors=project["errors"], checked_files=checked)
    if executable is None:
        return _result("tool-error", action=action, exit_code=1, errors=["godot-executable-not-found"], checked_files=checked)
    return {"root": root, "config": config, "project": project, "checked": checked, "executable": executable}


def _process_step(action: str, command: list[str], root: Path, config: dict[str, Any], checked: list[str]) -> dict[str, Any]:
    run = _run_process(command, root, float(config["timeout_seconds"]))
    errors, warnings = _diagnostics(run["stdout"], run["stderr"])
    if run["error"]:
        errors.append(run["error"])
    if run["timeout"]:
        errors.append("process-timeout")
        status = "timeout"
        exit_code = 1
    elif run["exit_code"] not in (0, None):
        errors.append(f"{action}-failure")
        status = "fail"
        exit_code = run["exit_code"]
    elif errors:
        status = "fail"
        exit_code = 1
    elif warnings and config.get("fail_on_warning", False):
        errors.append("warning-policy-failure")
        status = "fail"
        exit_code = 1
    elif warnings:
        status = "warning"
        exit_code = 0
    else:
        status = "pass"
        exit_code = 0
    return _result(status, action=action, command=command, exit_code=exit_code,
                   elapsed_ms=run["elapsed_ms"], errors=errors, warnings=warnings,
                   checked_files=checked)


def _quality(base: dict[str, Any]) -> dict[str, Any]:
    action = "quality"
    if "status" in base:
        return base
    root, config, executable = base["root"], base["config"], base["executable"]
    checked = base["checked"]
    commands = [
        [executable, "--headless", "--path", str(root), "--editor", "--quit"],
        [executable, "--headless", "--path", str(root), "--editor", "--check-only", "--quit"],
    ]
    steps = [_process_step("editor-validation", commands[0], root, config, checked),
             _process_step("script-parse", commands[1], root, config, checked)]
    return _aggregate(action, steps)


def _test(base: dict[str, Any]) -> dict[str, Any]:
    action = "test"
    if "status" in base:
        return base
    config = base["config"]
    scene_value = config.get("test_scene")
    if not scene_value:
        return _config_error(action, "missing-test-scene", base["checked"])
    scene, error = _resource_path(base["root"], scene_value, kind="test-scene")
    if error or scene is None:
        return _config_error(action, error or "invalid-test-scene", base["checked"])
    scene_arg = "res://" + str(scene.relative_to(base["root"])).replace(os.sep, "/")
    # Test execution deliberately has no configurable argv.  Keep the scene and
    # quit policy explicit so a project config cannot turn this into a shell or
    # arbitrary command runner.
    command = [
        base["executable"], "--headless", "--path", str(base["root"]),
        "--scene", scene_arg, "--quit-after", str(math.ceil(float(config["timeout_seconds"]))),
    ]
    checked = list(base["checked"])
    relative = str(scene.relative_to(base["root"])).replace(os.sep, "/")
    if relative not in checked:
        checked.append(relative)
    result = _process_step(action, command, base["root"], config, checked)
    if result["status"] == "fail" and not any("test-failure" in error for error in result["errors"]):
        result["errors"].append("test-failure")
    return result


def _godot_string(value: str) -> str:
    """Decode the small quoted-string subset used by Godot config files."""
    escapes = {"n": chr(10), "r": chr(13), "t": chr(9), '"': '"', "\\": "\\"}
    result: list[str] = []
    index = 0
    while index < len(value):
        if value[index] == "\\" and index + 1 < len(value):
            next_value = value[index + 1]
            if next_value in escapes:
                result.append(escapes[next_value])
            else:
                result.extend(("\\", next_value))
            index += 2
        else:
            result.append(value[index])
            index += 1
    return "".join(result)


def _export_preset_names(root: Path) -> set[str]:
    """Read preset names without treating Godot's INI-like syntax as INI."""
    path = root / "export_presets.cfg"
    try:
        content = path.read_text(encoding="utf-8")
    except (OSError, UnicodeError):
        return set()
    names: set[str] = set()
    in_preset = False
    for line in content.splitlines():
        if re.match(r"^\s*\[preset\.\d+\]\s*$", line):
            in_preset = True
            continue
        if re.match(r"^\s*\[.*\]\s*$", line):
            in_preset = False
            continue
        if not in_preset:
            continue
        match = re.match(r'^\s*name\s*=\s*"((?:\\.|[^"\\])*)"\s*(?:#.*)?$', line)
        if match:
            names.add(_godot_string(match.group(1)))
    return names


def _export(base: dict[str, Any]) -> dict[str, Any]:
    action = "export"
    if "status" in base:
        return base
    config = base["config"]
    preset = config.get("export_preset")
    output_value = config.get("export_output")
    if not preset:
        return _config_error(action, "missing-export-preset", base["checked"])
    if not isinstance(preset, str) or not preset.strip() or "\x00" in preset or "\n" in preset:
        return _config_error(action, "invalid-export-preset", base["checked"])
    if preset not in _export_preset_names(base["root"]):
        return _config_error(action, "missing-export-preset", base["checked"])
    if not output_value:
        return _config_error(action, "missing-export-output", base["checked"])
    output, error = _resource_path(base["root"], output_value, kind="export-output",
                                   require_exists=False, allow_absolute=True)
    if error or output is None:
        return _config_error(action, error or "invalid-export-output", base["checked"])
    if output.parent.exists() and not output.parent.is_dir():
        return _config_error(action, "invalid-export-output-parent", base["checked"])
    if output.exists() and (output.is_symlink() or not output.is_file() or not config.get("overwrite_export", False)):
        return _config_error(action, "export-overwrite-rejected", base["checked"])
    try:
        output.resolve(strict=False).parent.relative_to(base["root"].resolve(strict=True))
    except (OSError, ValueError):
        return _config_error(action, "export-output-path-escape", base["checked"])
    command = [base["executable"], "--headless", "--path", str(base["root"]), "--export-release", preset,
               str(output)]
    checked = list(base["checked"])
    relative = str(output.relative_to(base["root"])).replace(os.sep, "/")
    checked.append(relative)
    return _process_step(action, command, base["root"], config, checked)


def _aggregate(action: str, steps: list[dict[str, Any]]) -> dict[str, Any]:
    errors: list[str] = []
    warnings: list[str] = []
    for step in steps:
        for message in step["errors"]:
            if message not in errors:
                errors.append(message)
        for message in step["warnings"]:
            if message not in warnings:
                warnings.append(message)
    checked: list[str] = []
    for step in steps:
        for item in step["checked_files"]:
            if item not in checked:
                checked.append(item)
    failed = next((step for step in steps if step["status"] in {"timeout", "tool-error", "config-error", "fail"}), None)
    status = failed["status"] if failed else ("warning" if any(step["status"] == "warning" for step in steps) else "pass")
    # Gate policy treats warnings as non-fatal unless fail_on_warning changed the step to fail.
    if action == "gate" and status == "warning":
        status = "pass"
    elapsed = sum(step["elapsed_ms"] for step in steps)
    command = steps[0]["command"] if len(steps) == 1 else []
    return _result(status, action=action, command=command, exit_code=0 if not failed else 1,
                   elapsed_ms=elapsed, errors=errors, warnings=warnings, checked_files=checked,
                   steps=steps)


def _gate_failure(status: str, message: str, *, command: Optional[list[str]] = None,
                  elapsed_ms: int = 0) -> dict[str, Any]:
    steps = [_result(status, action=name, command=command, exit_code=1,
                     elapsed_ms=elapsed_ms, errors=[message])
             for name in ("quality", "test", "export")]
    return _aggregate("gate", steps)


def _run_action(action: str, root: Path) -> dict[str, Any]:
    config, config_failure = _load_config(root)
    if config_failure:
        if action == "gate":
            return _gate_failure("config-error", config_failure["error"])
        return _config_error(action, config_failure["error"])
    executable, discovery_error = _find_executable(config, root)
    if discovery_error:
        if action == "gate":
            return _gate_failure("tool-error", discovery_error)
        return _result("tool-error", action=action, exit_code=1, errors=[discovery_error])
    version_run, version_error = _version(executable, root, float(config["timeout_seconds"]))
    if version_error:
        status = "timeout" if version_error == "process-timeout" else "tool-error"
        command = [executable, "--version"]
        if action == "gate":
            return _gate_failure(status, version_error, command=command,
                                 elapsed_ms=version_run["elapsed_ms"] if version_run else 0)
        return _result(status, action=action, command=command, exit_code=1,
                       elapsed_ms=version_run["elapsed_ms"] if version_run else 0,
                       errors=[version_error])
    base = _base(action, root, config, executable)
    if action == "quality":
        return _quality(base)
    if action == "test":
        return _test(base)
    if action == "export":
        return _export(base)
    if action == "gate":
        # Build each step with its own action label so gate diagnostics remain
        # useful even when project validation fails before subprocess execution.
        bases = [_base("quality", root, config, executable),
                 _base("test", root, config, executable),
                 _base("export", root, config, executable)]
        steps = [_quality(bases[0]), _test(bases[1]), _export(bases[2])]
        return _aggregate(action, steps)
    return _config_error(action, "unknown-action")


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Run safe Godot 4 project checks")
    parser.add_argument("action", choices=("quality", "test", "export", "gate"))
    parser.add_argument("project_root", nargs="?", default=".")
    args = parser.parse_args(argv)
    try:
        root = Path(args.project_root).resolve(strict=True)
        payload = _run_action(args.action, root)
    except (OSError, ValueError) as exc:
        payload = _config_error(args.action, f"invalid-project-root: {exc}")
    print(json.dumps(payload, ensure_ascii=False, sort_keys=True))
    return 0 if payload["exit_code"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
