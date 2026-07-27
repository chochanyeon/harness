import json
import os
import re
import subprocess
import textwrap
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PI_NODE_MODULES = Path.home() / "AppData" / "Roaming" / "npm" / "node_modules" / "@earendil-works" / "pi-coding-agent" / "node_modules"
SCHEMA = ROOT / "target" / ".pi" / "schemas" / "harness-memory-entry.schema.json"
MEMORY_EXTENSION = ROOT / "target" / ".pi" / "extensions" / "memory.ts"


def _extract_memory_block(notification_text: str, memory_id: str) -> str:
    marker = f"- {memory_id} |"
    start = notification_text.index(marker)
    rest = notification_text[start:]
    next_marker_pos = rest.find("\n- mem_", 1)
    return rest if next_marker_pos == -1 else rest[:next_marker_pos]


def _run_node_memory(script: str, tmp_path: Path) -> dict:
    env = os.environ.copy()
    env["NODE_PATH"] = str(PI_NODE_MODULES)
    env["PI_CODING_AGENT_DIR"] = str(tmp_path / ".pi-agent")
    env["HARNESS_MEMORY_ROOT"] = str(tmp_path / "memory-root")
    result = subprocess.run(
        ["node", "-e", script],
        cwd=ROOT,
        env=env,
        text=True,
        encoding="utf-8",
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=30,
    )
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


def test_memory_schema_supports_lifecycle_rendering_tracking():
    schema = json.loads(SCHEMA.read_text(encoding="utf-8"))

    assert "lifecycle" in schema["required"]
    assert "rendering" in schema["required"]
    assert "lifecycle" in schema["properties"]
    assert "rendering" in schema["properties"]
    assert "stableRenderHash" in schema["properties"]["rendering"]["properties"]
    assert "conflictsWith" in schema["properties"]["lifecycle"]["properties"]


def test_memory_schema_supports_agents_md_promotion_status():
    schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
    governance = schema["properties"]["governance"]

    assert governance["properties"]["agentsMdProposalStatus"]["enum"] == ["none", "proposed", "accepted", "declined"]
    assert "agentsMdProposalStatus" not in governance["required"]


def test_memory_extension_exposes_tracking_and_cache_aware_terms():
    text = MEMORY_EXTENSION.read_text(encoding="utf-8")

    assert ".project-memory" in text
    assert "metrics.jsonl" in text
    assert "feedback.jsonl" in text
    assert "External Memory Policy v1" in text
    assert "External Memory Context v1" in text
    assert "stableRenderHash" in text
    assert "stickySetReused" in text
    assert "cacheChurn" in text
    assert "requestHash" in text
    assert "appendFeedback" in text


def test_memory_runtime_remember_inject_explain_and_feedback(tmp_path):
    script = textwrap.dedent(
        r'''
        const path = require('path');
        const fs = require('fs');
        const { createJiti } = require('jiti');
        process.chdir('target');

        const pi = { events: {}, commands: {}, tools: {}, on(name, fn) { this.events[name] = fn; }, registerCommand(name, spec) { this.commands[name] = spec; }, registerTool(spec) { this.tools[spec.name] = spec; } };
        const jiti = createJiti(path.resolve('memory-runtime-test.js'), { interopDefault: false });
        jiti(path.resolve('.pi/extensions/memory.ts')).default(pi);

        const notifications = [];
        const ctx = { hasUI: true, ui: { notify: (text, level) => notifications.push({ text, level }), confirm: async () => true } };

        (async () => {
          await pi.commands.memory.handler('remember 결정: workflow push policy scan은 명시 승인 없이 우회 금지', ctx);
          const prompt = await pi.events.before_agent_start({ systemPrompt: 'base', userPrompt: 'push policy scan 우회 문제 고쳐줘' });
          await pi.commands.memory.handler('explain', ctx);
          const root = process.env.HARNESS_MEMORY_ROOT;
          fs.mkdirSync(path.join(root, '.git'), { recursive: true });
          const metrics = fs.readFileSync(path.join(root, '.project-memory', 'memory', 'metrics.jsonl'), 'utf8').trim().split(/\r?\n/).map(JSON.parse);
          const entry = fs.readFileSync(path.join(root, '.project-memory', 'memory', 'entries.jsonl'), 'utf8').trim().split(/\r?\n/).map(JSON.parse)[0];
          await pi.commands.memory.handler(`feedback ${entry.memoryId} helpful`, ctx);
          const feedback = fs.readFileSync(path.join(root, '.project-memory', 'memory', 'feedback.jsonl'), 'utf8').trim().split(/\r?\n/).map(JSON.parse);
          await pi.commands.memory.handler('remember api_key=SECRET123 should not be stored', ctx);
          const exclude = fs.readFileSync(path.join(root, '.git', 'info', 'exclude'), 'utf8');
          console.log(JSON.stringify({
            commandNames: Object.keys(pi.commands),
            toolNames: Object.keys(pi.tools),
            prompt: prompt.systemPrompt,
            notifications: notifications.map((item) => item.text),
            metrics,
            feedback,
            entry,
            exclude,
          }));
        })().catch((error) => { console.error(error.stack || String(error)); process.exit(1); });
        '''
    )
    data = _run_node_memory(script, tmp_path)

    assert "memory" in data["commandNames"]
    assert "memory_remember" in data["toolNames"]
    assert "[External Memory Policy v1]" in data["prompt"]
    assert "[External Memory Context v1]" in data["prompt"]
    assert "workflow push policy scan" in data["prompt"]
    assert any("Memory explain" in text for text in data["notifications"])
    assert data["entry"]["status"] == "active"
    assert data["entry"]["rendering"]["stableRenderHash"].startswith("sha256:")
    inject_metrics = [item for item in data["metrics"] if item.get("operation") == "inject"]
    assert inject_metrics
    assert inject_metrics[-1]["selectedMemoryIds"] == [data["entry"]["memoryId"]]
    assert "requestHash" in inject_metrics[-1]
    assert "push policy scan 우회" not in json.dumps(inject_metrics, ensure_ascii=False)
    assert data["feedback"][-1]["kind"] == "helpful"
    assert ".project-memory/" in data["exclude"]
    assert "SECRET123" not in json.dumps(data, ensure_ascii=False)


def test_memory_tool_saves_injects_doctor_reports_and_rejects_secrets(tmp_path):
    script = textwrap.dedent(
        r'''
        const path = require('path');
        const fs = require('fs');
        const { createJiti } = require('jiti');
        process.chdir('target');

        const pi = { events: {}, commands: {}, tools: {}, on(name, fn) { this.events[name] = fn; }, registerCommand(name, spec) { this.commands[name] = spec; }, registerTool(spec) { this.tools[spec.name] = spec; } };
        const jiti = createJiti(path.resolve('memory-tool-test.js'), { interopDefault: false });
        jiti(path.resolve('.pi/extensions/memory.ts')).default(pi);

        const notifications = [];
        const ctx = { hasUI: true, ui: { notify: (text, level) => notifications.push({ text, level }), confirm: async () => true } };

        (async () => {
          const saved = await pi.tools.memory_remember.execute('memory-call-1', { text: '결정: memory tool natural save marker zeta-memory-tool' }, undefined, undefined, ctx);
          const duplicate = await pi.tools.memory_remember.execute('memory-call-duplicate', { text: '결정: memory tool natural save marker zeta-memory-tool' }, undefined, undefined, ctx);
          const prompt = await pi.events.before_agent_start({ systemPrompt: 'base', userPrompt: 'zeta-memory-tool 관련 작업' });
          await pi.commands.memory.handler('doctor', ctx);
          const secret = await pi.tools.memory_remember.execute('memory-call-2', { text: 'api_key=SECRET123 should never be persisted' }, undefined, undefined, ctx);
          const root = process.env.HARNESS_MEMORY_ROOT;
          const entries = fs.readFileSync(path.join(root, '.project-memory', 'memory', 'entries.jsonl'), 'utf8').trim().split(/\r?\n/).map(JSON.parse);
          const metrics = fs.readFileSync(path.join(root, '.project-memory', 'memory', 'metrics.jsonl'), 'utf8').trim().split(/\r?\n/).map(JSON.parse);
          console.log(JSON.stringify({
            toolNames: Object.keys(pi.tools),
            saved: saved.content[0].text,
            duplicate: duplicate.content[0].text,
            secret: secret.content[0].text,
            prompt: prompt.systemPrompt,
            entries,
            metrics,
            notifications: notifications.map((item) => item.text),
          }));
        })().catch((error) => { console.error(error.stack || String(error)); process.exit(1); });
        '''
    )
    data = _run_node_memory(script, tmp_path)

    assert "memory_remember" in data["toolNames"]
    assert len(data["entries"]) == 1
    entry = data["entries"][0]
    assert entry["status"] == "active"
    assert "zeta-memory-tool" in entry["content"]["summary"]
    assert entry["memoryId"] in data["saved"]
    assert "status=active" in data["saved"]
    assert data["entries"][0]["memoryId"] in data["duplicate"]
    assert "status=active" in data["duplicate"]
    assert "summary=" in data["saved"]
    assert "entries.jsonl" in data["saved"]
    assert "[External Memory Context v1]" in data["prompt"]
    assert "zeta-memory-tool" in data["prompt"]
    doctor = "\n".join(data["notifications"])
    assert "Memory doctor" in doctor
    assert "Project root:" in doctor
    assert "entries.jsonl" in doctor
    assert "active=1" in doctor
    assert "Recent injection" in doctor
    assert entry["memoryId"] in doctor
    assert "reasons=keyword" in doctor
    assert "Dynamic block hash:" in doctor
    assert "Memory not saved" in data["secret"]
    assert "secret-like" in data["secret"]
    dumped = json.dumps(data, ensure_ascii=False)
    assert "SECRET123" not in dumped


def test_memory_auto_extracts_candidates_and_explicit_active_memory(tmp_path):
    script = textwrap.dedent(
        r'''
        const path = require('path');
        const fs = require('fs');
        const { createJiti } = require('jiti');
        process.chdir('target');

        const pi = { events: {}, commands: {}, tools: {}, on(name, fn) { this.events[name] = fn; }, registerCommand(name, spec) { this.commands[name] = spec; }, registerTool(spec) { this.tools[spec.name] = spec; } };
        const jiti = createJiti(path.resolve('memory-auto-extract-test.js'), { interopDefault: false });
        jiti(path.resolve('.pi/extensions/memory.ts')).default(pi);

        (async () => {
          await pi.events.before_agent_start({ systemPrompt: 'base', userPrompt: '아니야, 이 repo에서는 target/.pi/extensions/memory.ts를 수정해야 해. workflow gate failure도 다음에 기억해야 해.' });
          const candidatePrompt = await pi.events.before_agent_start({ systemPrompt: 'base', userPrompt: 'target/.pi/extensions/memory.ts 관련 작업' });
          await pi.events.before_agent_start({ systemPrompt: 'base', userPrompt: '앞으로 항상 zeta-auto-active-marker 정책은 active memory로 기억해.' });
          const activePrompt = await pi.events.before_agent_start({ systemPrompt: 'base', userPrompt: 'zeta-auto-active-marker 관련 작업' });
          await pi.events.before_agent_start({ systemPrompt: 'base', userPrompt: '기억해 api_key=SECRET123 자동 저장하면 안 된다' });

          const root = process.env.HARNESS_MEMORY_ROOT;
          const entriesFile = path.join(root, '.project-memory', 'memory', 'entries.jsonl');
          const entries = fs.readFileSync(entriesFile, 'utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
          const metrics = fs.readFileSync(path.join(root, '.project-memory', 'memory', 'metrics.jsonl'), 'utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
          console.log(JSON.stringify({ entries, metrics, candidatePrompt: candidatePrompt.systemPrompt, activePrompt: activePrompt.systemPrompt }));
        })().catch((error) => { console.error(error.stack || String(error)); process.exit(1); });
        '''
    )
    data = _run_node_memory(script, tmp_path)

    candidates = [entry for entry in data["entries"] if entry["status"] == "candidate"]
    active = [entry for entry in data["entries"] if entry["status"] == "active"]

    assert candidates
    assert any("target/.pi/extensions/memory.ts" in entry["content"]["summary"] for entry in candidates)
    assert all(entry["provenance"]["source"].startswith("auto-extract") for entry in candidates)
    assert "[External Memory Context v1]" not in data["candidatePrompt"]

    assert active
    assert any("zeta-auto-active-marker" in entry["content"]["summary"] for entry in active)
    assert "[External Memory Context v1]" in data["activePrompt"]
    assert "zeta-auto-active-marker" in data["activePrompt"]

    dumped = json.dumps(data, ensure_ascii=False)
    assert "SECRET123" not in dumped
    assert any(item.get("rejected") == "secret-like-input" for item in data["metrics"])


def test_memory_autopilot_scores_phase_promotes_and_demotes(tmp_path):
    script = textwrap.dedent(
        r'''
        const path = require('path');
        const fs = require('fs');
        const { createJiti } = require('jiti');
        process.chdir('target');

        const pi = { events: {}, commands: {}, tools: {}, on(name, fn) { this.events[name] = fn; }, registerCommand(name, spec) { this.commands[name] = spec; }, registerTool(spec) { this.tools[spec.name] = spec; } };
        const jiti = createJiti(path.resolve('memory-autopilot-test.js'), { interopDefault: false });
        jiti(path.resolve('.pi/extensions/memory.ts')).default(pi);

        const notifications = [];
        const ctx = { hasUI: true, ui: { notify: (text, level) => notifications.push({ text, level }), confirm: async () => true } };

        (async () => {
          await pi.tools.memory_remember.execute('phase-implement', { text: '결정: implement phase zeta-autopilot-phase uses target/.pi implementation memory' }, undefined, undefined, ctx);
          await pi.tools.memory_remember.execute('phase-review', { text: '결정: code_review phase zeta-autopilot-phase uses reviewer memory' }, undefined, undefined, ctx);
          const phasePrompt = await pi.events.before_agent_start({ systemPrompt: '[LLM WORKFLOW ACTION]\n- Current phase: code_review\n[/LLM WORKFLOW ACTION]', userPrompt: 'zeta-autopilot-phase 관련 작업' });

          const candidateText = '아니야, zeta-autopilot-repeat memory는 반복 관찰되면 active로 승격해야 해.';
          await pi.events.before_agent_start({ systemPrompt: 'base', userPrompt: candidateText });
          await pi.events.before_agent_start({ systemPrompt: 'base', userPrompt: candidateText });
          const promotedPrompt = await pi.events.before_agent_start({ systemPrompt: 'base', userPrompt: 'zeta-autopilot-repeat 관련 작업' });

          const demoteSaved = await pi.tools.memory_remember.execute('demote', { text: '결정: zeta-autopilot-demote active memory should disappear after stale feedback' }, undefined, undefined, ctx);
          const root = process.env.HARNESS_MEMORY_ROOT;
          let entries = fs.readFileSync(path.join(root, '.project-memory', 'memory', 'entries.jsonl'), 'utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
          const demoteEntry = entries.find((entry) => entry.content.summary.includes('zeta-autopilot-demote'));
          await pi.commands.memory.handler(`feedback ${demoteEntry.memoryId} stale`, ctx);
          const demotedPrompt = await pi.events.before_agent_start({ systemPrompt: 'base', userPrompt: 'zeta-autopilot-demote 관련 작업' });

          const wrongText = '아니야, zeta-autopilot-wrong memory는 잘못된 기억이면 다시 승격되면 안 돼.';
          await pi.events.before_agent_start({ systemPrompt: 'base', userPrompt: wrongText });
          entries = fs.readFileSync(path.join(root, '.project-memory', 'memory', 'entries.jsonl'), 'utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
          const wrongEntry = entries.find((entry) => entry.content.summary.includes('zeta-autopilot-wrong'));
          await pi.commands.memory.handler(`feedback ${wrongEntry.memoryId} wrong`, ctx);
          await pi.events.before_agent_start({ systemPrompt: 'base', userPrompt: wrongText });
          const wrongPrompt = await pi.events.before_agent_start({ systemPrompt: 'base', userPrompt: 'zeta-autopilot-wrong 관련 작업' });
          await pi.commands.memory.handler('explain', ctx);

          entries = fs.readFileSync(path.join(root, '.project-memory', 'memory', 'entries.jsonl'), 'utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
          const metrics = fs.readFileSync(path.join(root, '.project-memory', 'memory', 'metrics.jsonl'), 'utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
          const audit = fs.readFileSync(path.join(root, '.project-memory', 'memory', 'audit.jsonl'), 'utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
          const injectionState = JSON.parse(fs.readFileSync(path.join(root, '.project-memory', 'memory', 'injection-state.json'), 'utf8'));
          console.log(JSON.stringify({ phasePrompt: phasePrompt.systemPrompt, promotedPrompt: promotedPrompt.systemPrompt, demotedPrompt: demotedPrompt.systemPrompt, wrongPrompt: wrongPrompt.systemPrompt, entries, metrics, audit, injectionState, notifications: notifications.map((item) => item.text) }));
        })().catch((error) => { console.error(error.stack || String(error)); process.exit(1); });
        '''
    )
    data = _run_node_memory(script, tmp_path)

    phase_prompt = data["phasePrompt"]
    assert phase_prompt.index("code_review phase zeta-autopilot-phase") < phase_prompt.index("implement phase zeta-autopilot-phase")

    repeat_entries = [entry for entry in data["entries"] if "zeta-autopilot-repeat" in entry["content"]["summary"]]
    assert repeat_entries
    assert repeat_entries[0]["status"] == "active"
    assert "zeta-autopilot-repeat" in data["promotedPrompt"]

    demote_entries = [entry for entry in data["entries"] if "zeta-autopilot-demote" in entry["content"]["summary"]]
    assert demote_entries
    assert demote_entries[0]["governance"]["autoInject"] == "never"
    assert "zeta-autopilot-demote" not in data["demotedPrompt"]

    wrong_entries = [entry for entry in data["entries"] if "zeta-autopilot-wrong" in entry["content"]["summary"]]
    assert wrong_entries
    assert wrong_entries[0]["status"] == "disabled"
    assert wrong_entries[0]["governance"]["autoInject"] == "never"
    assert "zeta-autopilot-wrong" not in data["wrongPrompt"]

    inject_metrics = [item for item in data["metrics"] if item.get("operation") == "inject"]
    assert inject_metrics
    assert any("selectedScores" in item for item in inject_metrics)
    assert any(item.get("operation") == "auto-promote" for item in data["metrics"])
    assert any(item.get("action") == "auto-promote" for item in data["audit"])
    assert any("score=" in text for text in data["notifications"] if "Memory explain" in text)


def test_memory_candidate_shortlist_visible_in_system_prompt(tmp_path):
    script = textwrap.dedent(
        r'''
        const path = require('path');
        const fs = require('fs');
        const { createJiti } = require('jiti');
        process.chdir('target');

        const pi = { events: {}, commands: {}, tools: {}, on(name, fn) { this.events[name] = fn; }, registerCommand(name, spec) { this.commands[name] = spec; }, registerTool(spec) { this.tools[spec.name] = spec; } };
        const jiti = createJiti(path.resolve('memory-candidate-shortlist-test.js'), { interopDefault: false });
        jiti(path.resolve('.pi/extensions/memory.ts')).default(pi);

        const notifications = [];
        const ctx = { hasUI: true, ui: { notify: (text, level) => notifications.push({ text, level }), confirm: async () => true } };

        (async () => {
          const longCandidateText = '아니야, zeta-shortlist-candidate memory는 ' + 'extra-detail-padding '.repeat(20) + 'workflow 관련 확인 필요';
          await pi.events.before_agent_start({ systemPrompt: 'base', userPrompt: longCandidateText });
          await pi.tools.memory_remember.execute('active-1', { text: '결정: zeta-shortlist-active memory는 active여야 해' }, undefined, undefined, ctx);

          const prompt = await pi.events.before_agent_start({ systemPrompt: 'base', userPrompt: 'zeta-shortlist-candidate zeta-shortlist-active 관련 작업' });

          const root = process.env.HARNESS_MEMORY_ROOT;
          const entries = fs.readFileSync(path.join(root, '.project-memory', 'memory', 'entries.jsonl'), 'utf8').trim().split(/\r?\n/).map(JSON.parse);
          const candidate = entries.find((e) => e.content.summary.includes('zeta-shortlist-candidate'));
          const active = entries.find((e) => e.content.summary.includes('zeta-shortlist-active'));
          console.log(JSON.stringify({
            prompt: prompt.systemPrompt,
            candidateId: candidate.memoryId,
            activeId: active.memoryId,
            candidateSummary: candidate.content.summary,
            candidateStatus: candidate.status,
          }));
        })().catch((error) => { console.error(error.stack || String(error)); process.exit(1); });
        '''
    )
    data = _run_node_memory(script, tmp_path)

    assert data["candidateStatus"] == "candidate"
    assert "[Candidate Memory Shortlist v1]" in data["prompt"]
    assert data["candidateId"] in data["prompt"]
    assert "[External Memory Context v1]" in data["prompt"]
    assert data["activeId"] in data["prompt"]

    summary = data["candidateSummary"]
    assert len(summary) > 80
    assert summary[:80] in data["prompt"]
    assert summary[80:] not in data["prompt"]


def test_memory_use_candidate_tool_returns_content_without_promoting(tmp_path):
    script = textwrap.dedent(
        r'''
        const path = require('path');
        const fs = require('fs');
        const { createJiti } = require('jiti');
        process.chdir('target');

        const pi = { events: {}, commands: {}, tools: {}, on(name, fn) { this.events[name] = fn; }, registerCommand(name, spec) { this.commands[name] = spec; }, registerTool(spec) { this.tools[spec.name] = spec; } };
        const jiti = createJiti(path.resolve('memory-use-candidate-test.js'), { interopDefault: false });
        jiti(path.resolve('.pi/extensions/memory.ts')).default(pi);

        (async () => {
          await pi.events.before_agent_start({ systemPrompt: 'base', userPrompt: '아니야, zeta-use-candidate memory는 workflow 관련 candidate여야 해' });
          const root = process.env.HARNESS_MEMORY_ROOT;
          const entriesFile = path.join(root, '.project-memory', 'memory', 'entries.jsonl');
          let entries = fs.readFileSync(entriesFile, 'utf8').trim().split(/\r?\n/).map(JSON.parse);
          const candidate = entries.find((e) => e.content.summary.includes('zeta-use-candidate'));

          const used = await pi.tools.memory_use_candidate.execute('call-1', { memoryId: candidate.memoryId, relevanceReason: 'User just confirmed this exact topic again in this turn.' });
          const missing = await pi.tools.memory_use_candidate.execute('call-2', { memoryId: 'mem_does_not_exist_00000', relevanceReason: 'Testing the missing-id path explicitly here.' });

          entries = fs.readFileSync(entriesFile, 'utf8').trim().split(/\r?\n/).map(JSON.parse);
          const afterUse = entries.find((e) => e.memoryId === candidate.memoryId);
          const audit = fs.readFileSync(path.join(root, '.project-memory', 'memory', 'audit.jsonl'), 'utf8').trim().split(/\r?\n/).map(JSON.parse);

          console.log(JSON.stringify({
            usedText: used.content[0].text,
            usedDetails: used.details,
            missingDetails: missing.details,
            statusAfterUse: afterUse.status,
            useCountAfterUse: afterUse.retrieval.useCount,
            audit,
          }));
        })().catch((error) => { console.error(error.stack || String(error)); process.exit(1); });
        '''
    )
    data = _run_node_memory(script, tmp_path)

    assert "zeta-use-candidate" in data["usedText"]
    assert data["usedDetails"]["ok"] is True
    assert data["statusAfterUse"] == "candidate"
    assert data["useCountAfterUse"] == 1
    assert data["missingDetails"]["ok"] is False
    assert data["missingDetails"]["reason"] == "memory-not-found"

    audit_entries = data["audit"]
    assert audit_entries[-1]["action"] == "llm-use-candidate"
    assert audit_entries[-1]["memoryId"] == data["usedDetails"]["memoryId"]


def test_memory_promote_candidate_promotes_and_blocks_bad_input(tmp_path):
    script = textwrap.dedent(
        r'''
        const path = require('path');
        const fs = require('fs');
        const { createJiti } = require('jiti');
        process.chdir('target');

        const pi = { events: {}, commands: {}, tools: {}, on(name, fn) { this.events[name] = fn; }, registerCommand(name, spec) { this.commands[name] = spec; }, registerTool(spec) { this.tools[spec.name] = spec; } };
        const jiti = createJiti(path.resolve('memory-promote-candidate-basic-test.js'), { interopDefault: false });
        jiti(path.resolve('.pi/extensions/memory.ts')).default(pi);

        const root = process.env.HARNESS_MEMORY_ROOT;
        const entriesFile = path.join(root, '.project-memory', 'memory', 'entries.jsonl');

        async function makeCandidate(marker) {
          await pi.events.before_agent_start({ systemPrompt: 'base', userPrompt: `아니야, ${marker} memory는 workflow 관련 candidate여야 해` });
          const entries = fs.readFileSync(entriesFile, 'utf8').trim().split(/\r?\n/).map(JSON.parse);
          return entries.find((e) => e.content.summary.includes(marker));
        }

        (async () => {
          const cand1 = await makeCandidate('zeta-promote-success');
          const promote1 = await pi.tools.memory_promote_candidate.execute('call-1', { memoryId: cand1.memoryId, triggerKind: 'explicit-confirmation', evidence: 'User explicitly said yes that is exactly correct, confirmed.' });

          const cand2 = await makeCandidate('zeta-promote-shortevidence');
          const promote2 = await pi.tools.memory_promote_candidate.execute('call-2', { memoryId: cand2.memoryId, triggerKind: 'explicit-confirmation', evidence: 'ok' });

          const promote3 = await pi.tools.memory_promote_candidate.execute('call-3', { memoryId: cand1.memoryId, triggerKind: 'task-success', evidence: 'Second promotion attempt after already active status should fail now.' });

          const entries = fs.readFileSync(entriesFile, 'utf8').trim().split(/\r?\n/).map(JSON.parse);
          const cand1After = entries.find((e) => e.memoryId === cand1.memoryId);
          const cand2After = entries.find((e) => e.memoryId === cand2.memoryId);
          const audit = fs.readFileSync(path.join(root, '.project-memory', 'memory', 'audit.jsonl'), 'utf8').trim().split(/\r?\n/).map(JSON.parse);
          const promoteAudit = audit.find((a) => a.memoryId === cand1.memoryId && a.action === 'auto-promote');

          console.log(JSON.stringify({
            promote1Details: promote1.details,
            promote2Details: promote2.details,
            promote3Details: promote3.details,
            cand1StatusAfter: cand1After.status,
            cand2StatusAfter: cand2After.status,
            promoteAudit,
          }));
        })().catch((error) => { console.error(error.stack || String(error)); process.exit(1); });
        '''
    )
    data = _run_node_memory(script, tmp_path)

    assert data["promote1Details"]["ok"] is True
    assert data["cand1StatusAfter"] == "active"
    assert data["promoteAudit"]["action"] == "auto-promote"
    assert data["promoteAudit"]["reason"] == "explicit-confirmation"
    assert "User explicitly said yes" in data["promoteAudit"]["evidence"]

    assert data["promote2Details"]["ok"] is False
    assert data["promote2Details"]["reason"] == "insufficient-evidence"
    assert data["cand2StatusAfter"] == "candidate"

    assert data["promote3Details"]["ok"] is False
    assert data["promote3Details"]["reason"] == "not-promotable"


def test_memory_promote_candidate_enforces_session_cap(tmp_path):
    script = textwrap.dedent(
        r'''
        const path = require('path');
        const fs = require('fs');
        const { createJiti } = require('jiti');
        process.chdir('target');

        const pi = { events: {}, commands: {}, tools: {}, on(name, fn) { this.events[name] = fn; }, registerCommand(name, spec) { this.commands[name] = spec; }, registerTool(spec) { this.tools[spec.name] = spec; } };
        const jiti = createJiti(path.resolve('memory-promote-candidate-cap-test.js'), { interopDefault: false });
        jiti(path.resolve('.pi/extensions/memory.ts')).default(pi);

        const root = process.env.HARNESS_MEMORY_ROOT;
        const entriesFile = path.join(root, '.project-memory', 'memory', 'entries.jsonl');

        async function makeCandidate(marker) {
          await pi.events.before_agent_start({ systemPrompt: 'base', userPrompt: `아니야, ${marker} memory는 workflow 관련 candidate여야 해` });
          const entries = fs.readFileSync(entriesFile, 'utf8').trim().split(/\r?\n/).map(JSON.parse);
          return entries.find((e) => e.content.summary.includes(marker));
        }

        (async () => {
          const results = [];
          for (let i = 1; i <= 6; i += 1) {
            const marker = `zeta-promote-cap-${i}`;
            const cand = await makeCandidate(marker);
            const result = await pi.tools.memory_promote_candidate.execute(`call-${i}`, { memoryId: cand.memoryId, triggerKind: 'explicit-confirmation', evidence: `User explicitly confirmed candidate number ${i} just now in conversation.` });
            results.push({ marker, memoryId: cand.memoryId, details: result.details });
          }

          const entries = fs.readFileSync(entriesFile, 'utf8').trim().split(/\r?\n/).map(JSON.parse);
          const sixth = entries.find((e) => e.memoryId === results[5].memoryId);

          console.log(JSON.stringify({ results, sixthStatus: sixth.status }));
        })().catch((error) => { console.error(error.stack || String(error)); process.exit(1); });
        '''
    )
    data = _run_node_memory(script, tmp_path)

    results = data["results"]
    assert len(results) == 6
    for result in results[:5]:
        assert result["details"]["ok"] is True

    assert results[5]["details"]["ok"] is False
    assert results[5]["details"]["reason"] == "session-cap-reached"
    assert data["sixthStatus"] == "candidate"


_SET_USE_COUNT_HELPER = r'''
        function setUseCount(entriesFile, memoryId, count) {
          const entries = fs.readFileSync(entriesFile, 'utf8').trim().split(/\r?\n/).map(JSON.parse);
          const updated = entries.map((entry) => (entry.memoryId === memoryId ? { ...entry, retrieval: { ...entry.retrieval, useCount: count } } : entry));
          fs.writeFileSync(entriesFile, updated.map((entry) => JSON.stringify(entry)).join('\n') + '\n', 'utf8');
        }
'''


def test_memory_agents_md_shortlist_appears_with_usecount_and_helpful_feedback(tmp_path):
    script = textwrap.dedent(
        r'''
        const path = require('path');
        const fs = require('fs');
        const { createJiti } = require('jiti');
        process.chdir('target');

        const pi = { events: {}, commands: {}, tools: {}, on(name, fn) { this.events[name] = fn; }, registerCommand(name, spec) { this.commands[name] = spec; }, registerTool(spec) { this.tools[spec.name] = spec; } };
        const jiti = createJiti(path.resolve('memory-agents-md-shortlist-yes-test.js'), { interopDefault: false });
        jiti(path.resolve('.pi/extensions/memory.ts')).default(pi);

        const notifications = [];
        const ctx = { hasUI: true, ui: { notify: (text, level) => notifications.push({ text, level }), confirm: async () => true } };

        ''' + _SET_USE_COUNT_HELPER + r'''

        (async () => {
          const root = process.env.HARNESS_MEMORY_ROOT;
          const entriesFile = path.join(root, '.project-memory', 'memory', 'entries.jsonl');

          const saved = await pi.tools.memory_remember.execute('call-1', { text: '결정: zeta-agents-promote-yes memory는 AGENTS.md 후보여야 해' }, undefined, undefined, ctx);
          const memoryId = saved.details.memoryId;
          setUseCount(entriesFile, memoryId, 5);
          await pi.commands.memory.handler(`feedback ${memoryId} helpful`, ctx);

          const prompt = await pi.events.before_agent_start({ systemPrompt: 'base', userPrompt: 'zeta-agents-promote-yes 관련 작업' });
          console.log(JSON.stringify({ prompt: prompt.systemPrompt, memoryId }));
        })().catch((error) => { console.error(error.stack || String(error)); process.exit(1); });
        '''
    )
    data = _run_node_memory(script, tmp_path)

    assert "[AGENTS.md Promotion Candidates v1]" in data["prompt"]
    assert data["memoryId"] in data["prompt"]


def test_memory_agents_md_shortlist_absent_without_helpful_feedback(tmp_path):
    script = textwrap.dedent(
        r'''
        const path = require('path');
        const fs = require('fs');
        const { createJiti } = require('jiti');
        process.chdir('target');

        const pi = { events: {}, commands: {}, tools: {}, on(name, fn) { this.events[name] = fn; }, registerCommand(name, spec) { this.commands[name] = spec; }, registerTool(spec) { this.tools[spec.name] = spec; } };
        const jiti = createJiti(path.resolve('memory-agents-md-shortlist-no-test.js'), { interopDefault: false });
        jiti(path.resolve('.pi/extensions/memory.ts')).default(pi);

        const notifications = [];
        const ctx = { hasUI: true, ui: { notify: (text, level) => notifications.push({ text, level }), confirm: async () => true } };

        ''' + _SET_USE_COUNT_HELPER + r'''

        (async () => {
          const root = process.env.HARNESS_MEMORY_ROOT;
          const entriesFile = path.join(root, '.project-memory', 'memory', 'entries.jsonl');

          const saved = await pi.tools.memory_remember.execute('call-1', { text: '결정: zeta-agents-promote-no memory는 AGENTS.md 후보가 아니어야 해' }, undefined, undefined, ctx);
          const memoryId = saved.details.memoryId;
          setUseCount(entriesFile, memoryId, 5);

          const prompt = await pi.events.before_agent_start({ systemPrompt: 'base', userPrompt: 'zeta-agents-promote-no 관련 작업' });
          console.log(JSON.stringify({ prompt: prompt.systemPrompt, memoryId }));
        })().catch((error) => { console.error(error.stack || String(error)); process.exit(1); });
        '''
    )
    data = _run_node_memory(script, tmp_path)

    assert "[AGENTS.md Promotion Candidates v1]" not in data["prompt"]


def test_memory_propose_agents_promotion_marks_proposed_and_blocks_reproposal(tmp_path):
    script = textwrap.dedent(
        r'''
        const path = require('path');
        const fs = require('fs');
        const { createJiti } = require('jiti');
        process.chdir('target');

        const pi = { events: {}, commands: {}, tools: {}, on(name, fn) { this.events[name] = fn; }, registerCommand(name, spec) { this.commands[name] = spec; }, registerTool(spec) { this.tools[spec.name] = spec; } };
        const jiti = createJiti(path.resolve('memory-propose-agents-promotion-test.js'), { interopDefault: false });
        jiti(path.resolve('.pi/extensions/memory.ts')).default(pi);

        const notifications = [];
        const ctx = { hasUI: true, ui: { notify: (text, level) => notifications.push({ text, level }), confirm: async () => true } };

        ''' + _SET_USE_COUNT_HELPER + r'''

        (async () => {
          const root = process.env.HARNESS_MEMORY_ROOT;
          const entriesFile = path.join(root, '.project-memory', 'memory', 'entries.jsonl');

          const saved = await pi.tools.memory_remember.execute('call-1', { text: '결정: zeta-agents-propose memory는 AGENTS.md 후보여야 해' }, undefined, undefined, ctx);
          const memoryId = saved.details.memoryId;
          setUseCount(entriesFile, memoryId, 5);
          await pi.commands.memory.handler(`feedback ${memoryId} helpful`, ctx);

          const propose1 = await pi.tools.memory_propose_agents_promotion.execute('call-2', { memoryId, proposedText: 'Add zeta-agents-propose as a documented convention in AGENTS.md.' });

          let entries = fs.readFileSync(entriesFile, 'utf8').trim().split(/\r?\n/).map(JSON.parse);
          const afterPropose = entries.find((e) => e.memoryId === memoryId);
          const audit = fs.readFileSync(path.join(root, '.project-memory', 'memory', 'audit.jsonl'), 'utf8').trim().split(/\r?\n/).map(JSON.parse);

          const promptAfter = await pi.events.before_agent_start({ systemPrompt: 'base', userPrompt: 'zeta-agents-propose 관련 작업' });
          const propose2 = await pi.tools.memory_propose_agents_promotion.execute('call-3', { memoryId, proposedText: 'Second proposal attempt should fail now.' });

          console.log(JSON.stringify({
            propose1Details: propose1.details,
            statusAfterPropose: afterPropose.governance.agentsMdProposalStatus,
            auditLast: audit[audit.length - 1],
            promptAfter: promptAfter.systemPrompt,
            propose2Details: propose2.details,
          }));
        })().catch((error) => { console.error(error.stack || String(error)); process.exit(1); });
        '''
    )
    data = _run_node_memory(script, tmp_path)

    assert data["propose1Details"]["ok"] is True
    assert data["statusAfterPropose"] == "proposed"
    assert data["auditLast"]["action"] == "agents-md-proposed"
    assert data["auditLast"]["proposedText"] == "Add zeta-agents-propose as a documented convention in AGENTS.md."
    assert "[AGENTS.md Promotion Candidates v1]" not in data["promptAfter"]

    assert data["propose2Details"]["ok"] is False
    assert data["propose2Details"]["reason"] == "already-processed"


def test_memory_record_agents_decision_accepts_and_rejects_non_proposed(tmp_path):
    script = textwrap.dedent(
        r'''
        const path = require('path');
        const fs = require('fs');
        const { createJiti } = require('jiti');
        process.chdir('target');

        const pi = { events: {}, commands: {}, tools: {}, on(name, fn) { this.events[name] = fn; }, registerCommand(name, spec) { this.commands[name] = spec; }, registerTool(spec) { this.tools[spec.name] = spec; } };
        const jiti = createJiti(path.resolve('memory-record-agents-decision-test.js'), { interopDefault: false });
        jiti(path.resolve('.pi/extensions/memory.ts')).default(pi);

        const notifications = [];
        const ctx = { hasUI: true, ui: { notify: (text, level) => notifications.push({ text, level }), confirm: async () => true } };

        ''' + _SET_USE_COUNT_HELPER + r'''

        (async () => {
          const root = process.env.HARNESS_MEMORY_ROOT;
          const entriesFile = path.join(root, '.project-memory', 'memory', 'entries.jsonl');

          const proposed = await pi.tools.memory_remember.execute('call-1', { text: '결정: zeta-agents-decision-accept memory는 AGENTS.md 후보여야 해' }, undefined, undefined, ctx);
          const proposedId = proposed.details.memoryId;
          setUseCount(entriesFile, proposedId, 5);
          await pi.commands.memory.handler(`feedback ${proposedId} helpful`, ctx);
          await pi.tools.memory_propose_agents_promotion.execute('call-2', { memoryId: proposedId, proposedText: 'Add zeta-agents-decision-accept as a convention.' });

          const decision1 = await pi.tools.memory_record_agents_decision.execute('call-3', { memoryId: proposedId, decision: 'accepted', note: 'User approved this in conversation.' });

          const entries = fs.readFileSync(entriesFile, 'utf8').trim().split(/\r?\n/).map(JSON.parse);
          const afterDecision = entries.find((e) => e.memoryId === proposedId);
          const audit = fs.readFileSync(path.join(root, '.project-memory', 'memory', 'audit.jsonl'), 'utf8').trim().split(/\r?\n/).map(JSON.parse);

          const neverProposed = await pi.tools.memory_remember.execute('call-4', { text: '결정: zeta-agents-decision-unproposed memory는 아직 제안된 적이 없어' }, undefined, undefined, ctx);
          const decision2 = await pi.tools.memory_record_agents_decision.execute('call-5', { memoryId: neverProposed.details.memoryId, decision: 'accepted', note: 'Should fail, never proposed.' });

          console.log(JSON.stringify({
            decision1Details: decision1.details,
            statusAfterDecision: afterDecision.governance.agentsMdProposalStatus,
            auditLast: audit[audit.length - 1],
            decision2Details: decision2.details,
          }));
        })().catch((error) => { console.error(error.stack || String(error)); process.exit(1); });
        '''
    )
    data = _run_node_memory(script, tmp_path)

    assert data["decision1Details"]["ok"] is True
    assert data["statusAfterDecision"] == "accepted"
    assert data["auditLast"]["action"] == "agents-md-decision"
    assert data["auditLast"]["decision"] == "accepted"

    assert data["decision2Details"]["ok"] is False
    assert data["decision2Details"]["reason"] == "not-proposed"


def test_memory_feedback_adjustment_boosts_score_above_minimum_threshold(tmp_path):
    script = textwrap.dedent(
        r'''
        const path = require('path');
        const fs = require('fs');
        const { createJiti } = require('jiti');
        process.chdir('target');

        const pi = { events: {}, commands: {}, tools: {}, on(name, fn) { this.events[name] = fn; }, registerCommand(name, spec) { this.commands[name] = spec; }, registerTool(spec) { this.tools[spec.name] = spec; } };
        const jiti = createJiti(path.resolve('memory-feedback-boost-test.js'), { interopDefault: false });
        jiti(path.resolve('.pi/extensions/memory.ts')).default(pi);

        const notifications = [];
        const ctx = { hasUI: true, ui: { notify: (text, level) => notifications.push({ text, level }), confirm: async () => true } };

        (async () => {
          const boosted = await pi.tools.memory_remember.execute('call-1', { text: '결정: zeta-fb-boost-case memory는 테스트용' }, undefined, undefined, ctx);
          const boostedId = boosted.details.memoryId;
          await pi.commands.memory.handler(`feedback ${boostedId} helpful`, ctx);
          await pi.commands.memory.handler(`feedback ${boostedId} helpful`, ctx);
          await pi.commands.memory.handler(`feedback ${boostedId} helpful`, ctx);

          const belowThreshold = await pi.tools.memory_remember.execute('call-2', { text: '결정: zeta-fb-nothreshold-case memory는 테스트용' }, undefined, undefined, ctx);
          const belowThresholdId = belowThreshold.details.memoryId;
          await pi.commands.memory.handler(`feedback ${belowThresholdId} helpful`, ctx);

          await pi.commands.memory.handler('search zeta-fb', ctx);
          const notification = notifications[notifications.length - 1].text;

          console.log(JSON.stringify({ notification, boostedId, belowThresholdId }));
        })().catch((error) => { console.error(error.stack || String(error)); process.exit(1); });
        '''
    )
    data = _run_node_memory(script, tmp_path)

    boosted_block = _extract_memory_block(data["notification"], data["boostedId"])
    below_threshold_block = _extract_memory_block(data["notification"], data["belowThresholdId"])

    assert "feedback-boost" in boosted_block
    assert "feedback-boost" not in below_threshold_block


def test_memory_feedback_adjustment_penalizes_score_with_irrelevant_feedback(tmp_path):
    script = textwrap.dedent(
        r'''
        const path = require('path');
        const fs = require('fs');
        const { createJiti } = require('jiti');
        process.chdir('target');

        const pi = { events: {}, commands: {}, tools: {}, on(name, fn) { this.events[name] = fn; }, registerCommand(name, spec) { this.commands[name] = spec; }, registerTool(spec) { this.tools[spec.name] = spec; } };
        const jiti = createJiti(path.resolve('memory-feedback-penalty-test.js'), { interopDefault: false });
        jiti(path.resolve('.pi/extensions/memory.ts')).default(pi);

        const notifications = [];
        const ctx = { hasUI: true, ui: { notify: (text, level) => notifications.push({ text, level }), confirm: async () => true } };

        (async () => {
          const penalized = await pi.tools.memory_remember.execute('call-1', { text: '결정: zeta-fb-penalty-case memory는 테스트용' }, undefined, undefined, ctx);
          const penalizedId = penalized.details.memoryId;
          await pi.commands.memory.handler(`feedback ${penalizedId} irrelevant`, ctx);
          await pi.commands.memory.handler(`feedback ${penalizedId} irrelevant`, ctx);
          await pi.commands.memory.handler(`feedback ${penalizedId} irrelevant`, ctx);
          await pi.commands.memory.handler('search zeta-fb-penalty-case', ctx);
          const notification = notifications[notifications.length - 1].text;

          console.log(JSON.stringify({ notification, penalizedId }));
        })().catch((error) => { console.error(error.stack || String(error)); process.exit(1); });
        '''
    )
    data = _run_node_memory(script, tmp_path)

    penalized_block = _extract_memory_block(data["notification"], data["penalizedId"])
    assert "feedback-penalty" in penalized_block


def test_memory_feedback_adjustment_clamps_score_change_to_four(tmp_path):
    script = textwrap.dedent(
        r'''
        const path = require('path');
        const fs = require('fs');
        const { createJiti } = require('jiti');
        process.chdir('target');

        const pi = { events: {}, commands: {}, tools: {}, on(name, fn) { this.events[name] = fn; }, registerCommand(name, spec) { this.commands[name] = spec; }, registerTool(spec) { this.tools[spec.name] = spec; } };
        const jiti = createJiti(path.resolve('memory-feedback-clamp-test.js'), { interopDefault: false });
        jiti(path.resolve('.pi/extensions/memory.ts')).default(pi);

        const notifications = [];
        const ctx = { hasUI: true, ui: { notify: (text, level) => notifications.push({ text, level }), confirm: async () => true } };

        (async () => {
          const control = await pi.tools.memory_remember.execute('call-1', { text: '결정: zeta-fb-clamp-control memory는 테스트용' }, undefined, undefined, ctx);
          const controlId = control.details.memoryId;

          const boosted = await pi.tools.memory_remember.execute('call-2', { text: '결정: zeta-fb-clamp-boosted memory는 테스트용' }, undefined, undefined, ctx);
          const boostedId = boosted.details.memoryId;
          for (let i = 0; i < 5; i += 1) {
            await pi.commands.memory.handler(`feedback ${boostedId} helpful`, ctx);
          }

          await pi.commands.memory.handler('search zeta-fb-clamp', ctx);
          const notification = notifications[notifications.length - 1].text;

          console.log(JSON.stringify({ notification, controlId, boostedId }));
        })().catch((error) => { console.error(error.stack || String(error)); process.exit(1); });
        '''
    )
    data = _run_node_memory(script, tmp_path)

    control_block = _extract_memory_block(data["notification"], data["controlId"])
    boosted_block = _extract_memory_block(data["notification"], data["boostedId"])
    control_score = int(re.search(r"score=(\d+)", control_block).group(1))
    boosted_score = int(re.search(r"score=(\d+)", boosted_block).group(1))

    assert 0 < boosted_score - control_score <= 4



