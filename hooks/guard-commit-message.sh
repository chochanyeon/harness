#!/usr/bin/env bash
# PreToolUse(Bash) — Conventional Commits 형식 검사
# 형식 오류 시 deny

INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${HOOK_DIR}/hook-common.sh"

# git commit이 아니면 즉시 종료
is_git_commit "$CMD" || exit 0

# -m 메시지 추출 (단일 따옴표 우선, 이중 따옴표 시도)
MSG=$(echo "$CMD" | sed -n "s/.*-m[[:space:]]*'\([^']*\)'.*/\1/p")
if [ -z "$MSG" ]; then
  MSG=$(echo "$CMD" | sed -n 's/.*-m[[:space:]]*"\([^"]*\)".*/\1/p')
fi

# heredoc / -F 파일 방식은 검사 불가 → 통과
[ -z "$MSG" ] && exit 0

# Conventional Commits 정규식 검사
PATTERN='^(feat|fix|chore|refactor|docs|test|perf|ci|style|revert)(\([a-z0-9][a-z0-9-]*\))?: .{1,100}$'
if ! echo "$MSG" | grep -qE "$PATTERN"; then
  log_violation "commit-message" "commit" "$MSG"
  deny "── 📝 COMMIT MESSAGE FORMAT ───────────

  커밋 메시지 형식 오류

  현재: \"${MSG}\"
  필요: \"feat(xxx-module): 설명\"

  타입: feat | fix | chore | refactor | docs | test | perf | ci | style | revert
  스코프: 소문자 영숫자 + 하이픈 (선택)
  제목: 1~100자

──────────────────────────────────────"
fi

exit 0
