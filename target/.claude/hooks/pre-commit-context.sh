#!/usr/bin/env bash
# PreToolUse(Bash) — git commit 감지 시 커밋 전 컨텍스트 주입
# 차단 없음; additionalContext만 출력 (Layer 3 게이트보다 먼저 실행)

INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${HOOK_DIR}/hook-common.sh"

# git commit이 아니면 즉시 종료
is_git_commit "$CMD" || exit 0

ROOT=$(git_root)
[ -z "$ROOT" ] && exit 0

# staged main Java 파일
STAGED_JAVA=$(git -C "$ROOT" diff --cached --name-only --diff-filter=ACMR 2>/dev/null | grep 'src/main/java/.*\.java$' || true)

# 테스트 없이 수정된 클래스 목록
UNTESTED_MSG="  모든 변경 클래스에 테스트 변경 확인 ✅"
if [ -n "$STAGED_JAVA" ]; then
  UNTESTED_CLASSES=""
  while IFS= read -r java_file; do
    [ -z "$java_file" ] && continue
    CLASS=$(basename "$java_file" .java)
    TEST_FILE=$(find "$ROOT" -path "*/src/test/java/*/${CLASS}Test.java" 2>/dev/null | head -1)
    if [ -n "$TEST_FILE" ]; then
      DIFF=$(git -C "$ROOT" diff HEAD -- "$TEST_FILE" 2>/dev/null)
      [ -n "$DIFF" ] && continue
      UNTESTED_CLASSES="${UNTESTED_CLASSES}  - ${java_file} ($(basename "$TEST_FILE") 변경 없음)"$'\n'
    else
      UNTESTED_CLASSES="${UNTESTED_CLASSES}  - ${java_file} (테스트 파일 없음)"$'\n'
    fi
  done <<< "$STAGED_JAVA"
  [ -n "$UNTESTED_CLASSES" ] && UNTESTED_MSG="${UNTESTED_CLASSES}"
fi

# JaCoCo 커버리지
COV_TEXT="측정값 없음"
for XML_FILE in "${ROOT}"/*/build/reports/jacoco/test/jacocoTestReport.xml \
                "${ROOT}"/build/reports/jacoco/test/jacocoTestReport.xml; do
  [ -f "$XML_FILE" ] || continue
  LINE_COUNTER=$(grep -o 'type="LINE" missed="[0-9]*" covered="[0-9]*"' "$XML_FILE" 2>/dev/null | tail -1)
  if [ -n "$LINE_COUNTER" ]; then
    MISSED=$(echo "$LINE_COUNTER" | grep -o 'missed="[0-9]*"' | tr -dc '0-9')
    COVERED=$(echo "$LINE_COUNTER" | grep -o 'covered="[0-9]*"' | tr -dc '0-9')
    TOTAL=$(( MISSED + COVERED ))
    [ "$TOTAL" -gt 0 ] && COV_TEXT="$(( COVERED * 100 / TOTAL ))% (최근 측정값)"
  fi
  break
done

CONTEXT=$(cat <<CONTEXT_EOF
=== 커밋 전 체크 ===
테스트 없이 수정된 production 클래스:
${UNTESTED_MSG}
커버리지: ${COV_TEXT}
CONTEXT_EOF
)

jq -cn --arg ctx "$CONTEXT" \
  '{"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":$ctx}}'
exit 0
