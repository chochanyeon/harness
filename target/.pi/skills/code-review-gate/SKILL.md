---
name: code-review-gate
description: Use in `code_review` for review/fix loops. Report Korean findings. Do not create approval artifacts; extension records evidence via approve or submit_review_package.
disable-model-invocation: true
---

# Code Review Gate

Use this when the workflow is in `code_review` or the user asks for pre-push review.

## Output Language

Respond in Korean.

## Process

1. Run the normal `/skill:code-review` review process on staged and unstaged changes.
2. Report findings by severity: Critical / Major / Minor.
3. If Critical > 0 or Major > 2, stay in `code_review`: explain fixes, apply approved fixes, and review again.
4. When the result satisfies the threshold, tell the user:
   - Critical = 0
   - Major ≤ 2
   - remaining Minor issues, if any
   - “다음 단계로 진행하려면 `/workflow approve`에서 직접 확인해주세요.”

## Rules

- Do not call or invent approval/authority tools.
- Do not claim the guard is approved on behalf of the user.
- The extension, not the LLM, records guard satisfaction after explicit user confirmation.
