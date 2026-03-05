CREATE TABLE requirements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES requirements(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'active', 'satisfied', 'archived')),
    priority TEXT NOT NULL DEFAULT 'medium'
        CHECK (priority IN ('critical', 'high', 'medium', 'low')),
    created_by UUID NOT NULL REFERENCES users(id),
    session_id UUID REFERENCES sessions(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Link requirements to tasks they generated
CREATE TABLE requirement_tasks (
    requirement_id UUID NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    PRIMARY KEY (requirement_id, task_id)
);

CREATE INDEX idx_requirements_project ON requirements(project_id, status);
CREATE INDEX idx_requirements_parent ON requirements(parent_id);
CREATE INDEX idx_requirement_tasks_task ON requirement_tasks(task_id);
