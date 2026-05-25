#!/usr/bin/env bash
# hook-common.sh — 공통 라이브러리 (모든 hook에서 source로 사용)
# 직접 실행 금지: 함수 정의만 포함
[[ "${BASH_SOURCE[0]}" == "${0}" ]] && { echo "hook-common.sh: source only, do not execute directly" >&2; exit 1; }

# ── deny / ask ──────────────────────────────────────────────────────────────

# deny "메시지" [hookEventName]
# hookEventName 기본값: PreToolUse
# exits process after emitting JSON
deny() {
  local reason="$1"
  local event="${2:-PreToolUse}"
  jq -n --arg r "$reason" --arg e "$event" \
    '{"hookSpecificOutput":{"hookEventName":$e,"permissionDecision":"deny","permissionDecisionReason":$r}}'
  exit 0
}

# ask "메시지" [hookEventName]
# hookEventName 기본값: PreToolUse
# exits process after emitting JSON
ask() {
  local reason="$1"
  local event="${2:-PreToolUse}"
  jq -n --arg r "$reason" --arg e "$event" \
    '{"hookSpecificOutput":{"hookEventName":$e,"permissionDecision":"ask","permissionDecisionReason":$r}}'
  exit 0
}

# ── git_root ─────────────────────────────────────────────────────────────────

# git_root — git 루트 경로 반환. 실패 시 빈 문자열
git_root() {
  git rev-parse --show-toplevel 2>/dev/null
}

# ── is_git_commit ─────────────────────────────────────────────────────────────

# is_git_commit "명령어" — git commit 명령이면 0, 아니면 1 반환
is_git_commit() {
  local cmd="$1"
  # git -C <path> → git 으로 정규화 (따옴표 제거보다 먼저: 공백 포함 Windows 경로 처리)
  local stripped
  stripped=$(echo "$cmd" | sed 's/git[[:space:]]\+-C[[:space:]]\+\("[^"]*"\|'"'"'[^'"'"']*'"'"'\|[^[:space:]]*\)/git/g')
  # 따옴표 안 내용 제거 (커밋 메시지 등이 commit 키워드를 포함하지 않도록)
  local normalized
  normalized=$(echo "$stripped" | sed "s/'[^']*'//g" | sed 's/"[^"]*"//g')
  if echo "$normalized" | grep -qE '(^|[|;&[:space:]])git[[:space:]]+commit([[:space:]]|$)'; then
    return 0
  fi
  return 1
}

# ── log_violation ────────────────────────────────────────────────────────────

# log_violation "type" "file" "detail"
# 세 군데에 기록:
#   1. ~/.claude/hooks/violations.jsonl        — 글로벌 이력 (harness-stats 호환)
#   2. ~/.claude/hooks/sessions/${SESSION_ID}.jsonl — 세션별 누적
#   3. /tmp/claude-harness-turn-${SESSION_ID}  — 턴별 버퍼 (Stop 훅이 읽고 초기화)
log_violation() {
  local type="$1"
  local file="$2"
  local detail="$3"
  local session_id="${CLAUDE_SESSION_ID:-unknown}"
  local violations_file="$HOME/.claude/hooks/violations.jsonl"
  local sessions_dir="$HOME/.claude/hooks/sessions"

  mkdir -p "$(dirname "$violations_file")"
  mkdir -p "$sessions_dir"

  local ts branch
  ts=$(TZ=UTC date +"%Y-%m-%dT%H:%M:%SZ")
  branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")

  local entry
  entry=$(jq -cn \
    --arg ts "$ts" \
    --arg type "$type" \
    --arg file "$file" \
    --arg branch "$branch" \
    --arg detail "$detail" \
    '{"ts":$ts,"type":$type,"file":$file,"branch":$branch,"detail":$detail}')

  echo "$entry" >> "$violations_file"
  echo "$entry" >> "${sessions_dir}/${session_id}.jsonl"
  echo "$entry" >> "/tmp/claude-harness-turn-${session_id}"
}

# ── is_unimportant_file ──────────────────────────────────────────────────────

# is_unimportant_file "path"
# 커버리지 측정 및 리뷰가 불필요한 파일 판별 (JaCoCo 제외 패턴 + 테스트 면제 클래스)
# 0 = 중요하지 않음(제외 대상), 1 = 중요(포함 대상)
# 사용처: guard-code-review.sh, session-start-context.sh
is_unimportant_file() {
  local input="$1"

  # src/main/java 외 파일 (빌드스크립트, 훅 등)은 리뷰/커버리지 대상 아님
  echo "$input" | grep -q 'src/main/java' || return 0

  local base
  base=$(basename "$input" .java)
  base=$(basename "$base" .class)

  # 패키지 경로 패턴
  echo "$input" | grep -qE '/dto/|/entity/|/model/|/repository/|/resolver/|/validation/|/confg/|/generated/' && return 0

  # 클래스명 접미사 패턴 (JaCoCo 제외 + 테스트 면제)
  echo "$base" | grep -iqE '(DTO|Request|Response|Config|Configuration|Application|Properties|Exception|Error|Enum|Record|Constants|Client|Publisher|Checker|Aspect|Controller|Result|MigrationParser)$' && return 0

  # 내부 클래스 (Config$xxx, Client$xxx)
  echo "$base" | grep -qE '(Config|Client)\$' && return 0

  # 클래스명 접두사 패턴
  echo "$base" | grep -qE '^Q[A-Z]|^Migration' && return 0

  # 특정 클래스
  echo "$base" | grep -qE '^(SlackSender|Web3Service|StringUtils|HashUtil)$' && return 0
  echo "$input" | grep -q 'ApiKeyService\$1' && return 0

  return 1  # 중요한 파일
}
