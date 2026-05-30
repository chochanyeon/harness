#!/usr/bin/env bash
# PreToolUse(Edit|Write) — TDD test-first enforcement
# Write → block: 새 파일 생성(Write)은 테스트 클래스가 없으면 차단 (TDD 엄격 적용)
# Edit  → advisory: 기존 파일 수정은 경고만 (이미 작성된 코드까지 차단하면 너무 강함)

INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null)

# Helper: permissionDecision deny JSON → reason is displayed to user
deny() { jq -n --arg r "$1" '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":$r}}'; exit 0; }
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)

[ -z "$FILE" ] && exit 0

# Only .java files
echo "$FILE" | grep -qiE '\.java$' || exit 0

FILE_NORM=$(echo "$FILE" | tr '\\' '/')

# Skip test files
echo "$FILE_NORM" | grep -q '/src/test/' && exit 0

# Skip if no src/main/java segment (e.g. generated sources, resources)
echo "$FILE_NORM" | grep -q '/src/main/java/' || exit 0

# Derive test search directory and class base name
CLASS=$(basename "$FILE_NORM" .java)
TEST_SEARCH_DIR=$(echo "$FILE_NORM" | sed 's|/src/main/java/|/src/test/java/|' | sed 's|/[^/]*\.java$||')

# Accept *Test.java, *Tests.java, *IT.java naming conventions
TEST_EXISTS=$(find "$TEST_SEARCH_DIR" -maxdepth 1 \
  \( -name "${CLASS}Test.java" -o -name "${CLASS}Tests.java" -o -name "${CLASS}IT.java" \) \
  2>/dev/null | head -1)

if [ -z "$TEST_EXISTS" ]; then
  if [ "$TOOL" = "Write" ]; then
    DENY_MSG=$(cat <<MSG
── 🧪 TDD PROTOCOL ────────────────────

  새 클래스 작성 전 테스트가 먼저입니다.

  대상: ${CLASS}.java
  기대: ${CLASS}Test.java

  ① 테스트 클래스 먼저 작성
  ② 테스트 실패 확인
  ③ 구현 시작

──────────────────────────────────────
MSG
)
    deny "$DENY_MSG"
  else
    echo "[TDD] ${CLASS}에 대한 테스트 클래스 없음 — 테스트를 먼저 작성하는 것을 권장합니다: ${TEST_SEARCH_DIR}/${CLASS}Test.java" >&2
  fi
fi

exit 0
