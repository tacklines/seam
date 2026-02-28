import http from 'node:http';
import { serializeSession } from '../lib/session-store.js';
import { sessionStore as store } from './store.js';
import type { CandidateEventsFile } from '../schema/types.js';
import type { ServerResponse } from 'node:http';

const PORT = 3001;
const CORS_ORIGIN = 'http://localhost:5173';

// SSE clients per session code: code -> Set of response objects
const sseClients: Map<string, Set<ServerResponse>> = new Map();

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

function pushSseEvent(code: string, eventName: string, data: unknown): void {
  const clients = sseClients.get(code);
  if (!clients) return;
  const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    client.write(payload);
  }
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
      pushSseEvent(session.code, 'participant', {
        participantId,
        session: serializeSession(session),
      });
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

      pushSseEvent(code, 'submission', { submission });
      sendJson(res, 200, { submission });
      return;
    }

    // GET /api/sessions/:code/events — SSE stream
    const eventsMatch = url.match(/^\/api\/sessions\/([^/]+)\/events$/);
    if (method === 'GET' && eventsMatch) {
      const code = eventsMatch[1].toUpperCase();
      const session = store.getSession(code);
      if (!session) {
        sendJson(res, 404, { error: 'Session not found' });
        return;
      }

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': CORS_ORIGIN,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });

      // Register client
      if (!sseClients.has(code)) {
        sseClients.set(code, new Set());
      }
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      sseClients.get(code)!.add(res);

      // Send initial state
      res.write(`: connected\n\n`);

      // Keep-alive every 30 seconds
      const keepAlive = setInterval(() => {
        res.write(`: keep-alive\n\n`);
      }, 30_000);

      req.on('close', () => {
        clearInterval(keepAlive);
        sseClients.get(code)?.delete(res);
        if (sseClients.get(code)?.size === 0) {
          sseClients.delete(code);
        }
      });

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

server.listen(PORT, () => {
  console.log(`[http] session server listening on http://localhost:${PORT}`);
});
