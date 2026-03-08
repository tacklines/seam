-- Make workspace_id nullable on invocations so records can be created before
-- workspace resolution completes (two-phase async dispatch).
--
-- When workspace_id IS NULL the invocation is in 'pending' status while a
-- background task resolves (or provisions) the workspace.  Once the workspace
-- is ready the background task sets workspace_id and hands off to
-- dispatch_invocation, which then transitions the row to 'running'.

ALTER TABLE invocations ALTER COLUMN workspace_id DROP NOT NULL;
