#!/usr/bin/env bash
# PreToolUse(Bash) — git commit 시 변경된 .java 파일의 커버리지 체크
# 역할: 변경된 파일만 대상으로 JaCoCo 실행, 임계값 미달 시 차단

INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)

# Emergency bypass
[ "$COVERAGE_SKIP" = "1" ] && exit 0

deny() {
    jq -n --arg r "$1" '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":$r}}'
    exit 0
}

# git commit 감지 (guard-git-commit.sh와 동일 로직)
CMD_STRIPPED=$(echo "$CMD" | sed "s/'[^']*'//g" | sed 's/"[^"]*"//g')
CMD_NORMALIZED=$(echo "$CMD_STRIPPED" | sed 's/git[[:space:]]\+-C[[:space:]]\+[^[:space:]]*/git/g')
if ! echo "$CMD_NORMALIZED" | grep -qE '(^|[|;&[:space:]])git[[:space:]]+commit([[:space:]]|$)'; then
  exit 0
fi

ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
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

    # 변경된 클래스 목록 (패키지.클래스 형식)
    CLASSES=$(echo "$CHANGED_JAVA" | grep "^${MODULE}/" | \
        sed 's|src/main/java/||' | sed 's|\.java$||' | tr '/' '.')

    # JaCoCo 실행 (전체 모듈 테스트 → 리포트 생성 → verification)
    cd "${ROOT}/${MODULE}" || continue

    # 1. 테스트 실행 + 리포트 생성 (5분 타임아웃)
    timeout 300 ./gradlew test jacocoTestReport --console=plain --quiet >/dev/null 2>&1
    TEST_EXIT=$?
    if [ $TEST_EXIT -eq 124 ]; then
        # Timeout
        FAILED_MODULES="${FAILED_MODULES}
  📦 ${MODULE} (TIMEOUT)
     테스트 실행이 5분을 초과했습니다.
     긴 테스트를 최적화하거나 COVERAGE_SKIP=1로 우회하세요.
"
        continue
    fi

    # 2. Verification (임계값 체크)
    VERIFY_OUTPUT=$(./gradlew jacocoTestCoverageVerification --console=plain 2>&1)

    if echo "$VERIFY_OUTPUT" | grep -q "Rule violated"; then
        VIOLATIONS=$(echo "$VERIFY_OUTPUT" | grep -A 3 "Rule violated" | head -10)
        REPORT_PATH="${ROOT}/${MODULE}/build/reports/jacoco/test/html/index.html"

        FAILED_MODULES="${FAILED_MODULES}
  📦 ${MODULE} (임계값: ${MIN_COV})
     변경된 클래스:
$(echo "$CLASSES" | sed 's/^/       - /')

     리포트: file://${REPORT_PATH}
"
    fi
done

if [ -n "$FAILED_MODULES" ]; then
    DENY_MSG=$(cat <<MSG
── 🧪 TEST COVERAGE GATE ──────────────

  다음 모듈의 커버리지가 임계값에 미달합니다:
${FAILED_MODULES}
  해결 방법:
  ① 변경된 클래스에 대한 테스트 추가
  ② ./gradlew :<module>:test jacocoTestReport 확인
  ③ build/reports/jacoco/test/html/index.html 확인

  🔄 점진적 개선 전략:
  - 변경된 코드만 검증 (레거시는 영향 없음)
  - 테스트 추가 후 재커밋

──────────────────────────────────────
MSG
)
    deny "$DENY_MSG"
fi

exit 0
