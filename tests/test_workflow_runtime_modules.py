import json
import os
import subprocess
import textwrap
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PI_NODE_MODULES = Path.home() / "AppData" / "Roaming" / "npm" / "node_modules" / "@earendil-works" / "pi-coding-agent" / "node_modules"


def _run_node(script: str, tmp_path: Path) -> dict:
    env = os.environ.copy()
    env["NODE_PATH"] = str(PI_NODE_MODULES)
    env["PI_CODING_AGENT_DIR"] = str(tmp_path / ".pi-agent")
    env["HARNESS_FIELD_LOG_ROOT"] = str(tmp_path / "field-log-root")
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


def test_runtime_policy_filters_builtin_tools_but_preserves_extension_tools(tmp_path):
    script = textwrap.dedent(
        rf'''
        const path = require('path');
        const {{ createJiti }} = require('jiti');
        const jiti = createJiti(path.resolve('runtime-test.js'), {{ interopDefault: false }});
        const mod = jiti({json.dumps(str(ROOT / "target" / ".pi" / "extensions" / "workflow" / "runtime-policy.ts"))});

        const calls = [];
        const host = {{
          getAllTools() {{
            return [
              {{ name: 'read', sourceInfo: {{ source: 'builtin' }} }},
              {{ name: 'write', sourceInfo: {{ source: 'builtin' }} }},
              {{ name: 'edit', sourceInfo: {{ source: 'builtin' }} }},
              {{ name: 'bash', sourceInfo: {{ source: 'builtin' }} }},
              {{ name: 'workflow_approve', sourceInfo: {{ source: 'extension' }} }},
              {{ name: 'sdk_tool', sourceInfo: {{ source: 'sdk' }} }},
            ];
          }},
          setActiveTools(names) {{ calls.push(names); }},
        }};

        mod.applyPhaseToolPolicyForHost(host, 'plan_review');
        mod.applyPhaseToolPolicyForHost(host, null);
        console.log(JSON.stringify({{ planReview: calls[0], noPhase: calls[1] }}));
        '''
    )
    data = _run_node(script, tmp_path)

    assert "read" in data["planReview"]
    assert "bash" in data["planReview"]
    assert "workflow_approve" in data["planReview"]
    assert "write" not in data["planReview"]
    assert "edit" not in data["planReview"]
    assert data["noPhase"] == ["read", "write", "edit", "bash", "workflow_approve", "sdk_tool"]


def test_runtime_policy_requires_approval_only_for_mutating_runtime_extension_paths(tmp_path):
    script = textwrap.dedent(
        rf'''
        const path = require('path');
        const {{ createJiti }} = require('jiti');
        const jiti = createJiti(path.resolve('runtime-test.js'), {{ interopDefault: false }});
        const mod = jiti({json.dumps(str(ROOT / "target" / ".pi" / "extensions" / "workflow" / "runtime-policy.ts"))});

        const cases = {{
          readRuntime: mod.requiresExtensionMutationApproval('bash', {{ command: 'rg foo .pi/extensions/workflow.ts' }}),
          teeRuntime: mod.requiresExtensionMutationApproval('bash', {{ command: 'echo x | tee .pi/extensions/workflow.ts' }}),
          editRuntime: mod.requiresExtensionMutationApproval('edit', {{ path: '.pi/extensions/workflow.ts' }}),
          writeTargetTemplate: mod.requiresExtensionMutationApproval('write', {{ path: 'target/.pi/extensions/workflow.ts' }}),
          redirectTargetTemplate: mod.requiresExtensionMutationApproval('bash', {{ command: 'echo x > target/.pi/extensions/workflow.ts' }}),
          nestedRuntime: mod.requiresExtensionMutationApproval('bash', {{ command: 'printf x > ./nested/.pi/extensions/memory.ts' }}),
        }};
        console.log(JSON.stringify(cases));
        '''
    )
    data = _run_node(script, tmp_path)

    assert data["readRuntime"] is False
    assert data["teeRuntime"] is True
    assert data["editRuntime"] is True
    assert data["writeTargetTemplate"] is False
    assert data["redirectTargetTemplate"] is False
    assert data["nestedRuntime"] is True


def test_epic_pev_task_queue_allows_one_active_task_and_writes_artifact(tmp_path):
    script = textwrap.dedent(
        rf'''
        const fs = require('fs');
        const path = require('path');
        const {{ createJiti }} = require('jiti');
        const jiti = createJiti(path.resolve('runtime-test.js'), {{ interopDefault: false }});
        const mod = jiti({json.dumps(str(ROOT / "target" / ".pi" / "extensions" / "workflow" / "task-queue.ts"))});

        const queue = mod.createWorkflowTaskQueue({{
          title: 'Epic queue',
          tasks: [
            {{ id: 'task-1', title: 'First task', scope: 'Implement first slice', acceptanceCriteria: ['first accepted'], verification: ['first verified'] }},
            {{ id: 'task-2', title: 'Second task', scope: 'Implement second slice', acceptanceCriteria: ['second accepted'], verification: ['second verified'] }},
          ],
        }});
        const firstActive = mod.activateWorkflowTask(queue, 'task-1');
        const secondActive = mod.activateWorkflowTask(firstActive, 'task-2');
        const summary = mod.formatWorkflowTaskQueueSummary(secondActive);
        const done = mod.markWorkflowTask(secondActive, 'task-2', 'done', 'verified');
        const artifact = mod.writeWorkflowTaskQueueArtifact({{
          id: 'wf-test',
          taskQueue: done,
        }}, {json.dumps(str(tmp_path))});
        const longText = 'x'.repeat(260);
        const longQueue = mod.activateWorkflowTask(mod.createWorkflowTaskQueue({{
          title: `Long queue ${{longText}}`,
          tasks: [{{
            id: `long-task-${{longText}}`,
            title: `Long task ${{longText}}`,
            scope: `Long scope ${{longText}}`,
            acceptanceCriteria: [`Long acceptance ${{longText}}`],
            verification: [`Long verification ${{longText}}`],
          }}],
        }}), `long-task-${{longText}}`);
        const longSummary = mod.formatWorkflowTaskQueueSummary(longQueue);

        console.log(JSON.stringify({{
          activeCount: secondActive.tasks.filter((task) => task.status === 'active').length,
          firstStatusAfterSecondActivation: secondActive.tasks.find((task) => task.id === 'task-1').status,
          doneStatus: done.tasks.find((task) => task.id === 'task-2').status,
          artifactExists: fs.existsSync(artifact.path),
          artifactWorkflowId: JSON.parse(fs.readFileSync(artifact.path, 'utf-8')).workflowId,
          summary,
          longSummary,
          longSummaryMaxLineLength: Math.max(...longSummary.split('\n').map((line) => line.length)),
        }}));
        '''
    )
    data = _run_node(script, tmp_path)

    assert data["activeCount"] == 1
    assert data["firstStatusAfterSecondActivation"] == "pending"
    assert data["doneStatus"] == "done"
    assert data["artifactExists"] is True
    assert data["artifactWorkflowId"] == "wf-test"
    assert "Epic queue" in data["summary"]
    assert "Second task" in data["summary"]
    assert "Implement second slice" in data["summary"]
    assert "second accepted" in data["summary"]
    assert "second verified" in data["summary"]
    assert data["longSummaryMaxLineLength"] <= 170
    assert "…" in data["longSummary"]


def test_workflow_ledger_writes_compact_run_state_without_raw_transcript(tmp_path):
    script = textwrap.dedent(
        rf'''
        const fs = require('fs');
        const path = require('path');
        const {{ createJiti }} = require('jiti');
        const jiti = createJiti(path.resolve('runtime-test.js'), {{ interopDefault: false }});
        const mod = jiti({json.dumps(str(ROOT / "target" / ".pi" / "extensions" / "workflow" / "ledger.ts"))});

        const workflow = {{
          id: 'wf-ledger-test',
          title: 'Ledger test workflow',
          phase: 'implement',
          cwd: 'I:/company-harness',
          gitRoot: 'I:/company-harness',
          branch: 'main',
          history: [{{ from: 'plan', to: 'plan_review', reason: 'planned', timestamp: 1 }}],
          undone: [],
          startedAt: 1,
          updatedAt: 2,
          taskQueue: {{
            id: 'queue-1',
            title: 'Ledger queue',
            activeTaskId: 'task-1',
            createdAt: 1,
            updatedAt: 2,
            tasks: [
              {{ id: 'task-1', title: 'Active task', scope: 'Do work', acceptanceCriteria: ['accepted'], verification: ['verified'], status: 'active', dependencies: [], createdAt: 1, updatedAt: 2 }},
              {{ id: 'task-2', title: 'Done task', scope: 'Done work', acceptanceCriteria: [], verification: [], status: 'done', dependencies: [], createdAt: 1, updatedAt: 2 }},
            ],
          }},
        }};
        const root = {json.dumps(str(tmp_path))};
        fs.mkdirSync(root, {{ recursive: true }});
        require('child_process').execFileSync('git', ['init'], {{ cwd: root, stdio: 'ignore' }});
        require('child_process').execFileSync('git', ['config', 'user.email', 'test@example.com'], {{ cwd: root }});
        require('child_process').execFileSync('git', ['config', 'user.name', 'Test User'], {{ cwd: root }});
        fs.writeFileSync(path.join(root, 'tracked.txt'), 'before\n', 'utf8');
        require('child_process').execFileSync('git', ['add', 'tracked.txt'], {{ cwd: root }});
        require('child_process').execFileSync('git', ['commit', '-m', 'initial'], {{ cwd: root, stdio: 'ignore' }});
        fs.writeFileSync(path.join(root, 'tracked.txt'), 'after\n', 'utf8');
        fs.writeFileSync(path.join(root, 'untracked.txt'), 'new\n', 'utf8');
        fs.mkdirSync(path.join(root, '.ai', 'interview', 'runs', 'previous'), {{ recursive: true }});
        fs.writeFileSync(path.join(root, '.ai', 'interview', 'runs', 'previous', 'ledger.json'), '{{}}\n', 'utf8');
        workflow.gitRoot = root;
        const descriptor = mod.writeWorkflowLedgerSnapshot(workflow, root, {{
          verification: {{ commandId: 'project-test', ok: true, exitCode: 0, artifactPath: '.ai/workflow-artifacts/test.txt' }},
          review: {{ critical: 0, major: 0, minor: 1, reviewedFiles: ['target/.pi/extensions/workflow/ledger.ts'] }},
        }});
        const ledger = JSON.parse(fs.readFileSync(descriptor.path, 'utf8'));
        const serialized = JSON.stringify(ledger);
        console.log(JSON.stringify({{
          path: descriptor.path.replace(/\\\\/g, '/'),
          exists: fs.existsSync(descriptor.path),
          workflowId: ledger.workflowId,
          phase: ledger.phase.current,
          nextSafeAction: ledger.nextSafeAction.summary,
          taskCounts: ledger.planCoverage.taskCounts,
          changedFileCount: ledger.diffCoverage.changedFileCount,
          changedFiles: ledger.diffCoverage.changedFiles,
          verification: ledger.verification.lastCommand,
          review: ledger.review.summary,
          hasRawPrompt: serialized.includes('rawPrompt') || serialized.includes('transcript') || serialized.includes('stdout') || serialized.includes('stderr'),
        }}));
        '''
    )
    data = _run_node(script, tmp_path)

    assert data["exists"] is True
    assert data["path"].replace("\\", "/").endswith(".ai/interview/runs/wf-ledger-test/ledger.json")
    assert data["workflowId"] == "wf-ledger-test"
    assert data["phase"] == "implement"
    assert "implement" in data["nextSafeAction"]
    assert data["taskCounts"]["active"] == 1
    assert data["taskCounts"]["done"] == 1
    assert data["changedFileCount"] == 2
    assert ".ai/" not in data["changedFiles"]
    assert data["verification"]["commandId"] == "project-test"
    assert data["review"]["critical"] == 0
    assert data["hasRawPrompt"] is False


def test_field_log_actionable_hint_ignores_optional_corenlp_noise(tmp_path):
    script = textwrap.dedent(
        rf'''
        const fs = require('fs');
        const path = require('path');
        const {{ createJiti }} = require('jiti');
        const jiti = createJiti(path.resolve('runtime-test.js'), {{ interopDefault: false }});
        const mod = jiti({json.dumps(str(ROOT / "target" / ".pi" / "extensions" / "workflow" / "field-log.ts"))});

        const root = process.env.HARNESS_FIELD_LOG_ROOT;
        const logDir = path.join(root, '.project-memory', 'harness');
        fs.mkdirSync(logDir, {{ recursive: true }});
        const events = [
          {{
            timestamp: '2026-06-12T00:00:00.000Z',
            event: {{ category: 'update', type: 'update.failed', severity: 'warning', status: 'open', summary: 'CoreNLP startup failed' }},
            failure: {{ summary: 'CoreNLP startup failed', actual: 'dockerDesktopLinuxEngine unavailable; optional environment follow-up' }},
          }},
          {{
            timestamp: '2026-06-12T00:01:00.000Z',
            event: {{ category: 'dpaa', type: 'gate.failed', severity: 'warning', status: 'open' }},
            failure: {{ summary: 'Failed to read DPAA report: ENOENT' }},
          }},
        ];
        fs.writeFileSync(path.join(logDir, 'events.jsonl'), events.map((event) => JSON.stringify(event)).join('\n') + '\n', 'utf8');
        console.log(JSON.stringify({{ hint: mod.formatLatestActionableFailureHint() }}));
        '''
    )
    data = _run_node(script, tmp_path)

    assert "last actionable failure" in data["hint"]
    assert "dpaa" in data["hint"]
    assert "Failed to read DPAA report" in data["hint"]
    assert "CoreNLP" not in data["hint"]


def test_field_log_actionable_hint_suppresses_resolved_gate_categories(tmp_path):
    script = textwrap.dedent(
        rf'''
        const fs = require('fs');
        const path = require('path');
        const {{ createJiti }} = require('jiti');
        const jiti = createJiti(path.resolve('runtime-test.js'), {{ interopDefault: false }});
        const mod = jiti({json.dumps(str(ROOT / "target" / ".pi" / "extensions" / "workflow" / "field-log.ts"))});

        const root = process.env.HARNESS_FIELD_LOG_ROOT;
        const logDir = path.join(root, '.project-memory', 'harness');
        fs.mkdirSync(logDir, {{ recursive: true }});
        const event = {{
          timestamp: '2026-06-12T00:01:00.000Z',
          event: {{ category: 'dpaa', type: 'gate.failed', severity: 'warning', status: 'open' }},
          failure: {{ summary: 'Failed to read DPAA report: ENOENT' }},
        }};
        fs.writeFileSync(path.join(logDir, 'events.jsonl'), JSON.stringify(event) + '\n', 'utf8');
        console.log(JSON.stringify({{
          stale: mod.formatLatestActionableFailureHint(20, {{ activeGateFailures: [] }}),
          active: mod.formatLatestActionableFailureHint(20, {{ activeGateFailures: ['dpaa'] }}),
        }}));
        '''
    )
    data = _run_node(script, tmp_path)

    assert data["stale"] == ""
    assert "last actionable failure" in data["active"]
    assert "dpaa" in data["active"]


def test_field_log_actionable_hint_handles_interview_ambiguity_gate_category(tmp_path):
    script = textwrap.dedent(
        rf'''
        const fs = require('fs');
        const path = require('path');
        const {{ createJiti }} = require('jiti');
        const jiti = createJiti(path.resolve('runtime-test.js'), {{ interopDefault: false }});
        const mod = jiti({json.dumps(str(ROOT / "target" / ".pi" / "extensions" / "workflow" / "field-log.ts"))});

        const root = process.env.HARNESS_FIELD_LOG_ROOT;
        const logDir = path.join(root, '.project-memory', 'harness');
        fs.mkdirSync(logDir, {{ recursive: true }});
        const event = {{
          timestamp: '2026-06-12T00:01:00.000Z',
          event: {{ category: 'interview-ambiguity', type: 'gate.failed', severity: 'blocker', status: 'open' }},
          failure: {{ summary: 'Interview ambiguity score missing before interview → plan transition.' }},
        }};
        fs.writeFileSync(path.join(logDir, 'events.jsonl'), JSON.stringify(event) + '\n', 'utf8');
        console.log(JSON.stringify({{
          stale: mod.formatLatestActionableFailureHint(20, {{ activeGateFailures: [] }}),
          active: mod.formatLatestActionableFailureHint(20, {{ activeGateFailures: ['interview-ambiguity'] }}),
        }}));
        '''
    )
    data = _run_node(script, tmp_path)

    assert data["stale"] == ""
    assert "last actionable failure" in data["active"]
    assert "interview-ambiguity" in data["active"]
    assert "Interview ambiguity score missing" in data["active"]


def test_write_dpaa_receipt_includes_report_descriptor(tmp_path):
    plan = tmp_path / "plan.md"
    report = tmp_path / "dpaa-report.json"
    plan.write_text("# Plan\n", encoding="utf-8")
    report.write_text('{"level":"PASS","findings":[]}\n', encoding="utf-8")

    script = textwrap.dedent(
        rf'''
        const path = require('path');
        const {{ createJiti }} = require('jiti');
        const jiti = createJiti(path.resolve('runtime-test.js'), {{ interopDefault: false }});
        const mod = jiti({json.dumps(str(ROOT / "target" / ".pi" / "extensions" / "workflow" / "artifacts.ts"))});

        const workflow = {{
          id: 'wf-dpaa-descriptor',
          title: 'DPAA descriptor test',
          phase: 'plan_review',
          cwd: process.cwd(),
          gitRoot: process.cwd(),
          branch: 'main',
          createdAt: '2026-06-12T00:00:00.000Z',
          updatedAt: '2026-06-12T00:00:00.000Z',
          history: [],
        }};
        const receipt = mod.writeDpaaReceipt({{
          workflow,
          from: 'plan_review',
          to: 'implement',
          planPath: {json.dumps(str(plan))},
          reportPath: {json.dumps(str(report))},
          report: {{ level: 'PASS', overall: 0, findings: [] }},
          exitCode: 0,
        }});
        console.log(JSON.stringify({{
          kind: receipt.reportDescriptor.kind,
          path: receipt.reportDescriptor.path,
          component: receipt.reportDescriptor.producer.component,
          retention: receipt.reportDescriptor.retention,
          sizeBytes: receipt.reportDescriptor.sizeBytes,
          sha256: receipt.reportDescriptor.sha256,
          reportSha256: receipt.reportSha256,
          summary: receipt.reportDescriptor.summary,
        }}));
        '''
    )
    data = _run_node(script, tmp_path)

    assert data["kind"] == "dpaa-report"
    assert Path(data["path"]).resolve() == report.resolve()
    assert data["component"] == "dpaa"
    assert data["retention"] == "until-completion"
    assert data["sizeBytes"] == report.stat().st_size
    assert data["sha256"] == data["reportSha256"]
    assert data["summary"] == "DPAA PASS: 0 finding(s), penalty=0."



def test_runtime_state_does_not_restore_persisted_guard_tokens_as_authority(tmp_path):
    script = textwrap.dedent(
        rf'''
        const path = require('path');
        const {{ createJiti }} = require('jiti');
        const jiti = createJiti(path.resolve('runtime-test.js'), {{ interopDefault: false }});
        const mod = jiti({json.dumps(str(ROOT / "target" / ".pi" / "extensions" / "workflow" / "runtime-state.ts"))});

        const state = mod.createWorkflowRuntimeState();
        state.workflow = {{
          id: 'wf-current',
          title: 'Coverage runtime state',
          phase: 'push',
          cwd: process.cwd(),
          gitRoot: process.cwd(),
          createdAt: '2026-06-05T00:00:00.000Z',
          updatedAt: '2026-06-05T00:00:00.000Z',
          history: [],
          guardTokens: {{
            dpaa: {{ workflowId: 'wf-current', issuedAt: 10, reason: 'fallback-dpaa' }},
            codeQuality: {{ workflowId: 'wf-current', issuedAt: 11, reason: 'fallback-quality' }},
            codeReview: {{ workflowId: 'wf-current', timestamp: 12, critical: 0, major: 1, minor: 2 }},
            pushExecution: {{ workflowId: 'wf-current', issuedAt: 13, reason: 'fallback-push' }},
          }},
        }};

        console.log(JSON.stringify({{
          hasRestoreExport: typeof mod.restoreGuardTokensToRuntimeState === 'function',
          dpaa: state.dpaaGuardSatisfiedToken,
          codeQuality: state.codeQualityGuardSatisfiedToken,
          codeReview: state.codeReviewGuardSatisfiedToken,
          push: state.pushExecutionGuardSatisfiedToken,
          reviewPackage: state.reviewPackageToken,
        }}));
        '''
    )
    data = _run_node(script, tmp_path)

    assert data["hasRestoreExport"] is False
    assert data["dpaa"] is None
    assert data["codeQuality"] is None
    assert data["codeReview"] is None
    assert data["push"] is None
    assert data["reviewPackage"] is None
