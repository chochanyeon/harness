#!/usr/bin/env bash
# ⚠️  DISABLED: 이 hook은 settings.json에서 비활성화되었습니다
# ⚠️  이유: /push-with-review 스킬 호출 자체가 승인으로 간주
# ⚠️  재활성화: settings.json PreToolUse Bash hooks에 다시 추가
#
# PreToolUse(Bash) — git push 가드
# 역할: 직접 git push 차단 + 보호 브랜치 차단
# 허용 조건: ~/.claude/hooks/.push-gate 파일이 5분 이내에 생성된 경우

INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)

# Helper: permissionDecision deny JSON → reason is displayed to user
deny() {
    jq -n --arg r "$1" '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":$r}}'
    exit 0
}

# git push 패턴 감지 (오탐지 방지: 따옴표, $(...), git commit 제거 후 검사)
CMD_STRIPPED=$(echo "$CMD" | sed "s/'[^']*'//g" | sed 's/"[^"]*"//g')  # 1. 따옴표 내부 제거
CMD_STRIPPED=$(echo "$CMD_STRIPPED" | sed 's/\$([^)]*)//g')             # 2. $(...) 제거
CMD_STRIPPED=$(echo "$CMD_STRIPPED" | sed -E 's/git[[:space:]]+commit[^;|&]*//g')  # 3. git commit 전체 제거

if ! echo "$CMD_STRIPPED" | grep -qE '(^|[|;&[:space:]])git[[:space:]]+push([[:space:]]|$|-)'; then
  exit 0
fi

# 게이트 파일 확인 (push-with-review 스킬이 생성) — 존재만 확인, 소비는 PostToolUse에서
ROOT=$(git -C "$PWD" rev-parse --show-toplevel 2>/dev/null)
GATE_FILE="${ROOT}/.claude/hooks/gates/.push-gate"
if [ -f "$GATE_FILE" ]; then
  FRESH=$(find "$GATE_FILE" -mmin -5 2>/dev/null)
  if [ -n "$FRESH" ]; then
    exit 0  # 허용, PostToolUse에서 성공 시 소비
  fi
  deny "푸시 승인이 만료되었습니다(5분 초과). /push-with-review 스킬을 다시 실행하세요."
fi

# 보호 브랜치 감지
BRANCH=$(git -C "$PWD" branch --show-current 2>/dev/null)
if echo "$BRANCH" | grep -qE '^(main|master|dev)$'; then
  deny "보호 브랜치(\`${BRANCH}\`)에 직접 push 금지. feature 브랜치를 사용하세요."
fi

deny "직접 git push 금지. /push-with-review 스킬을 사용하세요. 스킬이 코드 리뷰 완료 후 push-gate를 생성하고 push를 허용합니다."
