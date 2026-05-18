#!/usr/bin/env bash
# ⚠️  DISABLED: 이 hook은 settings.json에서 비활성화되었습니다
# ⚠️  이유: /push-with-review 스킬 호출 자체가 승인으로 간주
# ⚠️  재활성화: settings.json PreToolUse Bash hooks에 다시 추가
#
# PreToolUse(Bash) — git commit 승인 게이트
# 역할: 사용자 승인 없는 커밋 차단
#
# 허용 조건 (우선순위 순):
#   1. ~/.claude/hooks/.commit-gate-session 존재 → 하네스 모드 (만료 없음, 하네스 종료 시 삭제)
#   2. ~/.claude/hooks/.commit-gate 존재 + 10분 이내 → 단건 승인 모드 (사용 후 삭제)
#
# 하네스 시작: 사용자에게 승인받은 후 `touch .claude/hooks/gates/.commit-gate-session`
# 하네스 종료: `rm -f ~/.claude/hooks/.commit-gate-session`
# 단건 승인:   사용자에게 승인받은 후 `touch .claude/hooks/gates/.commit-gate`

INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)

# Helper: permissionDecision deny JSON → reason is displayed to user
deny() { jq -n --arg r "$1" '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":$r}}'; exit 0; }

# git commit 패턴 감지 (git commit-msg 등 서브커맨드는 제외)
# 따옴표 내부의 git commit (예: echo "git commit") 은 제거 후 검사
CMD_STRIPPED=$(echo "$CMD" | sed "s/'[^']*'//g" | sed 's/"[^"]*"//g')
# Normalize "git -C <path>" → "git" so the subcommand check works regardless of global flags
CMD_NORMALIZED=$(echo "$CMD_STRIPPED" | sed 's/git[[:space:]]\+-C[[:space:]]\+[^[:space:]]*/git/g')
if ! echo "$CMD_NORMALIZED" | grep -qE '(^|[|;&[:space:]])git[[:space:]]+commit([[:space:]]|$)'; then
  exit 0
fi

# 하네스 모드: 만료 없는 세션 게이트
ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
GATE_DIR="${ROOT}/.claude/hooks/gates"
SESSION_GATE="${GATE_DIR}/.commit-gate-session"
if [ -f "$SESSION_GATE" ]; then
  exit 0
fi

# 단건 승인 모드: 10분 유효 (mv로 원자적 소비 — TOCTOU 방지)
GATE_FILE="${GATE_DIR}/.commit-gate"
GATE_TMP="${GATE_FILE}.consumed.$$"
if mv "$GATE_FILE" "$GATE_TMP" 2>/dev/null; then
  FRESH=$(find "$GATE_TMP" -mmin -10 2>/dev/null)
  rm -f "$GATE_TMP"
  if [ -n "$FRESH" ]; then
    exit 0
  fi
  DENY_MSG=$(cat <<'MSG'
── ⏰ 커밋 승인 만료 ──────────────────

  10분 초과. 다시 제시 후 승인을 받으세요.

  touch .claude/hooks/gates/.commit-gate

──────────────────────────────────────
MSG
)
  deny "$DENY_MSG"
fi

# Workflow Enforcement: warn if no plan exists for feat/* branches
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
if echo "$BRANCH" | grep -q "^feat/"; then
  PLAN_COUNT=$(find "${ROOT}/docs/superpowers/plans" -name "*.md" 2>/dev/null | wc -l)
  if [ "$PLAN_COUNT" -eq 0 ]; then
    echo "[Workflow] feat/* branch with no plan in docs/superpowers/plans/ — consider task-planning workflow." >&2
  fi
fi

# Phase 5 — Test Enforcement: warn if main Java files staged without any tests
STAGED=$(git diff --cached --name-only 2>/dev/null)
MAIN_JAVA=$(echo "$STAGED" | grep -E 'src/main/java/.*\.java$' | head -1)
if [ -n "$MAIN_JAVA" ]; then
  MODULE=$(echo "$MAIN_JAVA" | cut -d'/' -f1)
  TEST_DIR="${ROOT}/${MODULE}/src/test/java"
  if [ -d "$TEST_DIR" ]; then
    TEST_COUNT=$(find "$TEST_DIR" -name "*Test.java" 2>/dev/null | wc -l)
    if [ "$TEST_COUNT" -eq 0 ]; then
      echo "[TDD] ${MODULE}에 테스트 클래스 없음 — 구현 전 테스트를 먼저 작성하세요 (test-first.md)." >&2
    fi
  fi
fi

# Phase 6 — Coverage Enforcement는 settings.json에 독립 훅으로 등록됨 (guard-coverage.sh)

# Phase 4 — Documentation Gate: suggest /document-feature when architectural files touched
DOC_TRIGGER=$(echo "$STAGED" | grep -E '(Controller|Entity|Repository)\.java$|build\.gradle(\.kts)?$|schema[^/]*\.(sql|xml)$|ddl[^/]*\.sql$|migrate[^/]*\.sql$' | head -3)
BRANCH_SLUG=$(echo "$BRANCH" | sed 's|feat/||' | sed 's/[^a-zA-Z0-9_-]//g')
DOC_FILE_EXISTS=""
if [ -n "$BRANCH_SLUG" ]; then
  DOC_FILE_EXISTS=$(find "${ROOT}/docs/feat" -name "*.md" ! -name "INDEX.md" 2>/dev/null | \
    xargs grep -lF "$BRANCH_SLUG" 2>/dev/null | head -1)
fi
if [ -n "$DOC_TRIGGER" ] && [ -z "$DOC_FILE_EXISTS" ]; then
  echo "[Workflow] Architectural changes detected (${DOC_TRIGGER}) — consider /document-feature before pushing." >&2
fi

DENY_MSG=$(cat <<'MSG'
── 🚫 GIT COMMIT PROTOCOL ─────────────

  커밋 전 사용자 승인이 필요합니다.

  ① 변경 내용 + 메시지를 사용자에게 제시
  ② 명시적 승인 획득
  ③ touch .claude/hooks/gates/.commit-gate
  ④ 커밋 재시도

──────────────────────────────────────
MSG
)
deny "$DENY_MSG"
