# Learnings: architect

## Codebase Patterns
- Schema is the contract: YAML files validate against `src/schema/candidate-events.schema.json` (DO NOT MODIFY this file -- shared with tackline pipeline)
- State is a singleton pub/sub store at `src/state/app-state.ts`, framework-independent
- Path alias `@` maps to `/src` in both Vite and vitest configs
- MCP server entrypoint at `src/server/mcp.ts`, built via `tsconfig.server.json` to `dist-server/` (added: 2026-02-28, dispatch: bead-usw)
- MCP SDK imports: `@modelcontextprotocol/sdk/server/mcp.js` (McpServer) and `@modelcontextprotocol/sdk/server/stdio.js` (StdioServerTransport) (added: 2026-02-28, dispatch: bead-usw)

## Gotchas
- Server tsconfig must set `allowImportingTsExtensions: false` (incompatible with `noEmit: false`) and `"types": ["node"]` (added: 2026-02-28, dispatch: bead-fk3)
- tsconfig include globs must end `/**/*` not `/**` — TypeScript rejects bare `**` as terminal (added: 2026-02-28, dispatch: bead-usw)
- MCP stdio transport reserves stdout for JSON-RPC — all logging must use `console.error()` (added: 2026-02-28, dispatch: bead-usw)

## Preferences
- (none yet)

## Cross-Agent Notes
- (none yet)
