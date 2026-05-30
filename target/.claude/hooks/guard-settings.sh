#!/usr/bin/env bash
# PreToolUse(Edit, Write) — settings.json 수정 차단
# 역할: Hook 비활성화 시도 방지

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)

deny() {
    jq -n --arg r "$1" '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":$r}}'
    exit 0
}

# .settings-gate 체크 (60분 유효)
ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
GATE_FILE="${ROOT}/.claude/hooks/gates/.settings-gate"
if [ -f "$GATE_FILE" ]; then
    FRESH=$(find "$GATE_FILE" -mmin -60 2>/dev/null)
    if [ -n "$FRESH" ]; then
        exit 0
    fi
fi

# settings.json 또는 hooks/*.sh 수정 감지
if echo "$FILE_PATH" | grep -qE "\.claude/(settings\.json|hooks/.*\.(sh|js))$"; then
    TARGET=$(basename "$FILE_PATH")
    DENY_MSG=$(cat <<MSG
── 🔒 SETTINGS PROTECTION ─────────────

  보호된 파일 수정 차단: ${TARGET}

  차단 대상:
  - settings.json (hook 설정)
  - hooks/*.sh, hooks/*.js (hook 파일)

  정당한 수정이 필요한 경우:

  ① touch .claude/hooks/gates/.settings-gate
  ② 60분 이내 수정
  ③ 즉시 코드 리뷰 요청 & 커밋

  🚨 Hook 우회 시도는 보안 위반입니다
  🚨 Guard 파일 수정은 감사 기록됨

──────────────────────────────────────
MSG
)
    deny "$DENY_MSG"
fi

# settings.local.json은 허용 (개인 설정)
if echo "$FILE_PATH" | grep -q "\.claude/settings\.local\.json$"; then
    exit 0
fi

exit 0
