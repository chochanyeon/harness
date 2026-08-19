---
description: Start a new harness workflow for the given goal.
argument-hint: <goal>
---

Start a workflow for: $ARGUMENTS. After it starts, begin the interview phase immediately — clarify requirements before writing any plan or code.

```bash
node "${CLAUDE_PROJECT_DIR}/.claude/hooks/workflow-cli.cjs" start "$ARGUMENTS"
```
