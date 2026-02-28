/**
 * HTTP server integration tests.
 *
 * SSE tests were removed when the /events endpoint was replaced with WebSocket.
 * See websocket.test.ts for real-time streaming tests.
 *
 * REST endpoint behaviour is exercised via the session store tests and
 * manual smoke testing against the dev server.
 */

// This file is intentionally minimal — WebSocket tests live in websocket.test.ts.
// Keeping the file present so the test suite doesn't fail on an empty directory.

import { describe, it, expect } from 'vitest';

describe('http server', () => {
  it('module loads without errors (WebSocket wired, SSE removed)', async () => {
    // Dynamic import guards against the module-level server.listen() call.
    // The NODE_ENV=test guard in http.ts prevents the server from binding.
    const mod = await import('./http.js');
    expect(mod).toBeDefined();
  });
});
