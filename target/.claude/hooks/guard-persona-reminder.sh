#!/usr/bin/env bash
# PreToolUse(Edit, Write) — Persona Awareness Reminder
#
# When editing architectural files, reminds Claude to engage the appropriate
# persona before proceeding. Does NOT block (exit 0 always) — advisory only.
#
# Architectural signals:
#   Entity / Repository                 → Architect (DB schema)
#   build.gradle / settings.gradle      → Architect (Tech Stack Specialist)
#   *Controller                         → Developer (Backend Engineer)
#   *Service / *ServiceImpl             → Developer (Backend Engineer)
#   security* / *Auth* / *Jwt*          → Reviewer (Security Expert)

INPUT=$(cat)
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)

[ -z "$FILE" ] && exit 0

BASENAME=$(basename "$FILE")

# Architectural files → Architect persona
if echo "$BASENAME" | grep -qiE '(Entity|Repository|build\.gradle|settings\.gradle)'; then
  echo "[Persona] Architectural file: ${BASENAME}" >&2
  echo "[Persona] Read .claude/personas/architect/AGENTS.md before proceeding." >&2
  exit 0
fi

# Security-sensitive files → Reviewer persona
if echo "$BASENAME" | grep -qiE '(Security|Auth|Jwt|Token|Filter|Interceptor)'; then
  echo "[Persona] Security-sensitive file: ${BASENAME}" >&2
  echo "[Persona] Read .claude/personas/reviewer/security-expert.md before proceeding." >&2
  exit 0
fi

exit 0
