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
