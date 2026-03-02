/**
 * A2A (Agent-to-Agent) Protocol implementation.
 *
 * Exposes this platform to external AI agents via the A2A protocol:
 *   - Agent Card at /.well-known/agent.json  (agent discovery)
 *   - JSON-RPC 2.0 endpoint at /a2a          (task communication)
 *
 * Supported JSON-RPC methods:
 *   message/send   — initiate a task from an external agent
 *   tasks/get      — poll task status
 *   tasks/cancel   — request task cancellation
 *
 * Each task routes to a platform operation via its `skill` field:
 *   create_session     → SessionStore.createSession
 *   join_session       → SessionStore.joinSession
 *   submit_artifact    → SessionStore.submitYaml
 *   get_session        → SessionStore.getSession
 *   start_jam          → SessionStore.startJam
 *   compare_artifacts  → compareFiles
 *   query_prep_status  → computeSessionStatus
 *
 * Authentication: bearer token via Authorization header. This module does not
 * validate tokens — that is handled by the auth middleware layer (a6r.25).
 * The Agent Card advertises bearer auth requirements for discovery purposes.
 *
 * Storage: in-memory Map (no persistence needed; tasks are short-lived).
 *
 * Protocol reference: https://a2a-protocol.org/v0.2.5/specification/
 */

import { z } from 'zod';
import type { SessionStore } from '../lib/session-store.js';
import { compareFiles } from '../lib/comparison.js';
import { computeSessionStatus } from '../lib/prep-completeness.js';
import { generateId } from '../lib/session-store.js';

// ---------------------------------------------------------------------------
// A2A Protocol Types
// ---------------------------------------------------------------------------

export type TaskState =
  | 'submitted'
  | 'working'
  | 'input-required'
  | 'completed'
  | 'failed'
  | 'canceled'
  | 'rejected'
  | 'unknown';

export interface TaskStatus {
  state: TaskState;
  message?: string;
  timestamp: string;
}

export interface TextPart {
  kind: 'text';
  text: string;
  metadata?: Record<string, unknown>;
}

export interface DataPart {
  kind: 'data';
  data: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export type Part = TextPart | DataPart;

export interface Message {
  role: 'user' | 'agent';
  parts: Part[];
  messageId?: string;
  taskId?: string;
  contextId?: string;
}

export interface TaskArtifact {
  artifactId: string;
  name?: string;
  parts: Part[];
}

export interface A2ATask {
  id: string;
  contextId: string;
  status: TaskStatus;
  artifacts?: TaskArtifact[];
  history?: Message[];
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// JSON-RPC 2.0 Types
// ---------------------------------------------------------------------------

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
  id: string | number | null;
}

export interface JsonRpcSuccess {
  jsonrpc: '2.0';
  id: string | number | null;
  result: unknown;
}

export interface JsonRpcError {
  jsonrpc: '2.0';
  id: string | number | null;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export type JsonRpcResponse = JsonRpcSuccess | JsonRpcError;

// JSON-RPC standard error codes
const RPC_PARSE_ERROR = -32700;
const RPC_INVALID_REQUEST = -32600;
const RPC_METHOD_NOT_FOUND = -32601;
const RPC_INVALID_PARAMS = -32602;
const RPC_INTERNAL_ERROR = -32603;

// A2A-specific error codes (application-defined range: -32000 to -32099)
const A2A_TASK_NOT_FOUND = -32001;
const A2A_TASK_NOT_CANCELABLE = -32002;

// ---------------------------------------------------------------------------
// Agent Card
// ---------------------------------------------------------------------------

export interface AgentSkill {
  id: string;
  name: string;
  description: string;
  tags: string[];
  examples: string[];
  inputModes: string[];
  outputModes: string[];
}

export interface AgentCard {
  protocolVersion: string;
  name: string;
  description: string;
  url: string;
  provider: {
    organization: string;
    url: string;
  };
  version: string;
  capabilities: {
    streaming: boolean;
    pushNotifications: boolean;
    stateTransitionHistory: boolean;
  };
  securitySchemes: Record<string, unknown>;
  security: Array<Record<string, string[]>>;
  defaultInputModes: string[];
  defaultOutputModes: string[];
  skills: AgentSkill[];
}

/**
 * Generate the Agent Card for this platform.
 *
 * The `baseUrl` should be the public HTTPS URL of the server in production
 * (e.g. "https://api.example.com"). In development, HTTP localhost is fine.
 */
export function buildAgentCard(baseUrl: string): AgentCard {
  return {
    protocolVersion: '0.2.5',
    name: 'Seam',
    description:
      'The boundary negotiation platform where teams and AI agents turn integration assumptions ' +
      'into verified contracts. Supports session management, perspective submission, cross-role ' +
      'comparison, conflict resolution, and contract formalization.',
    url: `${baseUrl}/a2a`,
    provider: {
      organization: 'Seam',
      url: baseUrl,
    },
    version: '0.1.0',
    capabilities: {
      streaming: false,
      pushNotifications: false,
      stateTransitionHistory: false,
    },
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Keycloak-issued JWT bearer token. Obtain via OAuth2 authorization code flow against the Keycloak realm.',
      },
    },
    security: [{ bearerAuth: [] }],
    defaultInputModes: ['application/json'],
    defaultOutputModes: ['application/json'],
    skills: [
      {
        id: 'create_session',
        name: 'Create Session',
        description: 'Create a new collaborative boundary negotiation session. Returns a join code and creator participant ID.',
        tags: ['session', 'workflow'],
        examples: ['Start a new Seam session with team members'],
        inputModes: ['application/json'],
        outputModes: ['application/json'],
      },
      {
        id: 'join_session',
        name: 'Join Session',
        description: 'Join an existing session using a 6-character join code. Returns a participant ID for subsequent operations.',
        tags: ['session', 'workflow'],
        examples: ['Join session ABC123 as a participant named "Frontend Team"'],
        inputModes: ['application/json'],
        outputModes: ['application/json'],
      },
      {
        id: 'submit_artifact',
        name: 'Submit Artifact',
        description: 'Submit a validated candidate-events YAML artifact to a session. The data must conform to the candidate-events schema.',
        tags: ['artifact', 'workflow'],
        examples: ['Submit domain events YAML for the Payments bounded context'],
        inputModes: ['application/json'],
        outputModes: ['application/json'],
      },
      {
        id: 'get_session',
        name: 'Get Session',
        description: 'Retrieve the current state of a session including participants, submissions, jam artifacts, and workflow phase.',
        tags: ['session', 'query'],
        examples: ['Check how many participants have submitted artifacts'],
        inputModes: ['application/json'],
        outputModes: ['application/json'],
      },
      {
        id: 'start_jam',
        name: 'Start Jam Session',
        description: 'Transition a session into the collaborative resolution phase. Required before recording resolutions or assigning ownership.',
        tags: ['jam', 'workflow'],
        examples: ['Begin conflict resolution after all artifacts are submitted'],
        inputModes: ['application/json'],
        outputModes: ['application/json'],
      },
      {
        id: 'compare_artifacts',
        name: 'Compare Artifacts',
        description: 'Cross-compare submitted artifacts to identify overlapping events, aggregate conflicts, and assumption conflicts.',
        tags: ['comparison', 'analysis'],
        examples: ['Find all events that appear in multiple participants\' submissions'],
        inputModes: ['application/json'],
        outputModes: ['application/json'],
      },
      {
        id: 'query_prep_status',
        name: 'Query Prep Status',
        description: 'Compute completeness scores for submitted artifacts. Returns event counts, confidence breakdown, and per-file scores (0-100).',
        tags: ['analysis', 'query'],
        examples: ['Check if all submitted artifacts have sufficient confidence coverage'],
        inputModes: ['application/json'],
        outputModes: ['application/json'],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Task Store
// ---------------------------------------------------------------------------

export class A2ATaskStore {
  private readonly tasks = new Map<string, A2ATask>();

  create(params: { skill: string; input: Record<string, unknown> }): A2ATask {
    const id = generateId();
    const contextId = generateId();
    const task: A2ATask = {
      id,
      contextId,
      status: {
        state: 'submitted',
        timestamp: new Date().toISOString(),
      },
      metadata: { skill: params.skill, input: params.input },
    };
    this.tasks.set(id, task);
    return task;
  }

  get(id: string): A2ATask | undefined {
    return this.tasks.get(id);
  }

  update(id: string, patch: Partial<Pick<A2ATask, 'status' | 'artifacts'>>): A2ATask | undefined {
    const task = this.tasks.get(id);
    if (!task) return undefined;
    if (patch.status) task.status = patch.status;
    if (patch.artifacts) task.artifacts = patch.artifacts;
    this.tasks.set(id, task);
    return task;
  }

  /** Return all tasks (for testing / introspection). */
  all(): A2ATask[] {
    return Array.from(this.tasks.values());
  }

  /** Delete a task by ID (used internally after completion, if desired). */
  delete(id: string): void {
    this.tasks.delete(id);
  }
}

// ---------------------------------------------------------------------------
// Zod Schemas for message/send params
// ---------------------------------------------------------------------------

const TextPartSchema = z.object({
  kind: z.literal('text'),
  text: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const DataPartSchema = z.object({
  kind: z.literal('data'),
  data: z.record(z.string(), z.unknown()),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const PartSchema = z.discriminatedUnion('kind', [TextPartSchema, DataPartSchema]);

const MessageSchema = z.object({
  role: z.enum(['user', 'agent']),
  parts: z.array(PartSchema),
  messageId: z.string().optional(),
  taskId: z.string().optional(),
  contextId: z.string().optional(),
});

const MessageSendParamsSchema = z.object({
  message: MessageSchema,
  configuration: z
    .object({
      skill: z.string().optional(),
    })
    .optional(),
});

const TaskQueryParamsSchema = z.object({
  id: z.string(),
  historyLength: z.number().optional(),
});

const TaskIdParamsSchema = z.object({
  id: z.string(),
});

// ---------------------------------------------------------------------------
// Skill extraction helpers
// ---------------------------------------------------------------------------

/**
 * Extract the data payload from the first DataPart in a message.
 * Returns an empty object if no DataPart is present.
 */
function extractData(message: Message): Record<string, unknown> {
  for (const part of message.parts) {
    if (part.kind === 'data') return part.data;
  }
  return {};
}

/**
 * Determine the skill from either the message configuration or a text part
 * containing `skill: <name>` (best-effort heuristic for agent callers that
 * embed instructions in text).
 */
function extractSkill(
  message: Message,
  configuration?: { skill?: string }
): string | null {
  if (configuration?.skill) return configuration.skill;
  for (const part of message.parts) {
    if (part.kind === 'text') {
      const match = part.text.match(/\bskill:\s*(\S+)/i);
      if (match) return match[1].toLowerCase();
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Task executor — routes to platform services
// ---------------------------------------------------------------------------

function makeCompleted(result: unknown): TaskStatus {
  return { state: 'completed', timestamp: new Date().toISOString(), message: undefined };
}

function makeArtifact(result: unknown): TaskArtifact {
  return {
    artifactId: generateId(),
    parts: [{ kind: 'data', data: result as Record<string, unknown> }],
  };
}

function makeFailed(reason: string): TaskStatus {
  return { state: 'failed', message: reason, timestamp: new Date().toISOString() };
}

/**
 * Execute the skill synchronously and return the updated task.
 * This mutates the task via the store.
 */
function executeTask(
  task: A2ATask,
  skill: string,
  data: Record<string, unknown>,
  store: A2ATaskStore,
  sessionStore: SessionStore
): void {
  // Mark as working
  store.update(task.id, {
    status: { state: 'working', timestamp: new Date().toISOString() },
  });

  try {
    let result: unknown;

    switch (skill) {
      case 'create_session': {
        const creatorName = String(data['creatorName'] ?? data['creator_name'] ?? '');
        if (!creatorName.trim()) {
          store.update(task.id, { status: makeFailed('creatorName is required') });
          return;
        }
        const { session, creatorId } = sessionStore.createSession(creatorName.trim());
        result = { code: session.code, participantId: creatorId };
        break;
      }

      case 'join_session': {
        const code = String(data['code'] ?? '').toUpperCase();
        const participantName = String(data['participantName'] ?? data['participant_name'] ?? '');
        if (!code || !participantName.trim()) {
          store.update(task.id, { status: makeFailed('code and participantName are required') });
          return;
        }
        const joined = sessionStore.joinSession(code, participantName.trim());
        if (!joined) {
          store.update(task.id, { status: makeFailed('Session not found') });
          return;
        }
        result = { participantId: joined.participantId, sessionCode: code };
        break;
      }

      case 'submit_artifact': {
        const code = String(data['code'] ?? '').toUpperCase();
        const participantId = String(data['participantId'] ?? data['participant_id'] ?? '');
        const fileName = String(data['fileName'] ?? data['file_name'] ?? '');
        const artifactData = data['data'] as import('../schema/types.js').CandidateEventsFile | undefined;
        if (!code || !participantId || !fileName || !artifactData) {
          store.update(task.id, { status: makeFailed('code, participantId, fileName, and data are required') });
          return;
        }
        const submission = sessionStore.submitYaml(code, participantId, fileName, artifactData);
        if (!submission) {
          store.update(task.id, { status: makeFailed('Session not found or participant not in session') });
          return;
        }
        result = { success: true, submittedAt: submission.submittedAt };
        break;
      }

      case 'get_session': {
        const code = String(data['code'] ?? '').toUpperCase();
        if (!code) {
          store.update(task.id, { status: makeFailed('code is required') });
          return;
        }
        const session = sessionStore.getSession(code);
        if (!session) {
          store.update(task.id, { status: makeFailed('Session not found') });
          return;
        }
        // Serialize the Map-based participants to an array
        result = {
          code: session.code,
          createdAt: session.createdAt,
          status: session.status,
          participants: Array.from(session.participants.values()),
          submissionCount: session.submissions.length,
        };
        break;
      }

      case 'start_jam': {
        const code = String(data['code'] ?? '').toUpperCase();
        if (!code) {
          store.update(task.id, { status: makeFailed('code is required') });
          return;
        }
        const jam = sessionStore.startJam(code);
        if (!jam) {
          store.update(task.id, { status: makeFailed('Session not found') });
          return;
        }
        result = { success: true, jam };
        break;
      }

      case 'compare_artifacts': {
        const code = String(data['code'] ?? '').toUpperCase();
        if (!code) {
          store.update(task.id, { status: makeFailed('code is required') });
          return;
        }
        const files = sessionStore.getSessionFiles(code);
        if (files.length === 0) {
          result = { overlaps: [], message: 'No submissions yet' };
        } else {
          const overlaps = compareFiles(files);
          result = { overlapCount: overlaps.length, overlaps };
        }
        break;
      }

      case 'query_prep_status': {
        const code = String(data['code'] ?? '').toUpperCase();
        if (!code) {
          store.update(task.id, { status: makeFailed('code is required') });
          return;
        }
        const session = sessionStore.getSession(code);
        if (!session) {
          store.update(task.id, { status: makeFailed('Session not found') });
          return;
        }
        const files = sessionStore.getSessionFiles(code);
        if (files.length === 0) {
          result = { message: 'No submissions yet', participantCount: session.participants.size };
        } else {
          result = computeSessionStatus(files);
        }
        break;
      }

      default: {
        store.update(task.id, { status: makeFailed(`Unknown skill: ${skill}`) });
        return;
      }
    }

    store.update(task.id, {
      status: makeCompleted(result),
      artifacts: [makeArtifact(result)],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    store.update(task.id, { status: makeFailed(message) });
  }
}

// ---------------------------------------------------------------------------
// JSON-RPC handler
// ---------------------------------------------------------------------------

function rpcSuccess(id: string | number | null, result: unknown): JsonRpcSuccess {
  return { jsonrpc: '2.0', id, result };
}

function rpcError(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown
): JsonRpcError {
  return { jsonrpc: '2.0', id, error: { code, message, ...(data !== undefined ? { data } : {}) } };
}

/**
 * Handle a single JSON-RPC request body (already parsed).
 * Pure function — takes stores as parameters for testability.
 */
export function handleA2ARequest(
  body: unknown,
  taskStore: A2ATaskStore,
  sessionStore: SessionStore
): JsonRpcResponse {
  // Validate JSON-RPC envelope
  if (
    typeof body !== 'object' ||
    body === null ||
    (body as JsonRpcRequest).jsonrpc !== '2.0' ||
    typeof (body as JsonRpcRequest).method !== 'string'
  ) {
    return rpcError(null, RPC_INVALID_REQUEST, 'Invalid JSON-RPC request');
  }

  const req = body as JsonRpcRequest;
  const { method, params, id } = req;

  switch (method) {
    case 'message/send': {
      const parsed = MessageSendParamsSchema.safeParse(params);
      if (!parsed.success) {
        return rpcError(id, RPC_INVALID_PARAMS, 'Invalid params for message/send', parsed.error.flatten());
      }
      const { message, configuration } = parsed.data;
      const skill = extractSkill(message as Message, configuration);
      if (!skill) {
        return rpcError(
          id,
          RPC_INVALID_PARAMS,
          'Could not determine skill. Set configuration.skill or include "skill: <name>" in a text part.'
        );
      }

      const data = extractData(message as Message);
      const task = taskStore.create({ skill, input: data });

      // Execute synchronously (operations are fast in-memory)
      executeTask(task, skill, data, taskStore, sessionStore);

      const updated = taskStore.get(task.id)!;
      return rpcSuccess(id, updated);
    }

    case 'tasks/get': {
      const parsed = TaskQueryParamsSchema.safeParse(params);
      if (!parsed.success) {
        return rpcError(id, RPC_INVALID_PARAMS, 'Invalid params for tasks/get', parsed.error.flatten());
      }
      const task = taskStore.get(parsed.data.id);
      if (!task) {
        return rpcError(id, A2A_TASK_NOT_FOUND, `Task not found: ${parsed.data.id}`);
      }
      return rpcSuccess(id, task);
    }

    case 'tasks/cancel': {
      const parsed = TaskIdParamsSchema.safeParse(params);
      if (!parsed.success) {
        return rpcError(id, RPC_INVALID_PARAMS, 'Invalid params for tasks/cancel', parsed.error.flatten());
      }
      const task = taskStore.get(parsed.data.id);
      if (!task) {
        return rpcError(id, A2A_TASK_NOT_FOUND, `Task not found: ${parsed.data.id}`);
      }

      // Tasks execute synchronously, so by the time cancel arrives the task is
      // already in a terminal state. Cancellation of a terminal task is rejected.
      const terminalStates: TaskState[] = ['completed', 'failed', 'canceled', 'rejected', 'unknown'];
      if (terminalStates.includes(task.status.state)) {
        return rpcError(id, A2A_TASK_NOT_CANCELABLE, `Task ${task.id} is already in terminal state: ${task.status.state}`);
      }

      taskStore.update(parsed.data.id, {
        status: { state: 'canceled', timestamp: new Date().toISOString() },
      });
      const updated = taskStore.get(parsed.data.id)!;
      return rpcSuccess(id, updated);
    }

    default:
      return rpcError(id, RPC_METHOD_NOT_FOUND, `Method not found: ${method}`);
  }
}

// ---------------------------------------------------------------------------
// HTTP request body parser (reusable, no dependency on node:http types)
// ---------------------------------------------------------------------------

export function parseA2ABody(rawBody: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(rawBody) };
  } catch {
    return { ok: false, error: 'Invalid JSON body' };
  }
}

// ---------------------------------------------------------------------------
// Route handler factory
// ---------------------------------------------------------------------------

/**
 * Returns true if the given URL and method match an A2A route.
 * Used by the HTTP server to decide whether to delegate to handleA2ARoute.
 */
export function isA2ARoute(method: string, url: string): boolean {
  return (
    (method === 'GET' && url === '/.well-known/agent.json') ||
    (method === 'POST' && url === '/a2a')
  );
}

export interface A2ARouteHandlers {
  /** Called when the route matches — must write a complete HTTP response. */
  onAgentCard: (baseUrl: string) => AgentCard;
  onRpc: (body: unknown) => JsonRpcResponse;
}

/**
 * Create the two pure route handler functions that the HTTP server can call.
 * Keeps A2A logic separate from the HTTP plumbing.
 */
export function createA2AHandlers(
  taskStore: A2ATaskStore,
  sessionStore: SessionStore
): A2ARouteHandlers {
  return {
    onAgentCard: (baseUrl: string) => buildAgentCard(baseUrl),
    onRpc: (body: unknown) => handleA2ARequest(body, taskStore, sessionStore),
  };
}
