import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { store } from '../state/app-state.js';

// store is imported to establish the connection point for downstream tool beads.
// It is not used directly here but ensures the state module is part of the server bundle.
void store;

async function main(): Promise<void> {
  const server = new McpServer({
    name: 'multi-human-workflows',
    version: '0.1.0',
  });

  const transport = new StdioServerTransport();

  console.error('[mcp] starting multi-human-workflows MCP server');

  await server.connect(transport);

  console.error('[mcp] server connected via stdio transport');
}

main().catch((err: unknown) => {
  console.error('[mcp] fatal error:', err);
  process.exit(1);
});
