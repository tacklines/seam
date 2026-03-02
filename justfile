# Seam

# Start frontend + backend for development
dev:
    npx vite & npx tsx src/server/http.ts

# Backend HTTP server only (port 3001)
server:
    npx tsx src/server/http.ts

# MCP server (stdio)
mcp:
    npx tsx src/server/mcp.ts

# Run tests
test:
    npx vitest run

# Watch tests
test-watch:
    npx vitest

# Type check
check:
    npx tsc --noEmit

# Type check server
check-server:
    npx tsc --noEmit -p tsconfig.server.json

# Build frontend
build:
    npx tsc && npx vite build

# Build server
build-server:
    npx tsc -p tsconfig.server.json
