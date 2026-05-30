#!/usr/bin/env bash
# PreToolUse(Write|Edit) — 아키텍처/보안 파일 감지 시 persona 컨텍스트 주입
# 차단 없음; additionalContext만 출력

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // empty' 2>/dev/null)

[ -z "$FILE_PATH" ] && exit 0

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${HOOK_DIR}/hook-common.sh"

ROOT=$(git_root)
[ -z "$ROOT" ] && ROOT="$PWD"

FILENAME=$(basename "$FILE_PATH")

# 파일명으로 persona 결정
PERSONA_FILE=""
if echo "$FILENAME" | grep -qE '(Entity|Repository|build\.gradle|settings\.gradle)'; then
  PERSONA_FILE="${ROOT}/.claude/personas/architect/AGENTS.md"
elif echo "$FILENAME" | grep -qE '(Security|Auth|Jwt|Token|Filter|Interceptor)'; then
  PERSONA_FILE="${ROOT}/.claude/personas/reviewer/security-expert.md"
fi

[ -z "$PERSONA_FILE" ] && exit 0

if [ ! -f "$PERSONA_FILE" ]; then
  jq -cn --arg ctx "[Persona] 파일 없음: ${PERSONA_FILE}" \
    '{"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":$ctx}}'
  exit 0
fi

PERSONA_CONTENT=$(cat "$PERSONA_FILE")
jq -cn --arg ctx "$PERSONA_CONTENT" \
  '{"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":$ctx}}'
exit 0
