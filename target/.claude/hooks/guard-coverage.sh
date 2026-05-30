#!/usr/bin/env bash
# PreToolUse(Bash) — git commit 시 변경된 .java 파일의 커버리지 체크
# 역할: 변경된 파일만 대상으로 JaCoCo 실행, 임계값 미달 시 ask

INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${HOOK_DIR}/hook-common.sh"

# git commit이 아니면 즉시 종료
is_git_commit "$CMD" || exit 0

ROOT=$(git_root)
[ -z "$ROOT" ] && exit 0

STAGED=$(git diff --cached --name-only 2>/dev/null)
CHANGED_JAVA=$(echo "$STAGED" | grep -E 'src/main/java/.*\.java$')

[ -z "$CHANGED_JAVA" ] && exit 0

# 변경된 파일이 속한 모듈 추출
MODULES=$(echo "$CHANGED_JAVA" | cut -d'/' -f1 | sort -u)

FAILED_MODULES=""
for MODULE in $MODULES; do
    MIN_COV=$(grep "^${MODULE}.minCoverage=" "${ROOT}/gradle.properties" 2>/dev/null | cut -d'=' -f2)
    [ -z "$MIN_COV" ] && MIN_COV="0.60"

    CLASSES=$(echo "$CHANGED_JAVA" | grep "^${MODULE}/" | \
        sed 's|src/main/java/||' | sed 's|\.java$||' | tr '/' '.')

    GRADLEW="${ROOT}/${MODULE}/gradlew"
    [ ! -f "$GRADLEW" ] && GRADLEW="${ROOT}/gradlew"
    [ ! -f "$GRADLEW" ] && continue

    # 테스트 실행 + 리포트 생성 (5분 타임아웃)
    timeout 300 "$GRADLEW" -p "${ROOT}/${MODULE}" test jacocoTestReport --console=plain --quiet >/dev/null 2>&1
    TEST_EXIT=$?
    if [ $TEST_EXIT -eq 124 ]; then
        FAILED_MODULES="${FAILED_MODULES}
  📦 ${MODULE} (TIMEOUT)
     테스트 실행이 5분을 초과했습니다.
"
        continue
    fi

    # Verification (임계값 체크)
    VERIFY_OUTPUT=$("$GRADLEW" -p "${ROOT}/${MODULE}" jacocoTestCoverageVerification --console=plain 2>&1)

    if echo "$VERIFY_OUTPUT" | grep -q "Rule violated"; then
        VIOLATING_CLASSES=$(echo "$VERIFY_OUTPUT" | grep "Rule violated for class" | \
            sed 's/.*Rule violated for class \([^ :]*\).*/\1/' | sort -u)

        FAILED_CHANGED=""
        for CHANGED_CLASS in $CLASSES; do
            ESCAPED=$(echo "$CHANGED_CLASS" | sed 's/\./\\./g')
            if echo "$VIOLATING_CLASSES" | grep -qE "^${ESCAPED}(\\$|$)"; then
                VIOLATION_LINE=$(echo "$VERIFY_OUTPUT" | grep -F "Rule violated for class ${CHANGED_CLASS}" | grep "lines covered" | head -1)
                if [ -n "$VIOLATION_LINE" ]; then
                    CURRENT=$(echo "$VIOLATION_LINE" | sed 's/.*ratio is \([0-9.]*\).*/\1/')
                    TARGET=$(echo "$VIOLATION_LINE" | sed 's/.*minimum is \([0-9.]*\).*/\1/')
                    CURRENT_PCT=$(awk "BEGIN{printf \"%.1f\", ${CURRENT} * 100}" 2>/dev/null || echo "?")
                    TARGET_PCT=$(awk "BEGIN{printf \"%.1f\", ${TARGET} * 100}" 2>/dev/null || echo "?")
                    FAILED_CHANGED="${FAILED_CHANGED}       - ${CHANGED_CLASS} (현재: ${CURRENT_PCT}%, 목표: ${TARGET_PCT}%)\n"
                else
                    FAILED_CHANGED="${FAILED_CHANGED}       - ${CHANGED_CLASS}\n"
                fi
            fi
        done

        if [ -n "$FAILED_CHANGED" ]; then
            REPORT_PATH="${ROOT}/${MODULE}/build/reports/jacoco/test/html/index.html"
            FAILED_MODULES="${FAILED_MODULES}
  📦 ${MODULE} (임계값: ${MIN_COV})
     변경된 클래스 중 미달:
$(printf "%b" "$FAILED_CHANGED")
     리포트: file://${REPORT_PATH}
"
        fi
    fi
done

if [ -n "$FAILED_MODULES" ]; then
    log_violation "bypass-ask" "coverage" "modules: $(echo "$FAILED_MODULES" | grep -o '📦 [^ ]*' | tr '\n' ',')"
    ask "── 🧪 TEST COVERAGE GATE ──────────────

  다음 모듈의 커버리지가 임계값에 미달합니다:
${FAILED_MODULES}
  해결 방법:
  ① 변경된 클래스에 대한 테스트 추가
  ② ./gradlew :<module>:test jacocoTestReport 확인
  ③ build/reports/jacoco/test/html/index.html 확인

  🔄 우회 사유가 있나요? (레거시 코드, 긴급 배포 등)
  → 있음: 진행 허용
  → 없음: 테스트 추가 후 재커밋

──────────────────────────────────────"
fi

exit 0
