# Deferred Improvements

These items were discussed and intentionally deferred so the harness can improve through real use instead of overbuilding early.

## External Memory Roadmap

Current state: manual active memory, deterministic top-N injection, metrics/feedback logs, secret-save rejection, local `.project-memory/` exclude.

Deferred:

- Candidate auto-extraction from conversation/workflow checkpoints.
- `/memory candidates`, `/memory approve`, `/memory reject`.
- Semantic/vector retrieval and retrieval eval fixture generation from feedback.
- Feedback-aware ranking adjustments.
- Merge/supersede/compact/stale lifecycle commands.
- AGENTS.md promotion proposals.
- Provider-level prompt cache hit-rate measurement.

## Field Log Analysis Workflow

Current state: projects produce `.project-memory/harness/events.jsonl`, export redacted logs, and harness-dev workflows get field-log evidence reminders.

Deferred:

- Import command for redacted field logs in the harness repo.
- LLM-assisted clustering of recurring field failures.
- Field-log-to-memory candidate conversion.
- Automated issue/improvement proposal generation from imported logs.
- Regression test scaffold generation from field-log reproduction hints.

## Environment Validation

Deferred:

- Real macOS end-to-end validation for init/update/doctor/workflow/memory.
- Real Linux end-to-end validation outside CI-like shell tests.
- First-run DPAA venv/network failure matrix.

## Workflow Review Automation Next Steps

Current state: `submit_review_package` records main review, independent reviewer/subagent review summary, quality gate summary, and severity counts; it then triggers `code_review → review_approved` when thresholds and code quality pass.

Deferred:

- Direct Pi SDK/subagent API integration if/when project-local extensions can invoke reviewer agents directly.
- Structured reviewer artifacts under `.project-memory/workflow/reviews/` if persistence is needed.
- Richer severity taxonomy and reviewer checklist templates per workflow type.
- Automatic review-package quality scoring beyond Critical=0 and Major≤2.
