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

data "coder_parameter" "seam_token" {
  name         = "seam_token"
  display_name = "Seam Token"
  description  = "Agent authentication token for Seam MCP."
  type         = "string"
  mutable      = false
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
    # Write credentials to a file sourced by login shells (coder ssh),
    # AND eval in this script so subsequent phases can use them.
    CREDS_JSON='${data.coder_parameter.credentials_json.value}'
    if [ "$CREDS_JSON" != "{}" ] && [ -n "$CREDS_JSON" ]; then
      echo "Injecting credentials..."
      CREDS_EXPORTS="$(echo "$CREDS_JSON" | jq -r 'to_entries[] | "export \(.key)=\(.value | @sh)"')"
      # Persist for login shells
      echo "$CREDS_EXPORTS" > /opt/seam/credentials.env
      chmod 600 /opt/seam/credentials.env
      # Source in .bashrc so coder ssh sessions get them
      if ! grep -q 'credentials.env' ~/.bashrc 2>/dev/null; then
        echo '[ -f /opt/seam/credentials.env ] && . /opt/seam/credentials.env' >> ~/.bashrc
      fi
      # Also eval now for this startup script
      eval "$CREDS_EXPORTS"
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

    # Install GitHub CLI (gh)
    if ! command -v gh &> /dev/null; then
      echo "Installing GitHub CLI..."
      (type -p wget >/dev/null || (sudo apt update && sudo apt-get install wget -y)) \
        && sudo mkdir -p -m 755 /etc/apt/keyrings \
        && wget -qO- https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null \
        && sudo chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
        && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
        && sudo apt update \
        && sudo apt install gh -y
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

      # MCP server config must go in .mcp.json (not settings.local.json)
      # for headers support. Double $$ escapes Terraform interpolation so
      # the literal SEAM_TOKEN and SEAM_URL reach the file for Claude
      # Code's runtime env var expansion.
      cat > /workspace/.mcp.json << EOF
{
  "mcpServers": {
    "seam": {
      "type": "http",
      "url": "$${SEAM_URL}/mcp",
      "headers": {
        "Authorization": "Bearer $${SEAM_TOKEN}"
      }
    }
  }
}
EOF

      echo "Seam MCP configured: ${data.coder_parameter.seam_url.value}/mcp"

      # Write default agent perspective files for claude --agent
      mkdir -p /workspace/.claude/agents

      cat > /workspace/.claude/agents/coder.md << 'AGENT_EOF'
# Coder Agent

You are an implementation agent. Your job is to write code that satisfies the task requirements.

## Workflow
1. Read the task context from your system prompt
2. Understand the codebase structure and conventions
3. Implement the required changes
4. Run tests to verify your work
5. Commit and push your changes

## Rules
- Follow existing code patterns and conventions
- Write tests for new functionality when appropriate
- Keep changes focused on the task — don't refactor unrelated code
- Commit with conventional commit messages (feat:, fix:, etc.)
- Run `cargo check` and `cargo test` before committing Rust changes
- Run `npx tsc --noEmit` before committing TypeScript changes
AGENT_EOF

      cat > /workspace/.claude/agents/reviewer.md << 'AGENT_EOF'
# Reviewer Agent

You are a code review agent. Your job is to review code for correctness, security, and quality.

## Workflow
1. Read the task context from your system prompt
2. Identify the relevant code changes (check recent commits on the branch)
3. Review for: correctness, security, performance, style, test coverage
4. Report findings via task comments

## Review Checklist
- [ ] Logic correctness — does the code do what it claims?
- [ ] Security — SQL injection, XSS, auth bypass, secrets in code?
- [ ] Error handling — are errors handled gracefully?
- [ ] Performance — obvious bottlenecks or N+1 queries?
- [ ] Style — consistent with project conventions?
- [ ] Tests — are new code paths tested?
- [ ] Documentation — are public APIs documented?

## Rules
- Do NOT modify code — only review and report
- Be specific: reference file:line in your findings
- Categorize findings: critical, warning, suggestion
- Report via task comments using MCP tools
AGENT_EOF

      cat > /workspace/.claude/agents/planner.md << 'AGENT_EOF'
# Planner Agent

You are a planning and exploration agent. Your job is to analyze tasks and produce implementation plans, NOT to write code.

## Workflow
1. Read the task context from your system prompt
2. Explore the relevant codebase areas
3. Identify what changes are needed
4. Produce a structured plan with specific files and changes
5. If the task is an epic, decompose it into subtasks

## Output Format
Produce your plan as a structured report:
- **Scope**: What areas of the codebase are affected
- **Changes**: Specific files and modifications needed
- **Dependencies**: What must be done first
- **Risks**: Potential issues or unknowns
- **Subtasks**: If applicable, break down into smaller tasks

## Rules
- Do NOT implement changes — only plan them
- Be specific: name files, functions, line numbers
- Identify dependencies between changes
- Flag areas of uncertainty
- Report findings via task comments using MCP tools
AGENT_EOF

      cat > /workspace/.claude/agents/tester.md << 'AGENT_EOF'
# Tester Agent

You are a test runner agent. Your job is to run tests, analyze failures, and report results.

## Workflow
1. Read the task context from your system prompt
2. Run the relevant test suites:
   - `cargo test` for Rust server tests
   - `cd frontend && npm test` for TypeScript tests
3. Analyze any failures
4. Report results via task comments

## Test Commands
- Full server tests: `cd /workspace && cargo test --workspace`
- Specific test: `cd /workspace && cargo test <test_name>`
- Frontend type check: `cd /workspace/frontend && npx tsc --noEmit`
- Frontend tests: `cd /workspace/frontend && npm test`

## Rules
- Run ALL relevant test suites, not just one
- For failures, investigate root cause before reporting
- Include full error output in your report
- If tests pass, confirm with the specific test count
- Report via task comments using MCP tools
AGENT_EOF

      cat > /workspace/.claude/agents/researcher.md << 'AGENT_EOF'
# Researcher Agent

You are a research agent. Your job is to gather information and report findings.

## Workflow
1. Read the task context from your system prompt
2. Explore the codebase to answer the research question
3. Gather relevant code snippets, patterns, and documentation
4. Produce a structured findings report

## Output Format
Report your findings with:
- **Summary**: One paragraph overview
- **Findings**: Numbered list with evidence
  - Each finding includes: source file:line, confidence (confirmed/likely/possible)
- **Gaps**: What you couldn't determine
- **Recommendations**: Suggested next steps

## Rules
- Be thorough — check multiple sources before concluding
- Cite your sources with file paths and line numbers
- State your confidence level for each finding
- Do NOT implement changes — only research and report
- Report via task comments using MCP tools
AGENT_EOF

      echo "Agent perspectives configured: coder, reviewer, planner, tester, researcher"

      # Configure gh CLI auth with GIT_TOKEN if available
      if [ -n "$GIT_TOKEN" ] && command -v gh &> /dev/null; then
        echo "$GIT_TOKEN" | gh auth login --with-token 2>/dev/null || echo "WARN: gh auth login failed (continuing)"
        echo "GitHub CLI authenticated"
      fi
    fi

    # Restore original stdout/stderr if tee was set up
    if [ -n "$FORWARDER_PID" ]; then
      exec 1>&3 2>&4 3>&- 4>&-
    fi

    echo "Workspace ready for invocations."

    # Write sentinel file so dispatch can detect startup completion
    touch /tmp/.seam-ready
  EOT

  env = merge(
    {
      GIT_AUTHOR_NAME      = data.coder_workspace_owner.me.name
      GIT_AUTHOR_EMAIL     = data.coder_workspace_owner.me.email
      GIT_COMMITTER_NAME   = data.coder_workspace_owner.me.name
      GIT_COMMITTER_EMAIL  = data.coder_workspace_owner.me.email
      # SEAM_URL is passed by the server with localhost already rewritten
      # to host.docker.internal when needed (WORKSPACE_SEAM_URL env var).
      SEAM_URL             = data.coder_parameter.seam_url.value
      SEAM_TOKEN           = data.coder_parameter.seam_token.value
      SEAM_WORKSPACE_ID    = data.coder_parameter.workspace_id.value
    },
    # Inject org + user credentials (e.g. CLAUDE_CODE_OAUTH_TOKEN, GIT_TOKEN)
    # directly into the agent env so they're available in SSH sessions.
    try(jsondecode(data.coder_parameter.credentials_json.value), {})
  )
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
  # agent_type label removed — ephemeral invocations pass perspective per-call
}
