#!/bin/bash
# Test the Coder template startup script locally by running the same base image.
#
# Usage:
#   ./infra/coder/test-startup.sh
#
# This runs the startup phases (0-5) without actually launching an agent.
# It validates: permissions, npm/node install, git clone, tackline install.
#
# Pass GIT_TOKEN env var to test private repo cloning:
#   GIT_TOKEN=ghp_xxx ./infra/coder/test-startup.sh

set -euo pipefail

IMAGE="codercom/enterprise-base:ubuntu"
CONTAINER_NAME="seam-startup-test-$$"

echo "=== Testing Coder template startup ==="
echo "Image: $IMAGE"
echo ""

# Build a test script from the template phases (no agent launch, no Seam forwarder)
cat > /tmp/seam-startup-test.sh <<'SCRIPT'
#!/bin/bash
set -e

echo "=== Phase 0: Setup ==="
sudo mkdir -p /workspace

echo ""
echo "=== Phase 1: Credentials ==="
if [ -n "${GIT_TOKEN:-}" ]; then
  echo "GIT_TOKEN is set (${#GIT_TOKEN} chars)"
  git config --global credential.helper \
    '!f() { echo "username=git"; echo "password='"$GIT_TOKEN"'"; }; f'
  echo "Git credential helper configured"
else
  echo "GIT_TOKEN not set (skipping git credentials)"
fi

echo ""
echo "=== Phase 3: Workspace permissions ==="
if [ ! -w "/workspace" ]; then
  echo "/workspace not writable, fixing..."
  sudo chown -R "$(id -u):$(id -g)" /workspace 2>/dev/null || true
fi
ls -la / | grep workspace
echo "Write test:"
touch /workspace/.test && rm /workspace/.test && echo "  OK"

echo ""
echo "=== Phase 4: Git clone test ==="
REPO_URL="${TEST_REPO_URL:-https://github.com/tacklines/seam.git}"
if [ ! -d "/workspace/.git" ]; then
  echo "Cloning $REPO_URL ..."
  git clone --depth 1 "$REPO_URL" /workspace
  echo "Clone OK: $(ls /workspace | head -5)"
else
  echo "/workspace/.git already exists, skipping clone"
fi

echo ""
echo "=== Phase 5: Node.js / npm ==="
if ! command -v npm &> /dev/null; then
  echo "npm not found, installing Node.js..."
  curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
echo "node: $(node --version)"
echo "npm:  $(npm --version)"

echo ""
echo "=== Phase 5b: Claude Code CLI ==="
if ! command -v claude &> /dev/null; then
  echo "Installing Claude Code CLI..."
  sudo npm install -g @anthropic-ai/claude-code
fi
claude --version 2>/dev/null && echo "Claude CLI OK" || echo "Claude CLI installed (version check may need auth)"

echo ""
echo "=== Phase 5c: Tackline ==="
TACKLINE_URL="${TACKLINE_REPO_URL:-https://github.com/tyevans/tackline.git}"
if [ -n "$TACKLINE_URL" ]; then
  echo "Cloning tackline..."
  sudo git clone --depth 1 "$TACKLINE_URL" /opt/tackline
  sudo chown -R "$(id -u):$(id -g)" /opt/tackline
  if [ -f /opt/tackline/install.sh ]; then
    /opt/tackline/install.sh
    echo "Tackline installed: $(ls ~/.claude/skills/ 2>/dev/null | wc -l) skills"
  else
    echo "WARN: /opt/tackline/install.sh not found"
  fi
fi

echo ""
echo "=== All phases passed ==="
SCRIPT

chmod +x /tmp/seam-startup-test.sh

# Run in the same image Coder uses
docker run --rm \
  --name "$CONTAINER_NAME" \
  -v /tmp/seam-startup-test.sh:/tmp/test.sh:ro \
  -e GIT_TOKEN="${GIT_TOKEN:-}" \
  -e TEST_REPO_URL="${TEST_REPO_URL:-https://github.com/tacklines/seam.git}" \
  -e TACKLINE_REPO_URL="${TACKLINE_REPO_URL:-https://github.com/tyevans/tackline.git}" \
  "$IMAGE" \
  bash /tmp/test.sh

echo ""
echo "=== Test complete ==="
