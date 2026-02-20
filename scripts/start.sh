#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ -z "${XAI_API_KEY:-}" ]; then
  echo "Error: XAI_API_KEY is not set."
  echo "  Either export it or add it to .env in the repo root."
  exit 1
fi

if [ -z "${VOYAGE_API_KEY:-}" ]; then
  echo "Error: VOYAGE_API_KEY is not set."
  echo "  Either export it or add it to .env in the repo root."
  exit 1
fi

echo "Starting opencode-memory server..."
cd "$REPO_ROOT"
docker compose up -d

echo ""
echo "Waiting for memory server to be ready..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:8020/health > /dev/null 2>&1; then
    echo "Memory server is ready at http://localhost:8020"
    echo ""
    echo "Logs: docker compose logs -f memory-server"
    exit 0
  fi
  sleep 2
done

echo "Memory server did not become ready in time. Check logs:"
echo "  docker compose logs -f memory-server"
exit 1
