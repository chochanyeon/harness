#!/usr/bin/env bash
# Stop — 이번 턴의 게이트 발동을 LLM 컨텍스트에 주입
# decision:block → LLM이 요약 생성 → 버퍼 초기화 → 다음 Stop에서 허용

SESSION_ID="${CLAUDE_SESSION_ID:-unknown}"
TURN_FILE="/tmp/claude-harness-turn-${SESSION_ID}"

# 이번 턴 위반 없음 → 그냥 종료
if [ ! -f "$TURN_FILE" ] || [ ! -s "$TURN_FILE" ]; then
  exit 0
fi

# 버퍼 읽고 즉시 초기화 (다음 Stop이 중복 보고하지 않도록)
TURN_RECORDS=$(cat "$TURN_FILE")
> "$TURN_FILE"

if command -v jq >/dev/null 2>&1; then
  SUMMARY=$(echo "$TURN_RECORDS" | jq -Rs '
    split("\n") |
    map(select(length > 0) | fromjson? // empty) |
    group_by(.type) |
    map("  \(.[0].type): \(length)회") |
    join("\n")
  ' 2>/dev/null || echo "  집계 실패")
else
  SUMMARY=$(echo "$TURN_RECORDS" | grep -o '"type":"[^"]*"' | sort | uniq -c | \
    awk '{gsub(/"type":"/,"",$2); gsub(/"/,"",$2); print "  " $2 ": " $1 "회"}')
fi

TOTAL=$(echo "$TURN_RECORDS" | grep -c '"ts":' || echo "0")

REPORT="=== 이번 턴 게이트 발동 ===
${SUMMARY}
총: ${TOTAL}회

→ 위 위반을 사용자에게 간략히 알리고, 반복 패턴이 있다면 개선 방향을 제안하세요."

jq -cn --arg r "$REPORT" '{"decision":"block","reason":$r}'
