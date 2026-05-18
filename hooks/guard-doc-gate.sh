#!/usr/bin/env bash
# PreToolUse(Bash) — feat/* 브랜치 문서화 게이트
# feat/* 브랜치에서 3번째 커밋부터 /document-feature 실행을 요구한다.
# 첫 1-2 커밋은 허용 (TDD red-green-refactor 사이클 보존).

INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)

[ "$DOC_SKIP" = "1" ] && exit 0

deny() {
  jq -n --arg r "$1" '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":$r}}'
  exit 0
}

# git commit 감지
CMD_STRIPPED=$(echo "$CMD" | sed "s/'[^']*'//g" | sed 's/"[^"]*"//g')
CMD_NORMALIZED=$(echo "$CMD_STRIPPED" | sed 's/git[[:space:]]\+-C[[:space:]]\+[^[:space:]]*/git/g')
if ! echo "$CMD_NORMALIZED" | grep -qE '(^|[|;&[:space:]])git[[:space:]]+commit([[:space:]]|$)'; then
  exit 0
fi

ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
[ -z "$ROOT" ] && exit 0

BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
[[ "$BRANCH" =~ ^feat/ ]] || exit 0

BRANCH_SLUG=$(echo "$BRANCH" | sed 's|feat/||' | sed 's/[^a-zA-Z0-9_-]/-/g')

DOC_EXISTS=$(find "${ROOT}/docs/feat" -name "*.md" ! -name "INDEX.md" 2>/dev/null | \
  xargs grep -lF "$BRANCH_SLUG" 2>/dev/null | head -1)

if [ -z "$DOC_EXISTS" ]; then
  COMMIT_COUNT=$(git log origin/dev..HEAD --oneline 2>/dev/null | wc -l)
  if [ "$COMMIT_COUNT" -ge 2 ]; then
    deny "── 📚 DOCUMENTATION GATE ──────────────

  feat/* 브랜치에서 3번째 커밋부터 문서화 필수

  현재 커밋: $((COMMIT_COUNT + 1))번째
  브랜치: $BRANCH

  필요 작업:
  /document-feature 스킬 실행
  → docs/feat/${BRANCH_SLUG}.md 생성

  💡 TDD 사이클 보존:
  - 첫 1-2 커밋은 자유 (test-impl-refactor)
  - 3번째부터 문서화 강제

  💡 긴급 우회: DOC_SKIP=1

──────────────────────────────────────"
  fi
fi

exit 0
