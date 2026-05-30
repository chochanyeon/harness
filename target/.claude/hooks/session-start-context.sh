#!/usr/bin/env bash
# SessionStart — 세션 컨텍스트 주입 + TDD 토큰 정리
# 차단 없음; additionalContext만 출력

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${HOOK_DIR}/hook-common.sh"

ROOT=$(git_root)
[ -z "$ROOT" ] && ROOT="$PWD"

# ── 1. TDD 토큰 + 턴 버퍼 정리 ──────────────────────────────────────────────
GATES_DIR="${ROOT}/tmp"
rm -f "${GATES_DIR}"/tdd-* 2>/dev/null
SESSION_ID="${CLAUDE_SESSION_ID:-unknown}"
rm -f "/tmp/claude-harness-turn-${SESSION_ID}" 2>/dev/null

# ── 2. 브랜치 ────────────────────────────────────────────────────────────────
BRANCH=$(git -C "$ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")

# ── 3. JaCoCo 커버리지 파싱 ──────────────────────────────────────────────────
COV_TEXT="측정값 없음"
for XML_FILE in "${ROOT}"/*/build/reports/jacoco/test/jacocoTestReport.xml \
                "${ROOT}"/build/reports/jacoco/test/jacocoTestReport.xml; do
  [ -f "$XML_FILE" ] || continue
  LINE_COUNTER=$(grep -o 'type="LINE" missed="[0-9]*" covered="[0-9]*"' "$XML_FILE" 2>/dev/null | tail -1)
  if [ -n "$LINE_COUNTER" ]; then
    MISSED=$(echo "$LINE_COUNTER" | grep -o 'missed="[0-9]*"' | tr -dc '0-9')
    COVERED=$(echo "$LINE_COUNTER" | grep -o 'covered="[0-9]*"' | tr -dc '0-9')
    TOTAL=$(( MISSED + COVERED ))
    if [ "$TOTAL" -gt 0 ]; then
      PCT=$(( COVERED * 100 / TOTAL ))
      COV_TEXT="${PCT}% (${COVERED}/${TOTAL} 라인)"
    fi
  fi
  break
done

# ── 4. 테스트 없는 production 클래스 목록 (최대 10개) ────────────────────────
UNTESTED_LIST=""
UNTESTED_COUNT=0
while IFS= read -r main_java; do
  CLASS=$(basename "$main_java" .java)
  is_unimportant_file "$main_java" && continue
  grep -q '@interface' "$main_java" 2>/dev/null && continue
  if ! find "$ROOT" -path "*/src/test/java/*/${CLASS}Test.java" 2>/dev/null | grep -q .; then
    UNTESTED_COUNT=$(( UNTESTED_COUNT + 1 ))
    [ "$UNTESTED_COUNT" -le 10 ] && UNTESTED_LIST="${UNTESTED_LIST}  - ${CLASS}"$'\n'
  fi
done < <(find "$ROOT" -path "*/src/main/java/*.java" ! -name "package-info.java" 2>/dev/null | head -100)

UNTESTED_SECTION="  없음 (모든 클래스에 테스트 있음)"
if [ "$UNTESTED_COUNT" -gt 0 ]; then
  UNTESTED_SECTION="${UNTESTED_LIST}"
  [ "$UNTESTED_COUNT" -gt 10 ] && UNTESTED_SECTION="${UNTESTED_SECTION}  ... 외 $(( UNTESTED_COUNT - 10 ))개"
fi

# ── 5. 컨텍스트 조립 및 출력 ─────────────────────────────────────────────────
CONTEXT=$(cat <<CONTEXT_EOF
=== DevCenter Harness Context ===
브랜치: ${BRANCH}
커버리지: ${COV_TEXT}
테스트 없는 production 클래스:
${UNTESTED_SECTION}
TDD 원칙:
  1. 새 클래스 작성 전 반드시 XxxTest.java (@Test 포함) 먼저 작성
  2. 테스트가 실패(Red)한 뒤 구현(Green) 시작
  3. Edit 시에도 변경 내용에 대응하는 테스트가 있어야 함
CONTEXT_EOF
)

jq -cn --arg ctx "$CONTEXT" \
  '{"systemMessage":$ctx}'
exit 0
