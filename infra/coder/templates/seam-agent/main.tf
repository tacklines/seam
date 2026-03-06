terraform {
  required_providers {
    coder = {
      source = "coder/coder"
    }
    docker = {
      source = "kreuzwerker/docker"
    }
  }
}

provider "coder" {}

provider "docker" {}

data "coder_workspace" "me" {}

data "coder_workspace_owner" "me" {}

# --- Parameters ---

data "coder_parameter" "repo_url" {
  name         = "repo_url"
  display_name = "Repository URL"
  description  = "Git repository to clone into the workspace."
  type         = "string"
  mutable      = false
  default      = ""
}

data "coder_parameter" "branch" {
  name         = "branch"
  display_name = "Branch"
  description  = "Git branch to check out. Leave empty for the repo default."
  type         = "string"
  mutable      = true
  default      = ""
}

data "coder_parameter" "seam_url" {
  name         = "seam_url"
  display_name = "Seam Server URL"
  description  = "URL of the Seam server for MCP access."
  type         = "string"
  mutable      = false
  default      = ""
}

data "coder_parameter" "agent_code" {
  name         = "agent_code"
  display_name = "Agent Join Code"
  description  = "Code for the agent to join a Seam session."
  type         = "string"
  mutable      = false
  default      = ""
}

data "coder_parameter" "agent_type" {
  name         = "agent_type"
  display_name = "Agent Type"
  description  = "Type of agent: coder, planner, reviewer."
  type         = "string"
  mutable      = false
  default      = "coder"

  option {
    name  = "Coder"
    value = "coder"
  }
  option {
    name  = "Planner"
    value = "planner"
  }
  option {
    name  = "Reviewer"
    value = "reviewer"
  }
}

data "coder_parameter" "seam_token" {
  name         = "seam_token"
  display_name = "Seam Token"
  description  = "Agent authentication token for Seam MCP."
  type         = "string"
  mutable      = false
  default      = ""
}

data "coder_parameter" "instructions" {
  name         = "instructions"
  display_name = "Custom Instructions"
  description  = "Optional instructions for the agent."
  type         = "string"
  mutable      = true
  default      = ""
}

data "coder_parameter" "workspace_id" {
  name         = "workspace_id"
  display_name = "Workspace ID"
  description  = "Seam workspace UUID for log streaming."
  type         = "string"
  mutable      = false
  default      = ""
}

data "coder_parameter" "tackline_repo_url" {
  name         = "tackline_repo_url"
  display_name = "Tackline Repo URL"
  description  = "Git repository for tackline skills. Leave empty to skip."
  type         = "string"
  mutable      = false
  default      = "https://github.com/tyevans/tackline.git"
}

data "coder_parameter" "credentials_json" {
  name         = "credentials_json"
  display_name = "Credentials JSON"
  description  = "JSON object of env var name to value pairs, injected from org credential store."
  type         = "string"
  mutable      = false
  default      = "{}"
}

data "coder_parameter" "cpu_limit" {
  name         = "cpu_limit"
  display_name = "CPU Cores"
  description  = "Number of CPU cores for the workspace container."
  type         = "number"
  mutable      = false
  default      = 2

  option {
    name  = "1 core"
    value = 1
  }
  option {
    name  = "2 cores"
    value = 2
  }
  option {
    name  = "4 cores"
    value = 4
  }
}

data "coder_parameter" "memory_limit" {
  name         = "memory_limit"
  display_name = "Memory (GB)"
  description  = "Memory limit for the workspace container."
  type         = "number"
  mutable      = false
  default      = 4

  option {
    name  = "2 GB"
    value = 2
  }
  option {
    name  = "4 GB"
    value = 4
  }
  option {
    name  = "8 GB"
    value = 8
  }
}

# --- Agent ---

resource "coder_agent" "dev" {
  arch = "amd64"
  os   = "linux"
  dir  = "/workspace"

  startup_script = <<-EOT
    #!/bin/bash
    set -e

    # --- Phase 0: Log forwarder + startup log tee ---
    # Install log forwarder script (streams log file to Seam server)
    sudo mkdir -p /opt/seam && sudo chown "$(id -u):$(id -g)" /opt/seam
    cat > /opt/seam/log-forwarder.py <<'FORWARDER'
#!/usr/bin/env python3
"""Tails a log file and POSTs batches to the Seam server."""
import json, os, sys, time, urllib.request, urllib.error
from datetime import datetime, timezone
from threading import Thread, Event

BATCH_SIZE, FLUSH_INTERVAL = 20, 2.0

def post_batch(url, token, lines):
    req = urllib.request.Request(url, data=json.dumps(lines).encode(),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
        method="POST")
    for attempt in range(3):
        try:
            urllib.request.urlopen(req, timeout=10)
            return
        except (urllib.error.URLError, OSError):
            time.sleep(1.0 * (attempt + 1))

def main():
    log_file, seam_url, ws_id, token = sys.argv[1:5]
    url = f"{seam_url}/api/workspaces/{ws_id}/logs"
    batch, last_flush, stop = [], time.monotonic(), Event()
    def flush():
        nonlocal batch, last_flush
        if not batch: return
        to_send, batch, last_flush = batch, [], time.monotonic()
        post_batch(url, token, to_send)
    def timer():
        while not stop.wait(FLUSH_INTERVAL):
            if batch and time.monotonic() - last_flush >= FLUSH_INTERVAL: flush()
    Thread(target=timer, daemon=True).start()
    # Start from beginning of file (don't seek to end) to capture prior output
    while not os.path.exists(log_file) and not stop.is_set(): time.sleep(0.5)
    try:
        with open(log_file) as f:
            while not stop.is_set():
                line = f.readline()
                if line:
                    batch.append({"line": line.rstrip("\n"), "fd": "stdout",
                        "ts": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")})
                    if len(batch) >= BATCH_SIZE: flush()
                else: time.sleep(0.1)
    except KeyboardInterrupt: pass
    finally: stop.set(); flush()

if __name__ == "__main__": main()
FORWARDER
    chmod +x /opt/seam/log-forwarder.py

    # Start a single log forwarder that streams all output to Seam.
    # We use one combined log file for both startup and agent output,
    # and tee startup output into it so the forwarder picks up everything.
    AGENT_LOG=/tmp/claude-agent.log
    if [ -n "${data.coder_parameter.workspace_id.value}" ] && [ -n "${data.coder_parameter.seam_url.value}" ]; then
      touch "$AGENT_LOG"
      python3 /opt/seam/log-forwarder.py \
        "$AGENT_LOG" \
        "${data.coder_parameter.seam_url.value}" \
        "${data.coder_parameter.workspace_id.value}" \
        "${data.coder_parameter.seam_token.value}" \
        > /tmp/seam-forwarder.log 2>&1 &
      FORWARDER_PID=$!
      # Tee startup output into the same log file the forwarder is tailing
      exec 3>&1 4>&2
      exec > >(tee -a "$AGENT_LOG") 2>&1
      echo "Log forwarder started (PID: $FORWARDER_PID)"
    fi

    # --- Phase 1: Inject credentials (before any git operations) ---
    CREDS_JSON='${data.coder_parameter.credentials_json.value}'
    if [ "$CREDS_JSON" != "{}" ] && [ -n "$CREDS_JSON" ]; then
      echo "Injecting credentials..."
      eval "$(echo "$CREDS_JSON" | jq -r 'to_entries[] | "export \(.key)=\(.value | @sh)"')"
      echo "Injected $(echo "$CREDS_JSON" | jq 'length') credential(s)"
    fi

    # --- Phase 2: Git credential helper (GIT_TOKEN now available) ---
    if [ -n "$GIT_TOKEN" ]; then
      echo "Configuring git credentials..."
      git config --global credential.helper \
        '!f() { echo "username=git"; echo "password='"$GIT_TOKEN"'"; }; f'
    fi

    # --- Phase 2b: SSH key setup (SSH_PRIVATE_KEY now available) ---
    if [ -n "$SSH_PRIVATE_KEY" ]; then
      echo "Configuring SSH key..."
      mkdir -p ~/.ssh && chmod 700 ~/.ssh
      printf '%s\n' "$SSH_PRIVATE_KEY" > ~/.ssh/id_ed25519
      chmod 600 ~/.ssh/id_ed25519
      # Generate public key from private key
      ssh-keygen -y -f ~/.ssh/id_ed25519 > ~/.ssh/id_ed25519.pub 2>/dev/null || true
      # Accept all host keys automatically (agent non-interactive)
      printf '%s\n' 'Host *' '  StrictHostKeyChecking no' '  UserKnownHostsFile /dev/null' > ~/.ssh/config
      chmod 600 ~/.ssh/config
      # Start ssh-agent and add key
      eval "$(ssh-agent -s)" > /dev/null 2>&1
      ssh-add ~/.ssh/id_ed25519 > /dev/null 2>&1
      echo "SSH key configured"
    fi

    # --- Phase 3: Ensure /workspace is writable ---
    if [ ! -w "/workspace" ]; then
      echo "Fixing /workspace permissions..."
      sudo chown -R "$(id -u):$(id -g)" /workspace 2>/dev/null || true
    fi

    # --- Phase 4: Clone repo ---
    if [ -n "${data.coder_parameter.repo_url.value}" ] && [ ! -d "/workspace/.git" ]; then
      echo "Cloning ${data.coder_parameter.repo_url.value}..."
      git clone "${data.coder_parameter.repo_url.value}" /workspace

      # Check out branch if specified
      if [ -n "${data.coder_parameter.branch.value}" ]; then
        cd /workspace
        git checkout "${data.coder_parameter.branch.value}" 2>/dev/null || \
          git checkout -b "${data.coder_parameter.branch.value}"
      fi
    fi

    # --- Phase 5: Install tools ---
    # Ensure Node.js/npm are available
    if ! command -v npm &> /dev/null; then
      echo "Installing Node.js..."
      curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
      sudo apt-get install -y nodejs
    fi

    if ! command -v claude &> /dev/null; then
      echo "Installing Claude Code CLI..."
      sudo npm install -g @anthropic-ai/claude-code
    fi

    # Install tackline skills
    if [ -n "${data.coder_parameter.tackline_repo_url.value}" ]; then
      echo "Installing tackline..."
      sudo git clone --depth 1 "${data.coder_parameter.tackline_repo_url.value}" /opt/tackline
      sudo chown -R "$(id -u):$(id -g)" /opt/tackline
      /opt/tackline/install.sh || echo "WARN: tackline install failed (continuing)"
      echo "Tackline installed: $(ls ~/.claude/skills/ 2>/dev/null | wc -l) skills"
    fi

    # --- Phase 6: Configure MCP (no agent launch) ---
    # Workspace is an execution environment for ephemeral invocations.
    # Agent processes are dispatched via `coder ssh` from the Seam server,
    # not launched from the startup script.
    if [ -n "${data.coder_parameter.seam_url.value}" ] && [ -n "${data.coder_parameter.seam_token.value}" ]; then
      echo "Configuring Seam MCP connection..."

      mkdir -p /workspace/.claude
      printf '%s\n' '{' \
        '  "mcpServers": {' \
        '    "seam": {' \
        '      "url": "'"${data.coder_parameter.seam_url.value}"'/mcp",' \
        '      "headers": {' \
        '        "Authorization": "Bearer '"${data.coder_parameter.seam_token.value}"'"' \
        '      }' \
        '    }' \
        '  }' \
        '}' > /workspace/.claude/settings.local.json

      echo "Seam MCP configured: ${data.coder_parameter.seam_url.value}/mcp"
    fi

    # Restore original stdout/stderr if tee was set up
    if [ -n "$FORWARDER_PID" ]; then
      exec 1>&3 2>&4 3>&- 4>&-
    fi

    echo "Workspace ready for invocations."
  EOT

  env = {
    GIT_AUTHOR_NAME      = data.coder_workspace_owner.me.name
    GIT_AUTHOR_EMAIL     = data.coder_workspace_owner.me.email
    GIT_COMMITTER_NAME   = data.coder_workspace_owner.me.name
    GIT_COMMITTER_EMAIL  = data.coder_workspace_owner.me.email
    SEAM_URL             = data.coder_parameter.seam_url.value
    SEAM_AGENT_CODE      = data.coder_parameter.agent_code.value
    SEAM_AGENT_TYPE      = data.coder_parameter.agent_type.value
    SEAM_TOKEN           = data.coder_parameter.seam_token.value
    SEAM_INSTRUCTIONS    = data.coder_parameter.instructions.value
    SEAM_WORKSPACE_ID    = data.coder_parameter.workspace_id.value
  }
}

# --- Docker Image ---

resource "docker_image" "workspace" {
  name = "codercom/enterprise-base:ubuntu"
}

# --- Persistent Volume ---

resource "docker_volume" "workspace" {
  name = "coder-${data.coder_workspace.me.id}-workspace"

  labels {
    label = "coder.owner"
    value = data.coder_workspace_owner.me.name
  }
  labels {
    label = "coder.workspace_id"
    value = data.coder_workspace.me.id
  }

  lifecycle {
    ignore_changes = all
  }
}

# --- Container ---

resource "docker_container" "workspace" {
  count    = data.coder_workspace.me.start_count
  image    = docker_image.workspace.name
  name     = "coder-${data.coder_workspace_owner.me.name}-${lower(data.coder_workspace.me.name)}"
  hostname = data.coder_workspace.me.name

  entrypoint = ["sh", "-c", replace(coder_agent.dev.init_script, "/localhost|127\\.0\\.0\\.1/", "host.docker.internal")]

  env = [
    "CODER_AGENT_TOKEN=${coder_agent.dev.token}",
  ]

  # CPU and memory limits
  cpu_shares = data.coder_parameter.cpu_limit.value * 1024
  memory     = data.coder_parameter.memory_limit.value * 1024

  host {
    host = "host.docker.internal"
    ip   = "host-gateway"
  }

  # Mount persistent workspace volume
  volumes {
    container_path = "/workspace"
    volume_name    = docker_volume.workspace.name
    read_only      = false
  }

  # Labels for tracking
  labels {
    label = "coder.owner"
    value = data.coder_workspace_owner.me.name
  }
  labels {
    label = "coder.owner_id"
    value = data.coder_workspace_owner.me.id
  }
  labels {
    label = "coder.workspace_id"
    value = data.coder_workspace.me.id
  }
  labels {
    label = "coder.workspace_name"
    value = data.coder_workspace.me.name
  }
  labels {
    label = "seam.managed"
    value = "true"
  }
  labels {
    label = "seam.agent_type"
    value = data.coder_parameter.agent_type.value
  }
}
