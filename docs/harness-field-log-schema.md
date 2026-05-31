# Harness Field Log Schema

Harness field logs are produced inside projects that use the harness, then optionally exported into this harness development repository for analysis and improvement work.

The schema is intentionally **LLM-actionable**: each event must describe not only what failed in the project, but what weakness may exist in the harness and what change a harness-developing LLM should investigate.

Schema file:

- `target/.pi/schemas/harness-field-log-event.schema.json`

## Ownership model

```text
Applied project
  produces local logs under .project-memory/harness/

Harness development repo
  imports redacted/exportable logs
  analyzes recurring patterns
  implements harness improvements
```

The harness repo owns the schema. Applied projects own their local logs.

## Recommended applied-project paths

```text
.project-memory/harness/
  failures.jsonl          # append-only field log events
  exports/
    harness-log-YYYY-MM-DD.redacted.jsonl
```

## Required LLM-actionable fields

Every event includes `llmAnalysisPacket`:

```json
{
  "problemForHarnessRepo": "DPAA allowed a plan with subjective acceptance criteria.",
  "reproductionHint": "Create a plan whose acceptance says 'works well' and attempt plan_review -> implement.",
  "improvementKind": "dpaa-rule",
  "candidateChange": "Add a DPAA verification rule that rejects subjective acceptance wording unless paired with objective commands or metrics.",
  "targetFilesHint": [
    "target/.pi/dpaa/rules/verification.yaml",
    "target/.pi/dpaa/layers/verification.py",
    "tests/test_verification.py"
  ],
  "acceptanceCriteria": [
    "A plan with only subjective acceptance criteria fails DPAA.",
    "A plan with concrete commands and expected outputs passes."
  ]
}
```

This lets an LLM in the harness repo move directly from imported logs to a concrete implementation plan.

## Example JSONL event

```json
{"schemaVersion":1,"eventId":"hlog_20260531_001","timestamp":"2026-05-31T12:34:56Z","harness":{"version":"0.1.0","gitCommit":"bc496a7","runtime":{"host":"pi","platform":"darwin","nodeVersion":"v22.0.0","pythonVersion":"3.12.3"}},"project":{"anonymousId":"proj_7f3a","repoKind":"java-spring","branch":"feat/order-timeout","worktree":".worktrees/feat-order-timeout","gitHead":"abc123"},"workflow":{"workflowId":"wf_123","phase":"plan_review","fromPhase":"plan_review","toPhase":"implement","loadedWorkflowTemplate":"test-first"},"event":{"type":"gate.failed","category":"dpaa","severity":"blocker","status":"open"},"failure":{"summary":"DPAA did not provide a specific enough remediation for vague verification criteria.","expected":"The guard should explain the missing objective verification and suggest concrete plan edits.","actual":"The guard failed but the message did not identify the exact acceptance criteria to rewrite.","impact":"The user had to manually infer how to fix the plan.","rootCause":null,"resolution":null,"evidence":{"primaryMessage":"Verification criteria are ambiguous.","exitCode":1,"command":"python -m dpaa.cli .ai/interview/plan.md","findingCodes":["verification.missing_objective_acceptance"],"files":[{"path":".ai/interview/plan.md","role":"input"}],"logExcerpt":"Verification criteria are ambiguous."}},"llmAnalysisPacket":{"problemForHarnessRepo":"DPAA findings need more actionable remediation text for vague verification criteria.","reproductionHint":"Use a plan with acceptance criteria like 'confirm behavior is correct' and run DPAA.","improvementKind":"dpaa-rule","candidateChange":"Improve verification finding suggestions to include concrete command/output examples.","targetFilesHint":["target/.pi/dpaa/suggestions/templates.yaml","target/.pi/dpaa/output/text_report.py","tests/test_verification.py"],"acceptanceCriteria":["DPAA output names the vague criterion.","DPAA output suggests at least one objective command or measurable expected result."],"negativeExamples":["Do not simply lower the DPAA threshold."]},"privacy":{"redactionLevel":"paths-only","containsSensitiveData":false,"exportableToHarnessRepo":true,"redactionNotes":"Project name anonymized."}}
```

## Import/analysis expectation

Harness repo analysis tools should group logs by:

- `event.category`
- `failure.summary`
- `failure.evidence.findingCodes[]`
- `llmAnalysisPacket.improvementKind`
- `llmAnalysisPacket.targetFilesHint[]`

A repeated cluster should produce a harness change candidate, not an automatic rule change. Human review is still required before modifying workflow, DPAA, or prompt rules.
