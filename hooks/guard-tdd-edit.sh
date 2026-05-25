#!/usr/bin/env bash
# PreToolUse(Edit) — production Java 파일 수정 시 TDD 준수 확인 (소프트 게이트)
# 대응 테스트 파일에 변경이 없으면 ask (deny 아님)

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)

[ -z "$FILE_PATH" ] && exit 0

# production Java 파일만 대상
echo "$FILE_PATH" | grep -qE 'src/main/java/.*\.java$' || exit 0

FILENAME=$(basename "$FILE_PATH" .java)

# 테스트 불필요 클래스 제외
echo "$FILENAME" | grep -qE '(DTO|Request|Response|Config|Properties|Exception|Enum|Record|Constants)$' && exit 0

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${HOOK_DIR}/hook-common.sh"

ROOT=$(git_root)
[ -z "$ROOT" ] && exit 0

# 대응 테스트 파일 탐색
TEST_FILE=$(find "$ROOT" -path "*/src/test/java/*/${FILENAME}Test.java" 2>/dev/null | head -1)

if [ -z "$TEST_FILE" ]; then
  log_violation "tdd-edit-ask" "$FILENAME.java" "no test file exists"
  ask "🧪 [TDD] ${FILENAME}.java 수정 시도

  대응 테스트: ${FILENAME}Test.java
  테스트 파일 상태: 존재하지 않음

  이 수정에 새 테스트가 필요한가요?
  → 필요: 테스트 먼저 작성 후 재시도
  → 불필요 (버그 수정/리팩토링): 진행 허용"
fi

# 테스트 파일이 있지만 변경 없음
DIFF=$(git -C "$ROOT" diff HEAD -- "$TEST_FILE" 2>/dev/null)
if [ -z "$DIFF" ]; then
  log_violation "tdd-edit-ask" "$FILENAME.java" "test file not modified"
  ask "🧪 [TDD] ${FILENAME}.java 수정 시도

  대응 테스트: $(basename "$TEST_FILE")
  테스트 파일 변경 여부: 없음 (git diff HEAD 기준)

  이 수정에 새 테스트가 필요한가요?
  → 필요: 테스트 먼저 작성 후 재시도
  → 불필요 (버그 수정/리팩토링): 진행 허용"
fi

exit 0
