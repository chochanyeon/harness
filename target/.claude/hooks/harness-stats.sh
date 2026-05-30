#!/usr/bin/env bash
# Harness telemetry report — summarizes violations.jsonl
# Usage: bash .claude/hooks/harness-stats.sh [--recent N]

LOG="$HOME/.claude/hooks/violations.jsonl"
RECENT=20

while [ $# -gt 0 ]; do
  case "$1" in
    --recent) RECENT="${2:?--recent requires a number}"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

if [ ! -f "$LOG" ] || [ ! -s "$LOG" ]; then
  echo "No violations recorded yet."
  exit 0
fi

TOTAL=$(wc -l < "$LOG")
echo "=== Harness Violation Report ==="
echo "Total violations: $TOTAL"
echo ""

echo "--- By Type ---"
jq -r '.type' "$LOG" 2>/dev/null | sort | uniq -c | sort -rn | head -10

echo ""
echo "--- Top Files ---"
jq -r '.file' "$LOG" 2>/dev/null | sort | uniq -c | sort -rn | head -10

echo ""
echo "--- By Branch ---"
jq -r '.branch' "$LOG" 2>/dev/null | sort | uniq -c | sort -rn | head -10

echo ""
echo "--- Recent ${RECENT} violations ---"
tail -n "$RECENT" "$LOG" | jq -r '"\(.ts | split("T")[0]) [\(.type)] \(.file) — \(.branch)"' 2>/dev/null
