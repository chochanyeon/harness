Issue a one-use 10-minute workflow gate skip token after explicit user approval.

Usage: `/workflow:skip <dpaa|code-quality|push-review|policy-scan> <reason>`

```bash
node .claude/hooks/workflow-gate.cjs skip "$ARGUMENTS"
```
