# Task Provenance & Commit Enforcement

## Goal

Make commit tracking explicit and required on task closure, and add source attribution
when work on one task produces new tasks.

## Changes

### 1. Database Migration (021)
- Add `commit_hashes TEXT[] NOT NULL DEFAULT '{}'` to tasks
- Add `no_code_change BOOLEAN NOT NULL DEFAULT false` to tasks
- Add `source_task_id UUID REFERENCES tasks(id)` to tasks (provenance)
- Migrate existing `commit_sha` data into `commit_hashes`
- Drop `commit_sha` column
- No DB-level CHECK on close (enforced at app layer since it's status-dependent)

### 2. Backend (Rust)
- Update `Task` struct: `commit_hashes: Vec<String>`, `no_code_change: bool`, `source_task_id: Option<Uuid>`
- Update `TaskView`, `TaskSummaryView` (add `source_task_id`)
- Update `UpdateTaskRequest`: `commit_hashes`, `no_code_change`
- Enforce on close: either `no_code_change = true` OR `commit_hashes` non-empty
- Update all SQL queries in routes/tasks.rs
- Add `source_task_id` to CreateTaskRequest
- Add provenance edges to dependency graph endpoint

### 3. MCP Handler
- `CloseTaskParams`: `commit_hashes: Vec<String>`, `no_code_change: bool`
- `CreateTaskParams`: `source_task_id: Option<String>`
- `UpdateTaskParams`: `commit_hashes`, `no_code_change`
- Enforce same close validation

### 4. Frontend Types & API
- Update `TaskView` interface
- Update `task-api.ts` update/create calls
- Add `DependencyGraphView` provenance edges

### 5. Frontend Task Detail
- Replace single commit SHA input with multi-commit chip list
- Add "No code change" checkbox
- Show source attribution link when `source_task_id` is set

### 6. Frontend Graph
- Show provenance edges (dashed, different color) alongside dependency edges
- Show commit indicator on graph cards for closed tasks

## Validation Rules
- Closing a task (status → done/closed) requires either:
  - `no_code_change = true`, OR
  - `commit_hashes` contains at least one entry
- Error message guides the user to add commits or mark as no-code-change
