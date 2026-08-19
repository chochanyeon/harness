---
description: Manually force the workflow to a phase (recovery only — bypasses gates).
argument-hint: <phase>
---

Manual recovery only — this bypasses gates. Prefer /workflow approve for normal progress. Force phase: $ARGUMENTS.

```bash
node "${CLAUDE_PROJECT_DIR}/.claude/hooks/workflow-cli.cjs" state "$ARGUMENTS"
```
