Manually restore the Claude workflow gate phase only if the user explicitly requested a phase recovery.

Allowed phases: interview, plan, plan_review, implement, code_review, review_approved, document, commit, push, done.

```bash
node .claude/hooks/workflow-gate.cjs state "$ARGUMENTS"
```
