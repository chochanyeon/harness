#!/usr/bin/env bash
# setup_corenlp.sh — Start shared Stanford CoreNLP Docker container
#
# Runs a single shared CoreNLP server on localhost:9000.
# All projects connect via CORENLP_URL (default: http://localhost:9000).
# Safe to run multiple times — exits early if already running.

set -euo pipefail

CONTAINER_NAME="corenlp"
PORT="${CORENLP_PORT:-9000}"
IMAGE="nlptown/corenlp-server:latest"
MEMORY="${CORENLP_MEMORY:-6g}"

echo "── Stanford CoreNLP Shared Server ────────────────────────"
echo "  Container : ${CONTAINER_NAME}"
echo "  Port      : ${PORT}"
echo "─────────────────────────────────────────────────────────"

if ! command -v docker &>/dev/null; then
  echo "Error: docker not found. Install Docker Desktop and retry." >&2
  exit 1
fi

# Already running?
if docker ps --filter "name=^${CONTAINER_NAME}$" --format "{{.Names}}" 2>/dev/null | grep -q "^${CONTAINER_NAME}$"; then
  echo "✅ CoreNLP already running at http://localhost:${PORT}"
  exit 0
fi

# Container exists but stopped → start it
if docker ps -a --filter "name=^${CONTAINER_NAME}$" --format "{{.Names}}" 2>/dev/null | grep -q "^${CONTAINER_NAME}$"; then
  echo "Starting existing container ${CONTAINER_NAME}..."
  docker start "${CONTAINER_NAME}"
else
  echo "Creating CoreNLP container..."
  docker run -d \
    --name "${CONTAINER_NAME}" \
    -p "${PORT}:9000" \
    -m "${MEMORY}" \
    --restart unless-stopped \
    "${IMAGE}"
fi

echo "✅ CoreNLP server started at http://localhost:${PORT}"
echo ""
echo "Connect from projects via: CORENLP_URL=http://localhost:${PORT}"
