#!/usr/bin/env bash
# PreToolUse(Bash) — git commit 시 Java 파일 정적 분석 (Checkstyle + PMD)
# 역할: 변경된 main Java 파일이 있을 때 CI와 동일한 정적 분석 실행

INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${HOOK_DIR}/hook-common.sh"

# git commit이 아니면 즉시 종료
is_git_commit "$CMD" || exit 0

ROOT=$(git_root)
[ -z "$ROOT" ] && exit 0

# staged main Java 파일이 없으면 스킵
JAVA_CHANGES=$(git -C "$ROOT" diff --cached --name-only --diff-filter=ACMR 2>/dev/null \
  | grep '\.java$' \
  | grep 'src/main/java')
[ -z "$JAVA_CHANGES" ] && exit 0

# 변경된 모듈만 분석
MODULES=$(echo "$JAVA_CHANGES" | cut -d'/' -f1 | sort -u)
TASKS=""
for MODULE in $MODULES; do
  TASKS="$TASKS :${MODULE}:checkstyleMain :${MODULE}:pmdMain"
done

OUTPUT=$("${ROOT}/gradlew" -p "$ROOT" $TASKS -q 2>&1)
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
  SUMMARY=$(echo "$OUTPUT" | tail -20)
  log_violation "static-analysis-deny" "checkstyle/pmd" "modules: ${MODULES}"
  deny "Checkstyle/PMD 위반 발견. 커밋 전 수정 필요.

$SUMMARY"
fi

exit 0
