import http from 'node:http';
import { serializeSession } from '../lib/session-store.js';
import { sessionStore as store, eventStore } from './store.js';
import { createWebSocketServer, broadcastRequirements } from './websocket.js';
import { A2ATaskStore, createA2AHandlers, isA2ARoute, parseA2ABody, buildAgentCard } from './a2a.js';
import { presenceTracker } from './presence.js';
import type { CandidateEventsFile } from '../schema/types.js';
import type { ServerResponse } from 'node:http';
import { compareFiles } from '../lib/comparison.js';
import { suggestResolutionHeuristic, runIntegrationChecks, deriveOverallStatus } from '../lib/integration-heuristics.js';
import { deriveFromRequirements } from '../lib/requirement-derivation.js';
import type { Requirement } from '../schema/types.js';
import { PrioritizationService } from '../contexts/prioritization/prioritization-service.js';

const PORT = Number(process.env.PORT ?? 3002);
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://localhost:5173';

// A2A task store and handlers (singleton, shared with HTTP request handling)
const a2aTaskStore = new A2ATaskStore();
const a2aHandlers = createA2AHandlers(a2aTaskStore, store);

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

    // POST /api/sessions/:code/presence/heartbeat — Update participant heartbeat
    const presenceHeartbeatMatch = url.match(/^\/api\/sessions\/([^/]+)\/presence\/heartbeat$/);
    if (method === 'POST' && presenceHeartbeatMatch) {
      const code = presenceHeartbeatMatch[1];
      const body = await parseBody(req) as { participantId?: string; participantName?: string };
      if (!body.participantId) {
        sendJson(res, 400, { error: 'participantId is required' });
        return;
      }
      presenceTracker.heartbeat(code, body.participantId, body.participantName ?? '');
      sendJson(res, 200, { presence: presenceTracker.getPresence(code) });
      return;
    }

    // POST /api/sessions/:code/presence/view — Set current view for participant
    const presenceViewMatch = url.match(/^\/api\/sessions\/([^/]+)\/presence\/view$/);
    if (method === 'POST' && presenceViewMatch) {
      const code = presenceViewMatch[1];
      const body = await parseBody(req) as { participantId?: string; view?: string };
      if (!body.participantId || !body.view) {
        sendJson(res, 400, { error: 'participantId and view are required' });
        return;
      }
      presenceTracker.setView(code, body.participantId, body.view);
      sendJson(res, 200, { presence: presenceTracker.getPresence(code) });
      return;
    }

    // GET /api/sessions/:code/presence — Get presence info for session
    const presenceGetMatch = url.match(/^\/api\/sessions\/([^/]+)\/presence$/);
    if (method === 'GET' && presenceGetMatch) {
      const code = presenceGetMatch[1];
      sendJson(res, 200, { presence: presenceTracker.getPresence(code) });
      return;
    }

    // POST /api/sessions/:code/suggest-resolution — Get heuristic resolution suggestion
    const suggestResolutionMatch = url.match(/^\/api\/sessions\/([^/]+)\/suggest-resolution$/);
    if (method === 'POST' && suggestResolutionMatch) {
      const code = suggestResolutionMatch[1];
      const session = store.getSession(code);
      if (!session) {
        sendJson(res, 404, { error: 'Session not found' });
        return;
      }
      const body = await parseBody(req) as { overlapLabel?: string };
      if (typeof body.overlapLabel !== 'string' || body.overlapLabel.trim() === '') {
        sendJson(res, 400, { error: 'overlapLabel is required' });
        return;
      }
      const overlapLabel = body.overlapLabel.trim();
      const files = store.getSessionFiles(code);
      const overlaps = compareFiles(files);
      const overlap = overlaps.find((o) => o.label === overlapLabel);
      const overlapKind = overlap?.kind ?? 'same-name';
      const suggestion = suggestResolutionHeuristic(overlapKind, overlapLabel);
      sendJson(res, 200, { suggestion });
      return;
    }

    // POST /api/sessions/:code/requirements — Submit a requirement
    const requirementsMatch = url.match(/^\/api\/sessions\/([^/]+)\/requirements$/);
    if (method === 'POST' && requirementsMatch) {
      const code = requirementsMatch[1];
      const body = await parseBody(req) as {
        participantId?: string;
        statement?: string;
        tags?: string[];
      };
      if (typeof body.participantId !== 'string' || typeof body.statement !== 'string' || !body.statement.trim()) {
        sendJson(res, 400, { error: 'participantId and statement are required' });
        return;
      }
      const session = store.getSession(code);
      if (!session) {
        sendJson(res, 404, { error: 'Session not found' });
        return;
      }
      const requirement = store.addRequirement(code, body.participantId, body.statement.trim(), body.tags);
      if (!requirement) {
        sendJson(res, 403, { error: 'Participant not in session' });
        return;
      }
      broadcastRequirements(code.toUpperCase(), store.getRequirements(code));
      sendJson(res, 201, { requirement });
      return;
    }

    // POST /api/sessions/:code/requirements/derive — Derive events from requirements
    const requirementsDeriveMatch = url.match(/^\/api\/sessions\/([^/]+)\/requirements\/derive$/);
    if (method === 'POST' && requirementsDeriveMatch) {
      const code = requirementsDeriveMatch[1];
      const body = await parseBody(req) as { requirementIds?: string[] };
      if (!Array.isArray(body.requirementIds) || body.requirementIds.length === 0) {
        sendJson(res, 400, { error: 'requirementIds array is required' });
        return;
      }
      const session = store.getSession(code);
      if (!session) {
        sendJson(res, 404, { error: 'Session not found' });
        return;
      }
      const allRequirements = store.getRequirements(code);
      const selected = allRequirements.filter(r => body.requirementIds!.includes(r.id));
      const files = store.getSessionFiles(code);
      const existingEventNames = files.flatMap(f => f.data.domain_events.map(ev => ev.name));
      const results = deriveFromRequirements(selected, existingEventNames);
      sendJson(res, 200, { results });
      return;
    }

    // POST /api/sessions/:code/requirements/:reqId/accept — Accept derived events
    const requirementsAcceptMatch = url.match(/^\/api\/sessions\/([^/]+)\/requirements\/([^/]+)\/accept$/);
    if (method === 'POST' && requirementsAcceptMatch) {
      const code = requirementsAcceptMatch[1];
      const reqId = requirementsAcceptMatch[2];
      const body = await parseBody(req) as {
        participantId?: string;
        eventNames?: string[];
      };
      if (typeof body.participantId !== 'string' || !Array.isArray(body.eventNames)) {
        sendJson(res, 400, { error: 'participantId and eventNames are required' });
        return;
      }
      const session = store.getSession(code);
      if (!session) {
        sendJson(res, 404, { error: 'Session not found' });
        return;
      }
      const existing = store.getRequirement(code, reqId);
      if (!existing) {
        sendJson(res, 404, { error: 'Requirement not found' });
        return;
      }
      const merged = [...existing.derivedEvents, ...body.eventNames];
      const requirement = store.updateRequirement(code, reqId, {
        derivedEvents: merged,
        status: existing.status === 'draft' ? 'active' : existing.status,
      });
      broadcastRequirements(code.toUpperCase(), store.getRequirements(code));
      sendJson(res, 200, { requirement });
      return;
    }

    // POST /api/sessions/:code/priorities — Set a priority tier for a domain event
    const prioritiesPostMatch = url.match(/^\/api\/sessions\/([^/]+)\/priorities$/);
    if (method === 'POST' && prioritiesPostMatch) {
      const code = prioritiesPostMatch[1];
      const body = await parseBody(req) as {
        participantId?: string;
        eventName?: string;
        tier?: string;
      };
      if (
        typeof body.participantId !== 'string' ||
        typeof body.eventName !== 'string' ||
        typeof body.tier !== 'string'
      ) {
        sendJson(res, 400, { error: 'participantId, eventName, and tier are required' });
        return;
      }
      if (body.tier !== 'must_have' && body.tier !== 'should_have' && body.tier !== 'could_have') {
        sendJson(res, 400, { error: 'tier must be must_have, should_have, or could_have' });
        return;
      }
      const service = new PrioritizationService((c) => store.getSession(c));
      const priority = service.setPriority(code, {
        participantId: body.participantId,
        eventName: body.eventName,
        tier: body.tier,
      });
      if (!priority) {
        sendJson(res, 404, { error: 'Session not found' });
        return;
      }
      sendJson(res, 200, { priority });
      return;
    }

    // POST /api/sessions/:code/votes — Cast a vote on a domain event
    const votesPostMatch = url.match(/^\/api\/sessions\/([^/]+)\/votes$/);
    if (method === 'POST' && votesPostMatch) {
      const code = votesPostMatch[1];
      const body = await parseBody(req) as {
        participantId?: string;
        eventName?: string;
        direction?: string;
      };
      if (
        typeof body.participantId !== 'string' ||
        typeof body.eventName !== 'string' ||
        typeof body.direction !== 'string'
      ) {
        sendJson(res, 400, { error: 'participantId, eventName, and direction are required' });
        return;
      }
      if (body.direction !== 'up' && body.direction !== 'down') {
        sendJson(res, 400, { error: 'direction must be up or down' });
        return;
      }
      const service = new PrioritizationService((c) => store.getSession(c));
      const vote = service.castVote(code, {
        participantId: body.participantId,
        eventName: body.eventName,
        direction: body.direction,
      });
      if (!vote) {
        sendJson(res, 404, { error: 'Session not found' });
        return;
      }
      const session = store.getSession(code);
      const eventVotes = session?.votes.filter((v) => v.eventName === body.eventName) ?? [];
      const upvotes = eventVotes.filter((v) => v.direction === 'up').length;
      const downvotes = eventVotes.filter((v) => v.direction === 'down').length;
      const netCount = upvotes - downvotes;
      sendJson(res, 200, { vote, netCount });
      return;
    }

    // GET /api/sessions/:code/priorities — Get composite priority scores
    const prioritiesGetMatch = url.match(/^\/api\/sessions\/([^/]+)\/priorities$/);
    if (method === 'GET' && prioritiesGetMatch) {
      const code = prioritiesGetMatch[1];
      const service = new PrioritizationService((c) => store.getSession(c));
      const scores = service.computeCompositeScores(code);
      if (!scores) {
        sendJson(res, 404, { error: 'Session not found' });
        return;
      }
      const events = scores.map((s) => {
        const upvotes = s.votes.filter((v) => v.direction === 'up').length;
        const downvotes = s.votes.filter((v) => v.direction === 'down').length;
        const tierCounts: Record<string, number> = {};
        for (const p of s.priorities) {
          tierCounts[p.tier] = (tierCounts[p.tier] ?? 0) + 1;
        }
        const topTier =
          Object.entries(tierCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'could_have';
        return {
          name: s.eventName,
          tier: topTier,
          score: s.compositeScore,
          votes: upvotes - downvotes,
        };
      });
      sendJson(res, 200, { events });
      return;
    }

    // GET /api/sessions/:code/resolutions — List all recorded conflict resolutions
    const resolutionsMatch = url.match(/^\/api\/sessions\/([^/]+)\/resolutions$/);
    if (method === 'GET' && resolutionsMatch) {
      const code = resolutionsMatch[1];
      const session = store.getSession(code);
      if (!session) {
        sendJson(res, 404, { error: 'Session not found' });
        return;
      }
      sendJson(res, 200, { resolutions: session.jam?.resolutions ?? [] });
      return;
    }

    // GET /api/sessions/:code/ownership — List ownership assignments
    const ownershipMatch = url.match(/^\/api\/sessions\/([^/]+)\/ownership$/);
    if (method === 'GET' && ownershipMatch) {
      const code = ownershipMatch[1];
      const session = store.getSession(code);
      if (!session) {
        sendJson(res, 404, { error: 'Session not found' });
        return;
      }
      sendJson(res, 200, { ownership: session.jam?.ownershipMap ?? [] });
      return;
    }

    // GET /api/sessions/:code/contracts — Get contracts
    const contractsMatch = url.match(/^\/api\/sessions\/([^/]+)\/contracts$/);
    if (method === 'GET' && contractsMatch) {
      const code = contractsMatch[1];
      const session = store.getSession(code);
      if (!session) {
        sendJson(res, 404, { error: 'Session not found' });
        return;
      }
      sendJson(res, 200, { contracts: session.contracts });
      return;
    }

    // POST /api/sessions/:code/compliance — Check compliance
    const complianceMatch = url.match(/^\/api\/sessions\/([^/]+)\/compliance$/);
    if (method === 'POST' && complianceMatch) {
      const code = complianceMatch[1];
      const body = await parseBody(req) as { participantId?: string };
      if (typeof body.participantId !== 'string' || !body.participantId) {
        sendJson(res, 400, { error: 'participantId is required' });
        return;
      }
      const session = store.getSession(code);
      if (!session) {
        sendJson(res, 404, { error: 'Session not found' });
        return;
      }
      const files = store.getSessionFiles(code);
      const allAggregates = [
        ...new Set(files.flatMap((f) => f.data.domain_events.map((e) => e.aggregate))),
      ];
      const allEventNames = [
        ...new Set(files.flatMap((f) => f.data.domain_events.map((e) => e.name))),
      ];
      const checks = runIntegrationChecks({
        jam: session.jam,
        contracts: session.contracts,
        workItems: session.workItems,
        allAggregates,
        allEventNames,
      });
      sendJson(res, 200, { checks });
      return;
    }

    // GET /api/sessions/:code/integration-report — Get integration report
    const integrationReportMatch = url.match(/^\/api\/sessions\/([^/]+)\/integration-report$/);
    if (method === 'GET' && integrationReportMatch) {
      const code = integrationReportMatch[1];
      const session = store.getSession(code);
      if (!session) {
        sendJson(res, 404, { error: 'Session not found' });
        return;
      }
      sendJson(res, 200, { report: session.integrationReport });
      return;
    }

    // POST /api/sessions/:code/integration-check — Run integration check
    const integrationCheckMatch = url.match(/^\/api\/sessions\/([^/]+)\/integration-check$/);
    if (method === 'POST' && integrationCheckMatch) {
      const code = integrationCheckMatch[1];
      const body = await parseBody(req) as { participantId?: string };
      if (typeof body.participantId !== 'string' || !body.participantId) {
        sendJson(res, 400, { error: 'participantId is required' });
        return;
      }
      const session = store.getSession(code);
      if (!session) {
        sendJson(res, 404, { error: 'Session not found' });
        return;
      }
      const files = store.getSessionFiles(code);
      const allAggregates = [
        ...new Set(files.flatMap((f) => f.data.domain_events.map((e) => e.aggregate))),
      ];
      const allEventNames = [
        ...new Set(files.flatMap((f) => f.data.domain_events.map((e) => e.name))),
      ];
      const checks = runIntegrationChecks({
        jam: session.jam,
        contracts: session.contracts,
        workItems: session.workItems,
        allAggregates,
        allEventNames,
      });
      const status = deriveOverallStatus(checks);
      sendJson(res, 200, { checks, status });
      return;
    }

    // GET /api/sessions/:code/go-no-go — Get go/no-go verdict
    const goNoGoMatch = url.match(/^\/api\/sessions\/([^/]+)\/go-no-go$/);
    if (method === 'GET' && goNoGoMatch) {
      const code = goNoGoMatch[1];
      const session = store.getSession(code);
      if (!session) {
        sendJson(res, 404, { error: 'Session not found' });
        return;
      }
      if (!session.contracts) {
        sendJson(res, 200, { verdict: 'pending', summary: 'No contracts defined yet' });
        return;
      }
      const files = store.getSessionFiles(code);
      const allAggregates = [
        ...new Set(files.flatMap((f) => f.data.domain_events.map((e) => e.aggregate))),
      ];
      const allEventNames = [
        ...new Set(files.flatMap((f) => f.data.domain_events.map((e) => e.name))),
      ];
      const checks = runIntegrationChecks({
        jam: session.jam,
        contracts: session.contracts,
        workItems: session.workItems,
        allAggregates,
        allEventNames,
      });
      const overallStatus = deriveOverallStatus(checks);
      const verdict: 'go' | 'no-go' | 'pending' = overallStatus === 'fail' ? 'no-go' : overallStatus === 'pass' ? 'go' : 'pending';
      const failCount = checks.filter((c) => c.status === 'fail').length;
      const warnCount = checks.filter((c) => c.status === 'warn').length;
      const passCount = checks.filter((c) => c.status === 'pass').length;
      const summary =
        verdict === 'go'
          ? `GO: All ${passCount} check(s) passed — session is ready to ship`
          : verdict === 'no-go'
          ? `NO-GO: ${failCount} check(s) failed — resolve issues before shipping`
          : `PENDING: ${warnCount} warning(s) present — review before shipping`;
      sendJson(res, 200, { verdict, summary, checks });
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

    // GET /.well-known/agent.json — A2A Agent Card
    if (method === 'GET' && url === '/.well-known/agent.json') {
      const baseUrl = `${req.headers['x-forwarded-proto'] ?? 'http'}://${req.headers.host ?? `localhost:${PORT}`}`;
      const card = a2aHandlers.onAgentCard(baseUrl);
      sendJson(res, 200, card);
      return;
    }

    // POST /a2a — A2A JSON-RPC endpoint
    if (method === 'POST' && url === '/a2a') {
      const rawBody = await parseBody(req) as unknown;
      // parseBody already JSON.parsed the body; pass it directly
      const rpcResponse = a2aHandlers.onRpc(rawBody);
      sendJson(res, 200, rpcResponse);
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
