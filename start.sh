#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
export PATH="${HOME}/.bun/bin:${PATH}"

if [[ ! -d node_modules ]]; then
  echo "Installing dependencies..."
  bun install
fi

if [[ ! -f dist/cli.js ]]; then
  echo "Building..."
  bun run build
fi

if ! bun run dist/cli.js whoami; then
  echo
  echo "Not logged in. Starting login..."
  bun run dist/cli.js login
fi

export PORT="${PORT:-3000}"
echo
echo "Starting server on http://localhost:${PORT}/v1"
if [[ -n "${HTTPS_PROXY:-${HTTP_PROXY:-}}" ]]; then
  echo "Cursor egress via ${HTTPS_PROXY:-$HTTP_PROXY}"
else
  echo "Cursor egress: direct"
  echo "If Claude/GPT/Gemini fail with a region error, set HTTPS_PROXY first."
  echo "Example: export HTTPS_PROXY=http://127.0.0.1:7890"
fi
exec bun run dist/cli.js serve
