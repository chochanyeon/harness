import json
import os
import subprocess
import textwrap
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PI_NODE_MODULES = Path.home() / "AppData" / "Roaming" / "npm" / "node_modules" / "@earendil-works" / "pi-coding-agent" / "node_modules"
SCHEMA = ROOT / "target" / ".pi" / "schemas" / "harness-memory-entry.schema.json"
MEMORY_EXTENSION = ROOT / "target" / ".pi" / "extensions" / "memory.ts"


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
