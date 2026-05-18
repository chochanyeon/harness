#!/usr/bin/env bash
# PreToolUse(Skill) — 스킬 실행 전제조건 검사
# 현재: code-review 스킬 실행 전 변경사항 존재 여부 확인

INPUT=$(cat)
SKILL=$(echo "$INPUT" | jq -r '.tool_input.skill // empty' 2>/dev/null)

case "$SKILL" in
  code-review|code-review:code-review)
    DIFF=$(git -C "$PWD" diff HEAD --stat 2>/dev/null)
    STAGED=$(git -C "$PWD" diff --cached --stat 2>/dev/null)
    if [ -z "$DIFF" ] && [ -z "$STAGED" ]; then
      printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"변경 사항 없음. code-review는 uncommitted 또는 staged 변경이 있어야 합니다. git status로 현재 상태를 확인하세요."}}\n'
      exit 0
    fi
    ;;
esac

exit 0
