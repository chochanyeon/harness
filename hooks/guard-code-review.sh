#!/usr/bin/env bash
# PreToolUse(Bash) — git commit 시 code-review 결과 검증
# 역할: /code-review 결과가 Critical 0 + Major ≤2 일 때만 허용

INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${HOOK_DIR}/hook-common.sh"

# git commit이 아니면 즉시 종료
is_git_commit "$CMD" || exit 0

ROOT=$(git_root)
[ -z "$ROOT" ] && exit 0

# ── Check 0: 의미 있는 변경(리뷰 대상 파일)이 있는지 확인 ──
# Java production 코드 변경 없으면(chore, docs 등) 리뷰 불필요
HAS_MEANINGFUL=0
while IFS= read -r f; do
  [ -z "$f" ] && continue
  is_unimportant_file "$f" || { HAS_MEANINGFUL=1; break; }
done < <(git -C "$ROOT" diff --cached --name-only 2>/dev/null)

[ "$HAS_MEANINGFUL" -eq 0 ] && exit 0

RESULT_FILE="${ROOT}/tmp/review-result.json"

# ── Check 1: 결과 파일 존재 여부 ──
if [ ! -f "$RESULT_FILE" ]; then
  log_violation "code-review-deny" "review-result.json" "file missing"
  deny "── 🔍 CODE REVIEW REQUIRED ────────────

  커밋 전 /code-review 실행이 필요합니다.

  ① /code-review 스킬 실행
  ② Critical 0 + Major ≤2 확인
  ③ 커밋 재시도

──────────────────────────────────────"
fi

# ── Check 2: JSON 파싱 ──
CRITICAL=$(jq -r '.critical // -1' "$RESULT_FILE" 2>/dev/null)
MAJOR=$(jq -r '.major // -1' "$RESULT_FILE" 2>/dev/null)
TIMESTAMP=$(jq -r '.timestamp // empty' "$RESULT_FILE" 2>/dev/null)

if [ "$CRITICAL" = "-1" ] || [ "$MAJOR" = "-1" ]; then
  rm -f "$RESULT_FILE"
  log_violation "code-review-deny" "review-result.json" "file corrupted"
  deny "── ⚠️ 결과 파일 손상 ─────────────────

  review-result.json이 손상되었습니다.
  /code-review를 다시 실행하세요.

──────────────────────────────────────"
fi

# ── Check 3: 시간 만료 (60분 TTL) ──
if [ -n "$TIMESTAMP" ]; then
  REVIEW_EPOCH=$(node -e "process.stdout.write(String(Math.floor(new Date('$TIMESTAMP').getTime()/1000)))" 2>/dev/null \
    || date -d "$TIMESTAMP" +%s 2>/dev/null \
    || date -j -f "%Y-%m-%dT%H:%M:%S" "${TIMESTAMP%%Z*}" +%s 2>/dev/null \
    || echo 0)
  NOW_EPOCH=$(date +%s)
  AGE=$(( NOW_EPOCH - REVIEW_EPOCH ))

  if [ "$AGE" -gt 3600 ]; then
    # 의미 있는 변경(커버리지 대상 파일)이 있는지 확인 — 없으면 재리뷰 불필요
    HAS_MEANINGFUL=0
    while IFS= read -r f; do
      [ -z "$f" ] && continue
      is_unimportant_file "$f" || { HAS_MEANINGFUL=1; break; }
    done < <(git -C "$ROOT" diff --cached --name-only 2>/dev/null)

    if [ "$HAS_MEANINGFUL" -eq 0 ]; then
      # 제외 대상 파일만 변경 → 만료돼도 재리뷰 생략
      rm -f "$RESULT_FILE"
      exit 0
    fi

    rm -f "$RESULT_FILE"
    log_violation "code-review-deny" "review-result.json" "expired ${AGE}s"
    deny "── ⏰ 리뷰 만료 ────────────────────────

  리뷰가 60분 이상 경과했습니다 (${AGE}초).
  /code-review를 다시 실행하세요.

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
  log_violation "code-review-deny" "review-result.json" "critical=${CRITICAL} major=${MAJOR}"
  deny "── 🔍 CODE REVIEW 미통과 ────────────

  ${VERDICT}

  Critical: ${CRITICAL}개 (기준: 0)
  Major:    ${MAJOR}개 (기준: ≤2)

  ① 지적된 이슈 수정
  ② /code-review 재실행
  ③ 커밋 재시도

──────────────────────────────────────"
fi

# ✅ 통과 → 결과 파일 삭제 (재사용 방지)
rm -f "$RESULT_FILE"
exit 0
