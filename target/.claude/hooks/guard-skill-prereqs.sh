#!/usr/bin/env bash
# PreToolUse(Skill) — 스킬 실행 전제조건 검사

INPUT=$(cat)
SKILL=$(echo "$INPUT" | jq -r '.tool_input.skill // empty' 2>/dev/null)

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${HOOK_DIR}/hook-common.sh"

ROOT=$(git_root)

case "$SKILL" in
  code-review|code-review:code-review)
    [ -z "$ROOT" ] && exit 0
    DIFF=$(git -C "$ROOT" diff HEAD --stat 2>/dev/null)
    STAGED=$(git -C "$ROOT" diff --cached --stat 2>/dev/null)
    UNPUSHED=$(git -C "$ROOT" log origin/dev..HEAD --oneline 2>/dev/null)
    if [ -z "$DIFF" ] && [ -z "$STAGED" ] && [ -z "$UNPUSHED" ]; then
      log_violation "skill-prereq-deny" "code-review" "no changes"
      deny "변경 사항 없음. code-review는 uncommitted/staged 변경 또는 미푸시 커밋이 있어야 합니다.
git status 또는 git log origin/dev..HEAD로 현재 상태를 확인하세요."
    fi
    ;;

  subagent-driven-development)
    [ -z "$ROOT" ] && exit 0
    PLANS_DIR="${ROOT}/docs/superpowers/plans"
    LATEST_PLAN=$(find "$PLANS_DIR" -name "*.md" 2>/dev/null | sort | tail -1)
    if [ -z "$LATEST_PLAN" ]; then
      log_violation "skill-prereq-deny" "subagent-driven-development" "no plan file"
      deny "── ⚠️ PLAN REQUIRED ────────────────────

  subagent-driven-development 실행 전 계획 파일이 필요합니다.

  필요 작업:
  1. /planning-and-task-breakdown 스킬 실행
  2. docs/superpowers/plans/ 에 계획 파일 생성
  3. subagent-driven-development 재실행

──────────────────────────────────────"
    fi
    ;;
esac

exit 0
