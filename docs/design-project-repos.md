# Design: Project Git Repository Association

Status: Draft

## Problem

Projects currently have no link to a git repository. Tasks produce commits, but Seam doesn't know where code lives. Without this, we can't clone repos into sandboxes, track which commits belong to which tasks, or verify work against version history.

## Change

Add `repo_url` to the `projects` table.

```sql
ALTER TABLE projects
  ADD COLUMN repo_url TEXT,
  ADD COLUMN default_branch TEXT NOT NULL DEFAULT 'main';
```

- `repo_url`: HTTPS clone URL (e.g. `https://github.com/org/repo.git`)
- `default_branch`: branch agents should base work on (default `main`)
- Both nullable initially to avoid breaking existing projects

## API Surface

- `POST /api/projects` and `PUT /api/projects/:id` accept `repo_url` and `default_branch`
- `GET /api/projects/:id` returns them
- Frontend project settings page gets a "Repository" section

## Open Questions

- Do we validate the URL is reachable at creation time, or just store it?
- Do we support multiple repos per project (monorepo subpaths)?
- Authentication: how does the sandbox get clone credentials? (See sandbox design)
