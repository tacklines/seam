import http from 'node:http';
import { serializeSession } from '../lib/session-store.js';
import { sessionStore as store, eventStore } from './store.js';
import { createWebSocketServer } from './websocket.js';
import type { CandidateEventsFile } from '../schema/types.js';
import type { ServerResponse } from 'node:http';

const PORT = Number(process.env.PORT ?? 3002);
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://localhost:5173';

function addCorsHeaders(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': CORS_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(json);
}

function parseBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(body.length > 0 ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}


const server = http.createServer(async (req, res) => {
  const url = req.url ?? '/';
  const method = req.method ?? 'GET';

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    addCorsHeaders(res);
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    // POST /api/sessions — Create a new session
    if (method === 'POST' && url === '/api/sessions') {
      const body = await parseBody(req) as { creatorName?: string };
      const creatorName = body.creatorName;
      if (typeof creatorName !== 'string' || creatorName.trim() === '') {
        sendJson(res, 400, { error: 'creatorName is required' });
        return;
      }
      const { session, creatorId } = store.createSession(creatorName.trim());
      sendJson(res, 201, {
        code: session.code,
        participantId: creatorId,
        session: serializeSession(session),
      });
      return;
    }

    // POST /api/sessions/:code/join — Join an existing session
    const joinMatch = url.match(/^\/api\/sessions\/([^/]+)\/join$/);
    if (method === 'POST' && joinMatch) {
      const code = joinMatch[1];
      const body = await parseBody(req) as { participantName?: string };
      const participantName = body.participantName;
      if (typeof participantName !== 'string' || participantName.trim() === '') {
        sendJson(res, 400, { error: 'participantName is required' });
        return;
      }
      const result = store.joinSession(code, participantName.trim());
      if (!result) {
        sendJson(res, 404, { error: 'Session not found' });
        return;
      }
      const { session, participantId } = result;
      sendJson(res, 200, {
        participantId,
        session: serializeSession(session),
      });
      return;
    }

    // POST /api/sessions/:code/submit — Submit YAML data
    const submitMatch = url.match(/^\/api\/sessions\/([^/]+)\/submit$/);
    if (method === 'POST' && submitMatch) {
      const code = submitMatch[1];
      const body = await parseBody(req) as {
        participantId?: string;
        fileName?: string;
        data?: CandidateEventsFile;
      };

      const { participantId, fileName, data } = body;
      if (
        typeof participantId !== 'string' ||
        typeof fileName !== 'string' ||
        data == null
      ) {
        sendJson(res, 400, { error: 'participantId, fileName, and data are required' });
        return;
      }

      const submission = store.submitYaml(code, participantId, fileName, data);
      if (submission === null) {
        // Distinguish 404 (session not found) vs 403 (participant not in session)
        const session = store.getSession(code);
        if (!session) {
          sendJson(res, 404, { error: 'Session not found' });
        } else {
          sendJson(res, 403, { error: 'Participant not in session' });
        }
        return;
      }

      sendJson(res, 200, { submission });
      return;
    }

    // POST /api/sessions/:code/jam/start — Start jam session
    const jamStartMatch = url.match(/^\/api\/sessions\/([^/]+)\/jam\/start$/);
    if (method === 'POST' && jamStartMatch) {
      const code = jamStartMatch[1];
      const jam = store.startJam(code);
      if (!jam) {
        sendJson(res, 404, { error: 'Session not found' });
        return;
      }
      sendJson(res, 200, { jam });
      return;
    }

    // POST /api/sessions/:code/jam/resolve — Resolve a conflict
    const jamResolveMatch = url.match(/^\/api\/sessions\/([^/]+)\/jam\/resolve$/);
    if (method === 'POST' && jamResolveMatch) {
      const code = jamResolveMatch[1];
      const body = await parseBody(req) as {
        overlapLabel?: string;
        resolution?: string;
        chosenApproach?: string;
        resolvedBy?: string[];
      };
      if (!body.overlapLabel || !body.resolution || !body.chosenApproach || !body.resolvedBy) {
        sendJson(res, 400, { error: 'overlapLabel, resolution, chosenApproach, and resolvedBy are required' });
        return;
      }
      const result = store.resolveConflict(code, {
        overlapLabel: body.overlapLabel,
        resolution: body.resolution,
        chosenApproach: body.chosenApproach,
        resolvedBy: body.resolvedBy,
      });
      if (!result) {
        sendJson(res, 404, { error: 'Session not found or jam not started' });
        return;
      }
      sendJson(res, 200, { resolution: result });
      return;
    }

    // POST /api/sessions/:code/jam/assign — Assign aggregate ownership
    const jamAssignMatch = url.match(/^\/api\/sessions\/([^/]+)\/jam\/assign$/);
    if (method === 'POST' && jamAssignMatch) {
      const code = jamAssignMatch[1];
      const body = await parseBody(req) as {
        aggregate?: string;
        ownerRole?: string;
        assignedBy?: string;
      };
      if (!body.aggregate || !body.ownerRole || !body.assignedBy) {
        sendJson(res, 400, { error: 'aggregate, ownerRole, and assignedBy are required' });
        return;
      }
      const result = store.assignOwnership(code, {
        aggregate: body.aggregate,
        ownerRole: body.ownerRole,
        assignedBy: body.assignedBy,
      });
      if (!result) {
        sendJson(res, 404, { error: 'Session not found or jam not started' });
        return;
      }
      sendJson(res, 200, { assignment: result });
      return;
    }

    // POST /api/sessions/:code/jam/flag — Flag an unresolved item
    const jamFlagMatch = url.match(/^\/api\/sessions\/([^/]+)\/jam\/flag$/);
    if (method === 'POST' && jamFlagMatch) {
      const code = jamFlagMatch[1];
      const body = await parseBody(req) as {
        description?: string;
        relatedOverlap?: string;
        flaggedBy?: string;
      };
      if (!body.description || !body.flaggedBy) {
        sendJson(res, 400, { error: 'description and flaggedBy are required' });
        return;
      }
      const item: { description: string; relatedOverlap?: string; flaggedBy: string } = {
        description: body.description,
        flaggedBy: body.flaggedBy,
      };
      if (body.relatedOverlap) {
        item.relatedOverlap = body.relatedOverlap;
      }
      const result = store.flagUnresolved(code, item);
      if (!result) {
        sendJson(res, 404, { error: 'Session not found or jam not started' });
        return;
      }
      sendJson(res, 200, { item: result });
      return;
    }

    // GET /api/sessions/:code/jam — Export jam artifacts
    const jamExportMatch = url.match(/^\/api\/sessions\/([^/]+)\/jam$/);
    if (method === 'GET' && jamExportMatch) {
      const code = jamExportMatch[1];
      const jam = store.exportJam(code);
      if (!jam) {
        sendJson(res, 404, { error: 'Session not found or jam not started' });
        return;
      }
      sendJson(res, 200, { jam });
      return;
    }

    // POST /api/sessions/:code/messages — Send a message
    const messagesPostMatch = url.match(/^\/api\/sessions\/([^/]+)\/messages$/);
    if (method === 'POST' && messagesPostMatch) {
      const code = messagesPostMatch[1];
      const body = await parseBody(req) as {
        fromId?: string;
        content?: string;
        toId?: string;
      };
      if (!body.fromId || !body.content) {
        sendJson(res, 400, { error: 'fromId and content are required' });
        return;
      }
      const msg = store.sendMessage(code, body.fromId, body.content, body.toId);
      if (!msg) {
        sendJson(res, 404, { error: 'Session not found or participant not in session' });
        return;
      }
      sendJson(res, 201, { message: msg });
      return;
    }

    // GET /api/sessions/:code/messages — Get messages for a participant
    const messagesGetMatch = url.match(/^\/api\/sessions\/([^/]+)\/messages$/);
    if (method === 'GET' && messagesGetMatch) {
      const code = messagesGetMatch[1];
      const urlObj = new URL(url, `http://localhost:${PORT}`);
      const participantId = urlObj.searchParams.get('participantId');
      const since = urlObj.searchParams.get('since') ?? undefined;
      if (!participantId) {
        sendJson(res, 400, { error: 'participantId query param is required' });
        return;
      }
      const messages = store.getMessages(code, participantId, since);
      sendJson(res, 200, { messages, count: messages.length });
      return;
    }

    // GET /api/sessions/:code — Get session state
    const sessionMatch = url.match(/^\/api\/sessions\/([^/]+)$/);
    if (method === 'GET' && sessionMatch) {
      const code = sessionMatch[1];
      const session = store.getSession(code);
      if (!session) {
        sendJson(res, 404, { error: 'Session not found' });
        return;
      }
      sendJson(res, 200, { session: serializeSession(session) });
      return;
    }

    // 404 for anything else
    sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error('[http] error handling request:', err);
    sendJson(res, 500, { error: 'Internal server error' });
  }
});

// Attach WebSocket server to the HTTP server (handles /ws upgrades)
createWebSocketServer(server, eventStore);

// Guard against starting the server during test runs (vitest sets NODE_ENV=test)
if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => {
    console.log(`[http] session server listening on http://localhost:${PORT}`);
    console.log(`[ws]   WebSocket endpoint available at ws://localhost:${PORT}`);
  });
}
