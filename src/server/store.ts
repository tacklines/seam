import { SessionStore } from '../lib/session-store.js';

/** Shared singleton SessionStore used by both the HTTP server and MCP server. */
export const sessionStore = new SessionStore();
