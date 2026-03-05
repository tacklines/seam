#!/bin/bash
# Setup script for Coder integration with Seam.
#
# Prerequisites:
#   - Coder CLI installed (curl -L https://coder.com/install.sh | sh)
#   - Coder running (docker compose --profile coder up -d)
#   - Logged into Coder (coder login http://localhost:7080)
#
# Usage:
#   ./infra/coder/setup.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE_DIR="${SCRIPT_DIR}/templates/seam-agent"

echo "=== Seam + Coder Setup ==="
echo ""

# Check prerequisites
if ! command -v coder &> /dev/null; then
  echo "Error: Coder CLI not found. Install it with:"
  echo "  curl -L https://coder.com/install.sh | sh"
  exit 1
fi

if ! coder whoami &> /dev/null 2>&1; then
  echo "Error: Not logged into Coder. Run:"
  echo "  coder login http://localhost:7080"
  exit 1
fi

echo "Logged in as: $(coder whoami 2>/dev/null | head -1)"
echo ""

# Push the seam-agent template
echo "Pushing seam-agent template..."
coder templates push seam-agent \
  --directory "${TEMPLATE_DIR}" \
  --yes

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Template 'seam-agent' is now available in Coder."
echo ""
echo "To generate an API token for Seam, run:"
echo "  coder tokens create --name seam-integration"
echo ""
echo "Then set these env vars for the Seam server:"
echo "  export CODER_URL=http://localhost:7080"
echo "  export CODER_TOKEN=<token from above>"
echo ""
echo "Restart the Seam server and you should see:"
echo "  'Coder integration enabled'"
