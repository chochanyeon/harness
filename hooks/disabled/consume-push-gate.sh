#!/usr/bin/env bash
# ⚠️  DISABLED: 이 hook은 settings.json에서 비활성화되었습니다
# ⚠️  이유: Gate 시스템 비활성화 (스킬 호출 = 승인)
# ⚠️  재활성화: settings.json PostToolUse Bash hooks에 다시 추가
#
# PostToolUse(Bash) — git push 성공 시 gate 소비
# 역할: push 성공 시에만 gate를 삭제하여 재사용 방지

INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)
SUCCESS=$(echo "$INPUT" | jq -r '.tool_response.success // empty' 2>/dev/null)

# git push 패턴 감지 (따옴표 내부 제거 후 검사)
CMD_STRIPPED=$(echo "$CMD" | sed "s/'[^']*'//g" | sed 's/"[^"]*"//g')
if ! echo "$CMD_STRIPPED" | grep -qE '(^|[|;&[:space:]])git[[:space:]]+push([[:space:]]|$|-)'; then
  exit 0
fi

# Push 성공 시에만 gate 소비
if [ "$SUCCESS" = "true" ]; then
  ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
  GATE_FILE="${ROOT}/.claude/hooks/gates/.push-gate"
  if [ -f "$GATE_FILE" ]; then
    rm -f "$GATE_FILE"
  fi
fi

exit 0
