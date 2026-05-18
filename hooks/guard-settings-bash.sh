#!/usr/bin/env bash
# PreToolUse(Bash) — .claude/ 수정 시도 시 사용자 허가 요청

INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)

ask() {
    jq -n --arg r "$1" '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":$r}}'
    exit 0
}

# .claude 디렉터리를 대상으로 하는 명령어 감지
if echo "$CMD" | grep -qE '(\.claude/(settings|hooks)|settings\.json|guard-.*\.sh)'; then
    # 파일 수정/삭제 도구만 차단 (읽기 전용 명령 제외)
    if echo "$CMD" | grep -qE '(\brm\b|\bmv\b|cat[[:space:]].*>|echo[[:space:]].*>|tee|\bchmod\b|chown|\bdd\b|truncate)'; then
        ask ".claude/ 설정 파일 수정 시도가 감지되었습니다. 허가하시겠습니까?

명령: $CMD"
    fi
fi

exit 0
