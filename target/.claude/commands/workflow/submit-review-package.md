Submit a review package. Major/critical findings must be zero to approve.

Usage: `/workflow:submit-review-package critical=0 major=0 minor=1 summary="review passed" self_review="..." independent_review="..."`

```bash
node .claude/hooks/workflow-gate.cjs submit-review-package "$ARGUMENTS"
```
