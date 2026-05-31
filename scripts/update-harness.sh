#!/usr/bin/env sh
set -eu

REPO="https://github.com/cycho21/harness.git"
DEST="$(pwd)"
REF=""
DRY_RUN=0
KEEP_TEMP=0

usage() {
  cat <<'EOF'
Usage: update-harness.sh [options]

Updates upstream-managed harness runtime files while preserving project-owned files.

Options:
  --repo URL   Harness git remote (default: https://github.com/cycho21/harness.git)
  --dest DIR   Project root to update (default: current directory)
  --ref REF    Branch or tag to clone
  --dry-run    Print planned changes without writing files
  --keep-temp  Keep temporary clone directory
  -h, --help   Show this help
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --repo) REPO="$2"; shift 2 ;;
    --dest) DEST="$2"; shift 2 ;;
    --ref) REF="$2"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    --keep-temp) KEEP_TEMP=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

command -v git >/dev/null 2>&1 || { echo "Required command not found: git" >&2; exit 1; }
DEST=$(cd "$DEST" 2>/dev/null && pwd || { mkdir -p "$DEST" && cd "$DEST" && pwd; })
TEMP_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/harness-update.XXXXXX")
CLONE_DIR="$TEMP_ROOT/repo"
COUNTS="$TEMP_ROOT/counts"

cleanup() {
  if [ "$KEEP_TEMP" -eq 1 ]; then echo "temp kept: $TEMP_ROOT"; else rm -rf "$TEMP_ROOT"; fi
}
trap cleanup EXIT INT TERM

echo "repo:   $REPO"
echo "dest:   $DEST"
[ -n "$REF" ] && echo "ref:    $REF"
[ "$DRY_RUN" -eq 1 ] && echo "mode:   dry-run"

if [ -n "$REF" ]; then git clone --depth 1 --branch "$REF" "$REPO" "$CLONE_DIR"; else git clone --depth 1 "$REPO" "$CLONE_DIR"; fi
TEMPLATE="$CLONE_DIR/target"

UPDATED=0
: > "$COUNTS"
for MANAGED in \
  .pi/.gitignore \
  .pi/WORKFLOW.md \
  .pi/GOVERNANCE.md \
  .pi/extensions \
  .pi/dpaa \
  .pi/workflows \
  .pi/skills \
  .pi/personas \
  .pi/pyproject.toml \
  .pi/schemas
  do
    SRC_ROOT="$TEMPLATE/$MANAGED"
    [ -e "$SRC_ROOT" ] || continue
    if [ -d "$SRC_ROOT" ]; then
      DEST_ROOT="$DEST/$MANAGED"
      if [ -e "$DEST_ROOT" ]; then
        printf 'clean      %s\n' "$MANAGED"
        if [ "$DRY_RUN" -ne 1 ]; then rm -rf "$DEST_ROOT"; fi
      fi
      find "$SRC_ROOT" -type f \
        ! -path '*/__pycache__/*' \
        ! -path '*/.pytest_cache/*' \
        ! -path '*/.mypy_cache/*' \
        ! -path '*/.ruff_cache/*' \
        ! -path '*/.venv/*' \
        ! -path '*/.cache/*' \
        ! -path '*/*.egg-info/*' \
        ! -name '.DS_Store' | sort | while IFS= read -r SRC; do
          REL=${SRC#"$TEMPLATE"/}
          TARGET="$DEST/$REL"
          printf 'update     %s\n' "$REL"
          if [ "$DRY_RUN" -ne 1 ]; then
            mkdir -p "$(dirname "$TARGET")"
            cp -p "$SRC" "$TARGET"
          fi
          echo x >> "$COUNTS"
        done
    else
      TARGET="$DEST/$MANAGED"
      printf 'update     %s\n' "$MANAGED"
      if [ "$DRY_RUN" -ne 1 ]; then
        mkdir -p "$(dirname "$TARGET")"
        cp -p "$SRC_ROOT" "$TARGET"
      fi
      echo x >> "$COUNTS"
    fi
  done

LOCAL_SRC="$TEMPLATE/.pi/LOCAL.md"
LOCAL_TARGET="$DEST/.pi/LOCAL.md"
if [ -f "$LOCAL_SRC" ] && [ ! -e "$LOCAL_TARGET" ]; then
  printf 'seed       %s\n' ".pi/LOCAL.md"
  if [ "$DRY_RUN" -ne 1 ]; then
    mkdir -p "$(dirname "$LOCAL_TARGET")"
    cp -p "$LOCAL_SRC" "$LOCAL_TARGET"
  fi
  echo x >> "$COUNTS"
fi

UPDATED=$(wc -l < "$COUNTS" | tr -d ' ')
echo ""
echo "Done. updated=$UPDATED"
echo "Project-owned paths were preserved: AGENTS.md, .pi/config/, .pi/local/, .pi/LOCAL.md."
