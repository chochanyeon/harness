"""Regression checks for shared catalog and quality-gate npm resolution."""
import json
import textwrap

import pytest

from .test_workflow_catalog import _run_node_catalog


@pytest.mark.parametrize("platform,cli_exists", [("win32", True), ("win32", False), ("linux", True)])
def test_npm_scripts_share_shell_free_resolution(tmp_path, platform, cli_exists):
    project = tmp_path / "npm project with spaces"
    project.mkdir()
    (project / "package.json").write_text(json.dumps({"scripts": {
        "test": "node test.cjs", "build": "node build.cjs", "lint": "node lint.cjs",
    }}), encoding="utf-8")
    script = textwrap.dedent(rf'''
        const path = require('path');
        const fs = require('fs');
        const {{ createJiti }} = require('jiti');
        const jiti = createJiti(path.resolve('npm-resolution-test.js'), {{ interopDefault: false }});
        const {{ detectBuildSystem }} = jiti(path.resolve('target/.pi/extensions/workflow/catalog.ts'));
        const originalPlatform = process.platform;
        const originalExists = fs.existsSync;
        const cli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
        try {{
            Object.defineProperty(process, 'platform', {{ value: {json.dumps(platform)}, configurable: true }});
            fs.existsSync = file => String(file) === cli ? {str(cli_exists).lower()} : originalExists(file);
            const bs = detectBuildSystem({json.dumps(str(project))});
            console.log(JSON.stringify({{ bs, node: process.execPath, cli }}));
        }} finally {{
            fs.existsSync = originalExists;
            Object.defineProperty(process, 'platform', {{ value: originalPlatform, configurable: true }});
        }}
    ''')
    data = _run_node_catalog(script)
    use_cli = platform == "win32" and cli_exists
    for field, name in [("testCommand", "test"), ("buildCommand", "build"), ("qualityCommand", "lint")]:
        assert data["bs"][field] == {
            "executable": data["node"] if use_cli else "npm",
            "args": ([data["cli"]] if use_cli else []) + ["run", name],
        }
    assert data["bs"]["type"] == "npm"
