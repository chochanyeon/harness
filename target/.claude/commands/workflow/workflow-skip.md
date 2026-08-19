---
description: Issue a one-time, 10-minute gate skip token after explicit user approval.
argument-hint: <gate> <reason>
---

Only run this after the user explicitly accepts the risk. Usage: /workflow-skip <dpaa|code-quality|policy-scan> <reason>.

```bash
node "${CLAUDE_PROJECT_DIR}/.claude/hooks/workflow-cli.cjs" skip $ARGUMENTS
```
