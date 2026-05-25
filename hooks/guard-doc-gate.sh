#!/usr/bin/env bash
# PreToolUse(Bash) — feat/* 브랜치 문서화 게이트 (soft gate)
# feat/* 브랜치에서 3번째 커밋부터 /document-feature 실행을 권고한다.
# 첫 1-2 커밋은 허용 (TDD red-green-refactor 사이클 보존).
# push-with-review 스킬이 최종 문서화를 강제하므로 커밋 단계는 ask(소프트)로 운영한다.

INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${HOOK_DIR}/hook-common.sh"

is_git_commit "$CMD" || exit 0

ROOT=$(git_root)
[ -z "$ROOT" ] && exit 0

BRANCH=$(git -C "$ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null)
[[ "$BRANCH" =~ ^feat/ ]] || exit 0

BRANCH_SLUG=$(echo "$BRANCH" | sed 's|feat/||' | sed 's/[^a-zA-Z0-9_-]/-/g')

DOC_EXISTS=$(find "${ROOT}/docs/feat" -name "*.md" ! -name "INDEX.md" 2>/dev/null | \
  xargs grep -lF "$BRANCH_SLUG" 2>/dev/null | head -1)

if [ -z "$DOC_EXISTS" ]; then
  COMMIT_COUNT=$(git -C "$ROOT" log origin/dev..HEAD --oneline 2>/dev/null | wc -l | tr -d ' ')
  if [ "$COMMIT_COUNT" -ge 2 ]; then
    log_violation "doc-gate-ask" "docs/feat/${BRANCH_SLUG}.md" "missing, commit $((COMMIT_COUNT + 1))"
    ask "── 📚 DOCUMENTATION GATE ──────────────

  feat/* 브랜치에서 3번째 커밋부터 문서화 권고

  현재 커밋: $((COMMIT_COUNT + 1))번째
  브랜치: $BRANCH

  권장 작업:
  /document-feature 스킬 실행
  → docs/feat/${BRANCH_SLUG}.md 생성

  💡 TDD 사이클 보존:
  - 첫 1-2 커밋은 자유 (test-impl-refactor)
  - 3번째부터 문서화 권고 (push 전 필수)

  📌 지금 문서화하지 않으면 push-with-review에서 강제됩니다.

──────────────────────────────────────"
  fi
fi

exit 0
