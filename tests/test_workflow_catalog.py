import json
import os
import subprocess
import sys
import textwrap
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PI_NODE_MODULES = Path.home() / "AppData" / "Roaming" / "npm" / "node_modules" / "@earendil-works" / "pi-coding-agent" / "node_modules"
CATALOG = ROOT / "target" / ".pi" / "extensions" / "workflow" / "catalog.ts"
CORE = ROOT / "target" / ".pi" / "extensions" / "workflow" / "core.ts"
WORKFLOW_EXTENSION = ROOT / "target" / ".pi" / "extensions" / "workflow.ts"
ROUTER = ROOT / "target" / ".pi" / "extensions" / "workflow" / "application" / "workflow-command-router.ts"
WORKFLOWS = ROOT / "target" / ".pi" / "workflows"


def test_workflow_template_files_exist():
    templates = sorted(path.stem for path in WORKFLOWS.glob("*.md"))
    assert "test-first" in templates
    assert "quality-gate" in templates


def test_workflow_load_command_restores_persisted_instance():
    workflow = WORKFLOW_EXTENSION.read_text(encoding="utf-8") + ROUTER.read_text(encoding="utf-8")
    core = CORE.read_text(encoding="utf-8")

    # list and load commands must both be handled
    assert 'command === "list"' in workflow
    assert 'command === "load"' in workflow
    assert "loadPersistedWorkflow" in workflow
    assert "state.workflow = persisted" in workflow
    assert 'export * from "./catalog";' in core


def _run_node_catalog(script: str, extra_path_dir: str | None = None) -> dict:
    env = os.environ.copy()
    env["NODE_PATH"] = str(PI_NODE_MODULES)
    if extra_path_dir:
        env["PATH"] = extra_path_dir + os.pathsep + env.get("PATH", "")
    result = subprocess.run(
        ["node", "-e", script],
        cwd=ROOT,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=30,
        encoding="utf-8",
    )
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


def _detect_build_system_script(project: Path) -> str:
    return textwrap.dedent(
        rf'''
        const path = require('path');
        const {{ createJiti }} = require('jiti');
        const jiti = createJiti(path.resolve('runtime-test.js'), {{ interopDefault: false }});
        const {{ detectBuildSystem }} = jiti(path.resolve('target/.pi/extensions/workflow/catalog.ts'));
        const bs = detectBuildSystem({json.dumps(str(project))});
        console.log(JSON.stringify({{ qualityCommand: bs.qualityCommand }}));
        '''
    )


def test_go_quality_command_falls_back_to_go_vet_without_golangci_lint(tmp_path):
    project = tmp_path / "go-only-project"
    project.mkdir()
    (project / "go.mod").write_text("module example.com/goonly\n\ngo 1.21\n", encoding="utf-8")
    data = _run_node_catalog(_detect_build_system_script(project))
    assert data["qualityCommand"] == {"executable": "go", "args": ["vet", "./..."]}


def test_go_quality_command_uses_golangci_lint_when_available(tmp_path):
    project = tmp_path / "go-lint-project"
    project.mkdir()
    (project / "go.mod").write_text("module example.com/golint\n\ngo 1.21\n", encoding="utf-8")
    bin_dir = tmp_path / "fake-bin"
    bin_dir.mkdir()
    if sys.platform == "win32":
        shim = bin_dir / "golangci-lint.cmd"
        shim.write_text("@echo off\r\necho golangci-lint fake version\r\nexit /b 0\r\n", encoding="utf-8")
    else:
        shim = bin_dir / "golangci-lint"
        shim.write_text("#!/bin/sh\necho golangci-lint fake version\nexit 0\n", encoding="utf-8")
        shim.chmod(0o755)
    data = _run_node_catalog(_detect_build_system_script(project), extra_path_dir=str(bin_dir))
    assert data["qualityCommand"] == {"executable": "golangci-lint", "args": ["run", "./..."]}
