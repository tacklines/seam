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

data "coder_parameter" "instructions" {
  name         = "instructions"
  display_name = "Custom Instructions"
  description  = "Optional instructions for the agent."
  type         = "string"
  mutable      = true
  default      = ""
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

    # Clone repo if specified and /workspace is empty
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

    # Configure Seam MCP tools if agent_code is provided
    if [ -n "${data.coder_parameter.agent_code.value}" ] && [ -n "${data.coder_parameter.seam_url.value}" ]; then
      echo "Configuring Seam MCP connection..."

      mkdir -p /workspace/.claude
      cat > /workspace/.claude/settings.local.json <<SETTINGS
    {
      "mcpServers": {
        "seam": {
          "url": "${data.coder_parameter.seam_url.value}/mcp"
        }
      }
    }
    SETTINGS

      echo "Seam MCP configured: ${data.coder_parameter.seam_url.value}/mcp"
      echo "Agent code: ${data.coder_parameter.agent_code.value}"
      echo "Agent type: ${data.coder_parameter.agent_type.value}"
    fi

    echo "Workspace ready."
  EOT

  env = {
    GIT_AUTHOR_NAME    = data.coder_workspace_owner.me.name
    GIT_AUTHOR_EMAIL   = data.coder_workspace_owner.me.email
    SEAM_URL           = data.coder_parameter.seam_url.value
    SEAM_AGENT_CODE    = data.coder_parameter.agent_code.value
    SEAM_AGENT_TYPE    = data.coder_parameter.agent_type.value
    SEAM_INSTRUCTIONS  = data.coder_parameter.instructions.value
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
