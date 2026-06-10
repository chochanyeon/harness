import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCHEMA = ROOT / "target" / ".pi" / "schemas" / "harness-field-log-event.schema.json"
FIELD_LOG = ROOT / "target" / ".pi" / "extensions" / "workflow" / "field-log.ts"
WORKFLOW = ROOT / "target" / ".pi" / "extensions" / "workflow.ts"
ROUTER = ROOT / "target" / ".pi" / "extensions" / "workflow" / "application" / "workflow-command-router.ts"
GATES = ROOT / "target" / ".pi" / "extensions" / "workflow" / "gates.ts"
CORE = ROOT / "target" / ".pi" / "extensions" / "workflow" / "core.ts"


def test_field_log_schema_is_llm_actionable_json_schema():
    schema = json.loads(SCHEMA.read_text(encoding="utf-8"))

    assert schema["schemaVersion" if "schemaVersion" in schema else "$schema"]
    assert "llmAnalysisPacket" in schema["required"]
    packet = schema["properties"]["llmAnalysisPacket"]
    for key in [
        "problemForHarnessRepo",
        "reproductionHint",
        "improvementKind",
        "candidateChange",
        "targetFilesHint",
        "acceptanceCriteria",
    ]:
        assert key in packet["properties"]


def test_field_log_runtime_writes_project_memory_and_exports_redacted_logs():
    text = FIELD_LOG.read_text(encoding="utf-8")

    assert ".project-memory" in text
    assert "events.jsonl" in text
    assert "exportFieldLogs" in text
    assert "formatRecentFieldLogs" in text
    assert "formatFieldLogSummary" in text
    assert "By category" in text
    assert "By severity" in text
    assert "writeFieldLogEvent" in text
    assert "exportableToHarnessRepo" in text
    assert "problemForHarnessRepo" in text
    assert "targetFilesHint" in text
    assert "acceptanceCriteria" in text


def test_workflow_commands_and_gates_emit_field_logs():
    workflow = WORKFLOW.read_text(encoding="utf-8") + ROUTER.read_text(encoding="utf-8")
    gates = GATES.read_text(encoding="utf-8")
    core = CORE.read_text(encoding="utf-8")

    assert '"failures"' in workflow
    assert "formatRecentFieldLogs" in workflow
    assert "exportFieldLogs" in workflow
    assert "writeFieldLogEvent" in workflow
    assert "writeFieldLogEvent" in gates
    assert "DPAA returned" in gates
    assert "Code quality guard failed" in gates
    assert 'export * from "./field-log";' in core
