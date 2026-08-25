"""Focused regression tests for the shared execution-profile contract."""

import json
import os
import subprocess
import textwrap
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PI_NODE_MODULES = Path.home() / "AppData" / "Roaming" / "npm" / "node_modules" / "@earendil-works" / "pi-coding-agent" / "node_modules"
PROFILE_POLICY = ROOT / "target" / ".pi" / "extensions" / "workflow" / "domain" / "execution-profile-policy.ts"
POLICY_CORE = ROOT / "target" / ".pi" / "extensions" / "workflow" / "policy-core.ts"
STATE = ROOT / "target" / ".pi" / "extensions" / "workflow" / "state.ts"


def _run_node(script: str, agent_dir: Path | None = None) -> dict:
    env = {**os.environ, "NODE_PATH": str(PI_NODE_MODULES)}
    if agent_dir is not None:
        env["PI_CODING_AGENT_DIR"] = str(agent_dir)
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


def test_execution_profile_contract_defaults_new_workflows_to_adaptive_and_legacy_to_strict():
    script = textwrap.dedent(
        """
        const path = require('path');
        const { createJiti } = require('jiti');
        const jiti = createJiti(path.resolve('execution-profile-test.js'), { interopDefault: false });
        const profile = jiti(path.resolve('target/.pi/extensions/workflow/domain/execution-profile-policy.ts'));
        const policy = jiti(path.resolve('target/.pi/extensions/workflow/policy-core.ts'));
        const state = jiti(path.resolve('target/.pi/extensions/workflow/state.ts'));
        console.log(JSON.stringify({
          configuredDefault: policy.sharedDefaultExecutionProfile(),
          newWorkflow: state.createWorkflow('profile contract').executionProfile,
          legacy: profile.resolveExecutionProfile({}),
          explicitFast: profile.resolveExecutionProfile({ executionProfile: 'fast' }),
        }));
        """
    )

    assert _run_node(script) == {
        "configuredDefault": "adaptive",
        "newWorkflow": "adaptive",
        "legacy": "strict",
        "explicitFast": "fast",
    }


def test_execution_profile_escalation_is_monotonic_and_records_a_reason():
    script = textwrap.dedent(
        """
        const path = require('path');
        const { createJiti } = require('jiti');
        const jiti = createJiti(path.resolve('execution-profile-test.js'), { interopDefault: false });
        const profile = jiti(path.resolve('target/.pi/extensions/workflow/domain/execution-profile-policy.ts'));
        const workflow = { executionProfile: 'adaptive' };
        const first = profile.escalateExecutionProfile(workflow, 'Sensitive deployment path changed', 1234);
        const second = profile.escalateExecutionProfile(workflow, 'Ignored later reason', 5678);
        let emptyReasonError = false;
        try { profile.escalateExecutionProfile({ executionProfile: 'fast' }, '   '); } catch { emptyReasonError = true; }
        console.log(JSON.stringify({ first, second, workflow, emptyReasonError }));
        """
    )

    assert _run_node(script) == {
        "first": True,
        "second": False,
        "workflow": {
            "executionProfile": "strict",
            "executionProfileEscalation": {
                "from": "adaptive",
                "to": "strict",
                "reason": "Sensitive deployment path changed",
                "timestamp": 1234,
            },
        },
        "emptyReasonError": True,
    }


def test_workflow_state_persists_adaptive_for_new_and_strict_for_legacy():
    state = STATE.read_text(encoding="utf-8")
    assert "executionProfile: sharedDefaultExecutionProfile()" in state
    assert "workflow.executionProfile = resolveExecutionProfile(workflow)" in state
    assert PROFILE_POLICY.exists()
    assert "executionProfiles" in POLICY_CORE.read_text(encoding="utf-8")


def test_profile_aware_tool_policy_relaxes_nonterminal_adaptive_phases_only():
    script = textwrap.dedent(
        """
        const path = require('path');
        const { createJiti } = require('jiti');
        const jiti = createJiti(path.resolve('execution-profile-test.js'), { interopDefault: false });
        const policy = jiti(path.resolve('target/.pi/extensions/workflow/policy-core.ts'));
        console.log(JSON.stringify({
          strictReview: policy.getPhaseAllowedTools('code_review', [], 'strict'),
          adaptiveReview: policy.getPhaseAllowedTools('code_review', [], 'adaptive'),
          fastCommit: policy.getPhaseAllowedTools('commit', [], 'fast'),
          adaptiveDone: policy.getPhaseAllowedTools('done', [], 'adaptive'),
        }));
        """
    )

    result = _run_node(script)
    assert "edit" not in result["strictReview"]
    assert "write" in result["adaptiveReview"]
    assert "edit" in result["fastCommit"]
    assert result["adaptiveDone"] == ["read"]


def test_sensitive_path_classifier_escalates_and_failure_threshold_is_configured():
    script = textwrap.dedent(
        """
        const path = require('path');
        const { createJiti } = require('jiti');
        const jiti = createJiti(path.resolve('execution-profile-test.js'), { interopDefault: false });
        const profile = jiti(path.resolve('target/.pi/extensions/workflow/domain/execution-profile-policy.ts'));
        const policy = jiti(path.resolve('target/.pi/extensions/workflow/policy-core.ts'));
        const workflow = { executionProfile: 'fast' };
        const reason = profile.sensitiveChangeReasonForPath('.github/workflows/release.yml');
        const escalated = profile.escalateExecutionProfile(workflow, reason, 4321);
        console.log(JSON.stringify({ reason, escalated, workflow, threshold: policy.sharedVerificationFailureEscalationThreshold() }));
        """
    )

    result = _run_node(script)
    assert "CI" in result["reason"]
    assert result["escalated"] is True
    assert result["workflow"]["executionProfile"] == "strict"
    assert result["threshold"] == 2


def test_only_failed_verification_commands_increment_escalation_counter():
    script = textwrap.dedent(
        """
        const path = require('path');
        const { createJiti } = require('jiti');
        const jiti = createJiti(path.resolve('execution-profile-test.js'), { interopDefault: false });
        const gate = jiti(path.resolve('target/.pi/extensions/workflow/application/tool-call-gate.ts'));
        const state = {
          workflow: { id: 'wf-profile-test', executionProfile: 'adaptive' },
          recentVerificationCommands: [],
        };
        gate.handleWorkflowToolResult(state, { toolName: 'bash', input: { command: 'false' }, isError: true });
        gate.handleWorkflowToolResult(state, { toolName: 'bash', input: { command: 'python -m pytest tests/unit.py' }, isError: true });
        console.log(JSON.stringify({ failures: state.workflow.verificationFailureCount ?? 0, profile: state.workflow.executionProfile }));
        """
    )

    assert _run_node(script) == {"failures": 1, "profile": "adaptive"}


def test_failed_verification_count_persists_before_strict_escalation(tmp_path):
    script = textwrap.dedent(
        """
        const path = require('path');
        const { createJiti } = require('jiti');
        const jiti = createJiti(path.resolve('execution-profile-test.js'), { interopDefault: false });
        const gate = jiti(path.resolve('target/.pi/extensions/workflow/application/tool-call-gate.ts'));
        const state = jiti(path.resolve('target/.pi/extensions/workflow/state.ts'));
        const workflow = state.createWorkflow('persist verification failures');
        state.saveWorkflow(workflow);
        const runtime = { workflow, recentVerificationCommands: [] };
        gate.handleWorkflowToolResult(runtime, {
          toolName: 'bash', input: { command: 'python -m pytest tests/unit.py' }, isError: true,
        });
        const restored = state.loadPersistedWorkflow();
        console.log(JSON.stringify({
          count: restored?.verificationFailureCount,
          profile: restored?.executionProfile,
        }));
        """
    )

    assert _run_node(script, tmp_path / "pi-agent") == {"count": 1, "profile": "adaptive"}


def test_status_and_prompt_expose_strict_escalation_reason():
    script = textwrap.dedent(
        """
        const path = require('path');
        const { createJiti } = require('jiti');
        const jiti = createJiti(path.resolve('execution-profile-test.js'), { interopDefault: false });
        const format = jiti(path.resolve('target/.pi/extensions/workflow/format.ts'));
        const workflow = {
          id: 'wf-profile-status', title: 'profile status', phase: 'implement',
          cwd: process.cwd(), gitRoot: process.cwd(), branch: 'main', history: [], undone: [],
          startedAt: 1, updatedAt: 1, executionProfile: 'strict',
          executionProfileEscalation: {
            from: 'adaptive', to: 'strict', reason: 'CI workflow path changed', timestamp: 1234,
          },
        };
        console.log(JSON.stringify({
          status: format.formatWorkflowStatus(workflow),
          prompt: format.formatWorkflowPrompt(workflow),
        }));
        """
    )

    result = _run_node(script)
    assert "strict" in result["status"]
    assert "CI workflow path changed" in result["status"]
    assert "strict" in result["prompt"]
    assert "CI workflow path changed" in result["prompt"]


def test_adaptive_code_review_records_tdd_evidence_from_a_test_edit():
    script = textwrap.dedent(
        """
        const path = require('path');
        const { createJiti } = require('jiti');
        const jiti = createJiti(path.resolve('execution-profile-test.js'), { interopDefault: false });
        const gate = jiti(path.resolve('target/.pi/extensions/workflow/application/tool-call-gate.ts'));
        const state = {
          workflow: { id: 'wf-tdd-evidence', phase: 'code_review', executionProfile: 'adaptive', gitRoot: process.cwd() },
          recentVerificationCommands: [],
        };
        gate.handleWorkflowToolResult(state, {
          toolName: 'write',
          input: { path: 'src/test/java/example/WidgetServiceTest.java' },
        });
        console.log(JSON.stringify(state.tddTestEvidence));
        """
    )

    result = _run_node(script)
    assert result["workflowId"] == "wf-tdd-evidence"
    assert result["productionKeys"] == ["src/main/java/example/WidgetService.java"]
    assert isinstance(result["updatedAt"], int)
