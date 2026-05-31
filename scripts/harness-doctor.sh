#!/usr/bin/env sh
set -eu
ROOT="${1:-$(pwd)}"
fail=0
check() {
  name="$1"; path="$2"
  if [ -e "$ROOT/$path" ]; then printf '[OK]   %s\n' "$name"; else printf '[FAIL] %s\n' "$name"; fail=1; fi
}
check_cmd() {
  name="$1"; cmd="$2"
  if command -v "$cmd" >/dev/null 2>&1; then printf '[OK]   %s\n' "$name"; else printf '[FAIL] %s\n' "$name"; fail=1; fi
}
python_ok() {
  command -v "$1" >/dev/null 2>&1 && "$1" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)' >/dev/null 2>&1
}
check "AGENTS.md" "AGENTS.md"
check ".pi" ".pi"
check ".pi/WORKFLOW.md" ".pi/WORKFLOW.md"
check ".pi/extensions/workflow.ts" ".pi/extensions/workflow.ts"
check ".pi/extensions/workflow" ".pi/extensions/workflow"
check ".pi/skills" ".pi/skills"
check ".pi/personas" ".pi/personas"
check ".pi/workflows" ".pi/workflows"
check ".pi/dpaa" ".pi/dpaa"
check ".pi/pyproject.toml" ".pi/pyproject.toml"
check ".pi/schemas/harness-field-log-event.schema.json" ".pi/schemas/harness-field-log-event.schema.json"
check_cmd "git" git
if python_ok python || python_ok python3; then printf '[OK]   python >= 3.10\n'; else printf '[FAIL] python >= 3.10\n'; fail=1; fi
if [ -x "$ROOT/.pi/.venv/bin/python" ] || [ -x "$ROOT/.pi/.venv/Scripts/python.exe" ]; then printf '[OK]   DPAA venv\n'; else printf '[WARN] DPAA venv missing; auto-created on first DPAA gate\n'; fi
exit "$fail"
