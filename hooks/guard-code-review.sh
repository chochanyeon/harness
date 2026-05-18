#!/usr/bin/env bash
# PreToolUse(Bash) — git commit 시 code-review 결과 검증
# 역할: /code-review 결과가 Critical 0 + Major ≤2 일 때만 허용

INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)

[ "$REVIEW_SKIP" = "1" ] && exit 0

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

RESULT_FILE="${ROOT}/.claude/review-result.json"

# ── Check 1: 결과 파일 존재 여부 ──
if [ ! -f "$RESULT_FILE" ]; then
  deny "── 🔍 CODE REVIEW REQUIRED ────────────

  커밋 전 /code-review 실행이 필요합니다.

  ① /code-review 스킬 실행
  ② Critical 0 + Major ≤2 확인
  ③ 커밋 재시도

  💡 긴급 우회: REVIEW_SKIP=1

──────────────────────────────────────"
fi

# ── Check 2: JSON 파싱 ──
CRITICAL=$(jq -r '.critical // -1' "$RESULT_FILE" 2>/dev/null)
MAJOR=$(jq -r '.major // -1' "$RESULT_FILE" 2>/dev/null)
TIMESTAMP=$(jq -r '.timestamp // empty' "$RESULT_FILE" 2>/dev/null)

if [ "$CRITICAL" = "-1" ] || [ "$MAJOR" = "-1" ]; then
  rm -f "$RESULT_FILE"
  deny "── ⚠️ 결과 파일 손상 ─────────────────

  review-result.json이 손상되었습니다.
  /code-review를 다시 실행하세요.

  💡 긴급 우회: REVIEW_SKIP=1

──────────────────────────────────────"
fi

# ── Check 3: 시간 만료 (30분 TTL) ──
if [ -n "$TIMESTAMP" ]; then
  REVIEW_EPOCH=$(date -d "$TIMESTAMP" +%s 2>/dev/null || date -j -f "%Y-%m-%dT%H:%M:%S" "${TIMESTAMP%%Z*}" +%s 2>/dev/null || echo 0)
  NOW_EPOCH=$(date +%s)
  AGE=$(( NOW_EPOCH - REVIEW_EPOCH ))

  if [ "$AGE" -gt 3600 ]; then
    rm -f "$RESULT_FILE"
    deny "── ⏰ 리뷰 만료 ────────────────────────

  리뷰가 60분 이상 경과했습니다 (${AGE}초).
  /code-review를 다시 실행하세요.

  💡 긴급 우회: REVIEW_SKIP=1

──────────────────────────────────────"
  fi
fi

# ── Check 4: Critical + Major 기준 (AGENTS.md 정렬) ──
if [ "$CRITICAL" -gt 0 ] || [ "$MAJOR" -gt 2 ]; then
  VERDICT=""
  if [ "$CRITICAL" -gt 0 ]; then
    VERDICT="🔴 Critical 이슈 발견"
  elif [ "$MAJOR" -gt 2 ]; then
    VERDICT="🟡 Major 이슈 과다"
  fi

  rm -f "$RESULT_FILE"
  deny "── 🔍 CODE REVIEW 미통과 ────────────

  ${VERDICT}

  Critical: ${CRITICAL}개 (기준: 0)
  Major:    ${MAJOR}개 (기준: ≤2)

  ① 지적된 이슈 수정
  ② /code-review 재실행
  ③ 커밋 재시도

  💡 긴급 우회: REVIEW_SKIP=1

──────────────────────────────────────"
fi

# ✅ 통과 → 결과 파일 삭제 (재사용 방지)
rm -f "$RESULT_FILE"
exit 0
