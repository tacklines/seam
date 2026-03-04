-- Users (synced from Keycloak on first login)
CREATE TABLE users (
    id UUID PRIMARY KEY,
    external_id TEXT NOT NULL UNIQUE,  -- Keycloak sub claim
    username TEXT NOT NULL,
    email TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Organizations (tenant boundary)
CREATE TABLE organizations (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE org_members (
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (org_id, user_id)
);

-- Projects (within an organization)
CREATE TABLE projects (
    id UUID PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (org_id, slug)
);

CREATE TABLE project_members (
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('admin', 'member', 'viewer')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (project_id, user_id)
);

-- Sessions (within a project)
CREATE TABLE sessions (
    id UUID PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    code TEXT NOT NULL UNIQUE,
    name TEXT,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ
);

CREATE INDEX idx_sessions_code ON sessions(code);
CREATE INDEX idx_sessions_project ON sessions(project_id);

-- Human join codes (one per session, shareable)
CREATE TABLE session_join_codes (
    id UUID PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    code TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    used_count INT NOT NULL DEFAULT 0
);

CREATE INDEX idx_session_join_codes_code ON session_join_codes(code);

-- Agent join codes (per user per session)
CREATE TABLE agent_join_codes (
    id UUID PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (session_id, user_id)
);

CREATE INDEX idx_agent_join_codes_code ON agent_join_codes(code);

-- Participants (humans and agents in a session)
CREATE TABLE participants (
    id UUID PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    display_name TEXT NOT NULL,
    participant_type TEXT NOT NULL CHECK (participant_type IN ('human', 'agent')),
    sponsor_id UUID REFERENCES participants(id),  -- for agents: who spawned them
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_participants_session ON participants(session_id);
