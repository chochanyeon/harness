#!/usr/bin/env bash
# PreToolUse(Write) — TDD 토큰 메커니즘
# 테스트 파일 Write → 토큰 생성, 구현 파일 Write → 토큰 확인 (없으면 deny)

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
CONTENT=$(echo "$INPUT" | jq -r '.tool_input.content // empty' 2>/dev/null)

[ -z "$FILE_PATH" ] && exit 0

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${HOOK_DIR}/hook-common.sh"

ROOT=$(git_root)
GATES_DIR="${ROOT}/tmp"
mkdir -p "$GATES_DIR"

FILENAME=$(basename "$FILE_PATH" .java)

# ── 테스트 파일 Write ────────────────────────────────────────────────────────
if echo "$FILE_PATH" | grep -qE 'src/test/java/.*Test\.java$'; then
  if echo "$CONTENT" | grep -q '@Test'; then
    CLASS_NAME="${FILENAME%Test}"
    touch "${GATES_DIR}/tdd-${CLASS_NAME}"
  fi
  exit 0
fi

# ── 구현 파일 Write ──────────────────────────────────────────────────────────
if echo "$FILE_PATH" | grep -qE 'src/main/java/.*\.java$'; then
  # 테스트 불필요 클래스 제외
  if echo "$FILENAME" | grep -qE '(DTO|Request|Response|Config|Properties|Exception|Enum|Record|Constants)$'; then
    exit 0
  fi

  TOKEN="${GATES_DIR}/tdd-${FILENAME}"
  if [ -f "$TOKEN" ]; then
    rm -f "$TOKEN"
    exit 0
  fi

  log_violation "tdd-write" "$FILENAME.java" "no token found"
  deny "── 🧪 TDD PROTOCOL ────────────────────

  구현 파일 작성 전 테스트가 먼저입니다.

  대상: ${FILENAME}.java
  필요: ${FILENAME}Test.java (@Test 포함)

  ① ${FILENAME}Test.java 작성 (@Test 최소 1개)
  ② 테스트 실패 확인
  ③ 구현 시작

──────────────────────────────────────"
fi

exit 0
