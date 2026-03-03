# /status -- Session Orientation

Orient a new session by reading persistent state.

## Usage

`/status`

## Steps

1. Read `memory/MEMORY.md` for project context
2. Read `memory/sessions/last.md` for previous session state
3. Run `tk ready` to see available work
4. Run `git status` and `git log --oneline -5` for repo state
5. Summarize: what was done last, what is ready now, any blockers

## Output

Brief status report (10-15 lines max). End with a recommended next action.
