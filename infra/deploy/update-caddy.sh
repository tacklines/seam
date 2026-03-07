#!/bin/bash
set -euo pipefail

# Update Caddyfile from repo and reload Caddy.
# Called during deploy to pick up route changes.

REPO_DIR="${1:-/opt/seam/repo}"
CADDYFILE_SRC="$REPO_DIR/infra/caddy/Caddyfile"
CADDYFILE_DST="/etc/caddy/Caddyfile"

if [ ! -f "$CADDYFILE_SRC" ]; then
  echo "ERROR: $CADDYFILE_SRC not found"
  exit 1
fi

if diff -q "$CADDYFILE_SRC" "$CADDYFILE_DST" > /dev/null 2>&1; then
  echo "Caddyfile unchanged, skipping reload"
  exit 0
fi

cp "$CADDYFILE_SRC" "$CADDYFILE_DST"
chown caddy:caddy "$CADDYFILE_DST"

echo "Caddyfile updated, reloading Caddy..."
caddy reload --config "$CADDYFILE_DST" --adapter caddyfile
echo "Caddy reloaded successfully"
