#!/usr/bin/env bash
# PreToolUse(Bash) — git commit 시 Java 파일 정적 분석 (Checkstyle + PMD)
# 역할: 변경된 main Java 파일이 있을 때 CI와 동일한 정적 분석 실행
#
# bypass: STATIC_ANALYSIS_SKIP=1

INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)

[ "$STATIC_ANALYSIS_SKIP" = "1" ] && exit 0

deny() {
  jq -n --arg r "$1" '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":$r}}'
  exit 0
}

# git commit 감지
CMD_STRIPPED=$(echo "$CMD" | sed "s/'[^']*'//g" | sed 's/"[^"]*"//g')
CMD_NORMALIZED=$(echo "$CMD_STRIPPED" | sed 's/git[[:space:]]\+-C[[:space:]]\+[^[:space:]]*/git/g')
if ! echo "$CMD_NORMALIZED" | grep -qE '(^|[|;&[:space:]])git[[:space:]]+commit([[:space:]]|$)'; then
  exit 0
fi

ROOT=$(git -C "$PWD" rev-parse --show-toplevel 2>/dev/null)
[ -z "$ROOT" ] && exit 0

# staged main Java 파일이 없으면 스킵
JAVA_CHANGES=$(git -C "$ROOT" diff --cached --name-only --diff-filter=ACMR 2>/dev/null \
  | grep '\.java$' \
  | grep 'src/main/java' \
  | head -1)
[ -z "$JAVA_CHANGES" ] && exit 0

cd "$ROOT" || exit 0
OUTPUT=$(./gradlew checkstyleMain pmdMain -q 2>&1)
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
  SUMMARY=$(echo "$OUTPUT" | tail -20)
  deny "Checkstyle/PMD 위반 발견. 커밋 전 수정 필요.

$SUMMARY

bypass: STATIC_ANALYSIS_SKIP=1"
fi

exit 0
