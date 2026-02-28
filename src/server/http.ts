import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { sessionStore } from './store.js';

const PORT = parseInt(process.env['PORT'] ?? '3001', 10);

function sendJson(res: ServerResponse<IncomingMessage>, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const pathname = url.pathname;

  if (req.method === 'POST' && pathname === '/sessions') {
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const { creatorName } = JSON.parse(body) as { creatorName: string };
        const { session, creatorId } = sessionStore.createSession(creatorName);
        sendJson(res, 201, { code: session.code, participantId: creatorId });
      } catch {
        sendJson(res, 400, { error: 'Invalid request body' });
      }
    });
    return;
  }

  const joinMatch = pathname.match(/^\/sessions\/([^/]+)\/join$/);
  if (req.method === 'POST' && joinMatch) {
    const code = joinMatch[1];
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const { participantName } = JSON.parse(body) as { participantName: string };
        const result = sessionStore.joinSession(code, participantName);
        if (!result) {
          sendJson(res, 404, { error: 'Session not found' });
          return;
        }
        sendJson(res, 200, {
          participantId: result.participantId,
          participants: result.session.participants,
        });
      } catch {
        sendJson(res, 400, { error: 'Invalid request body' });
      }
    });
    return;
  }

  const sessionMatch = pathname.match(/^\/sessions\/([^/]+)$/);
  if (req.method === 'GET' && sessionMatch) {
    const code = sessionMatch[1];
    const session = sessionStore.getSession(code);
    if (!session) {
      sendJson(res, 404, { error: 'Session not found' });
      return;
    }
    sendJson(res, 200, { session });
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.error(`[http] server listening on port ${PORT}`);
});

export { sessionStore };
