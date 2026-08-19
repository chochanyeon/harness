import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
ENTRY_NAMES = ["workflow-cli", "workflow-gate", "memory-cli", "memory-context"]


def _esbuild_installed() -> bool:
    return (ROOT / "node_modules" / ".bin" / ("esbuild.cmd" if os.name == "nt" else "esbuild")).exists()


@pytest.mark.skipif(not _esbuild_installed(), reason="esbuild not installed; run `npm install` first")
def test_build_script_produces_one_bundle_per_source_entry(tmp_path):
    out_dir = tmp_path / "out"
    env = {**os.environ, "CLAUDE_ADAPTER_OUT_DIR": str(out_dir)}
    result = subprocess.run(
        ["node", "scripts/build-claude-adapter.mjs"],
        cwd=ROOT,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        timeout=60,
    )
    assert result.returncode == 0, result.stderr
    for name in ENTRY_NAMES:
        bundle = out_dir / f"{name}.cjs"
        assert bundle.exists(), f"missing bundle: {name}.cjs"
        assert bundle.read_text(encoding="utf-8").startswith("#!/usr/bin/env node")


@pytest.mark.skipif(not _esbuild_installed(), reason="esbuild not installed; run `npm install` first")
def test_committed_claude_adapter_bundles_are_up_to_date(tmp_path):
    committed_dir = ROOT / "target" / ".claude" / "hooks"
    for name in ENTRY_NAMES:
        assert (committed_dir / f"{name}.cjs").exists(), (
            f"{name}.cjs is not committed yet — this test guards against drift "
            "once it exists, it is expected to fail until Task 4-6 commit the bundles."
        )

    fresh_dir = tmp_path / "fresh"
    env = {**os.environ, "CLAUDE_ADAPTER_OUT_DIR": str(fresh_dir)}
    result = subprocess.run(
        ["node", "scripts/build-claude-adapter.mjs"],
        cwd=ROOT,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        timeout=60,
    )
    assert result.returncode == 0, result.stderr

    for name in ENTRY_NAMES:
        committed = (committed_dir / f"{name}.cjs").read_bytes()
        fresh = (fresh_dir / f"{name}.cjs").read_bytes()
        assert committed == fresh, (
            f"{name}.cjs is stale — run `node scripts/build-claude-adapter.mjs` "
            "and commit the regenerated file"
        )
