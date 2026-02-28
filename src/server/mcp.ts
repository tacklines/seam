import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { sessionStore } from './store.js';
import { parseAndValidate } from '../lib/yaml-validator-server.js';
import { computePrepStatus, computeSessionStatus } from '../lib/prep-completeness.js';
import { computeWorkflowStatus } from '../lib/workflow-engine.js';
import { serializeSession } from '../lib/session-store.js';
import { compareFiles } from '../lib/comparison.js';

// ---------------------------------------------------------------------------
// CLI arg parsing for scoped mode: --session=CODE --user=NAME
// ---------------------------------------------------------------------------

function parseArgs(): { session?: string; user?: string } {
  const args = process.argv.slice(2);
  const result: { session?: string; user?: string } = {};
  for (const arg of args) {
    const [key, ...rest] = arg.split('=');
    const value = rest.join('=');
    if (key === '--session' && value) result.session = value.toUpperCase();
    if (key === '--user' && value) result.user = value;
  }
  return result;
}

// Scoped context — populated on startup when --session/--user are provided
interface ScopedContext {
  sessionCode: string;
  participantId: string;
  participantName: string;
}

async function main(): Promise<void> {
  const cliArgs = parseArgs();
  let scoped: ScopedContext | null = null;

  // If --session and --user provided, auto-join (or reconnect) on startup
  if (cliArgs.session && cliArgs.user) {
    const session = sessionStore.getSession(cliArgs.session);
    if (!session) {
      console.error(`[mcp] session ${cliArgs.session} not found`);
      process.exit(1);
    }

    // Check if user already exists in session (reconnect)
    let existingId: string | null = null;
    for (const [id, p] of session.participants) {
      if (p.name === cliArgs.user) {
        existingId = id;
        break;
      }
    }

    if (existingId) {
      scoped = {
        sessionCode: cliArgs.session,
        participantId: existingId,
        participantName: cliArgs.user,
      };
      console.error(`[mcp] reconnected as "${cliArgs.user}" (${existingId}) in session ${cliArgs.session}`);
    } else {
      const result = sessionStore.joinSession(cliArgs.session, cliArgs.user);
      if (!result) {
        console.error(`[mcp] failed to join session ${cliArgs.session}`);
        process.exit(1);
      }
      scoped = {
        sessionCode: cliArgs.session,
        participantId: result.participantId,
        participantName: cliArgs.user,
      };
      console.error(`[mcp] joined session ${cliArgs.session} as "${cliArgs.user}" (${result.participantId})`);
    }
  }

  const serverName = scoped
    ? `multi-human-workflows (${scoped.participantName}@${scoped.sessionCode})`
    : 'multi-human-workflows';

  const server = new McpServer({
    name: serverName,
    version: '0.1.0',
  });

  // Tool: create_session
  server.registerTool(
    'create_session',
    {
      description: 'Create a new collaborative session and get the join code',
      inputSchema: {
        creatorName: z.string().describe('Name of the session creator'),
      },
    },
    ({ creatorName }) => {
      const { session, creatorId } = sessionStore.createSession(creatorName);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ code: session.code, participantId: creatorId }),
          },
        ],
      };
    }
  );

  // Tool: join_session
  server.registerTool(
    'join_session',
    {
      description: 'Join an existing session by its code',
      inputSchema: {
        code: z.string().describe('Session join code'),
        participantName: z.string().describe('Name of the participant joining'),
      },
    },
    ({ code, participantName }) => {
      const result = sessionStore.joinSession(code, participantName);
      if (!result) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Session not found' }) }],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              participantId: result.participantId,
              participants: result.session.participants,
            }),
          },
        ],
      };
    }
  );

  // Tool: submit_yaml
  server.registerTool(
    'submit_yaml',
    {
      description: 'Parse, validate, and submit a YAML file to the session',
      inputSchema: {
        code: z.string().describe('Session join code'),
        participantId: z.string().describe('Participant ID from create_session or join_session'),
        fileName: z.string().describe('File name for the YAML submission'),
        yamlContent: z.string().describe('Raw YAML string to parse and validate'),
      },
    },
    ({ code, participantId, fileName, yamlContent }) => {
      const outcome = parseAndValidate(fileName, yamlContent);
      if (!outcome.ok) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ error: 'YAML validation failed', errors: outcome.errors }),
            },
          ],
          isError: true,
        };
      }

      const submission = sessionStore.submitYaml(code, participantId, fileName, outcome.file.data);
      if (!submission) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ error: 'Session not found or participant not in session' }),
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ success: true, submittedAt: submission.submittedAt }),
          },
        ],
      };
    }
  );

  // Tool: get_session
  server.registerTool(
    'get_session',
    {
      description: 'Get the current state of a session including participants and submissions',
      inputSchema: {
        code: z.string().describe('Session join code'),
      },
    },
    ({ code }) => {
      const session = sessionStore.getSession(code);
      if (!session) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ error: 'Session not found' }),
            },
          ],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ session }),
          },
        ],
      };
    }
  );

  // Tool: prep_status
  server.registerTool(
    'prep_status',
    {
      description:
        'Get completeness analysis for a session — event counts, confidence breakdown, gaps, and a 0-100 score per file and overall',
      inputSchema: {
        code: z.string().describe('Session join code'),
      },
    },
    ({ code }) => {
      const files = sessionStore.getSessionFiles(code);
      if (files.length === 0) {
        const session = sessionStore.getSession(code);
        if (!session) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Session not found' }) }],
            isError: true,
          };
        }
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ message: 'No submissions yet', participantCount: session.participants.size }),
            },
          ],
        };
      }
      const status = computeSessionStatus(files);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(status) }],
      };
    }
  );

  // Tool: jam_start
  server.registerTool(
    'jam_start',
    {
      description: 'Start a jam session for collaborative conflict resolution. Must be called before resolve/assign/flag tools.',
      inputSchema: {
        code: z.string().describe('Session join code'),
      },
    },
    ({ code }) => {
      const jam = sessionStore.startJam(code);
      if (!jam) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Session not found' }) }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ success: true, jam }) }],
      };
    }
  );

  // Tool: jam_resolve
  server.registerTool(
    'jam_resolve',
    {
      description: 'Record a conflict resolution decision in the jam session',
      inputSchema: {
        code: z.string().describe('Session join code'),
        overlapLabel: z.string().describe('Label of the overlap being resolved (from comparison)'),
        resolution: z.string().describe('Description of how the conflict was resolved'),
        chosenApproach: z.string().describe('Which approach was chosen (e.g., "merge", role name, or custom)'),
        resolvedBy: z.array(z.string()).describe('Names of participants who agreed to this resolution'),
      },
    },
    ({ code, overlapLabel, resolution, chosenApproach, resolvedBy }) => {
      const result = sessionStore.resolveConflict(code, { overlapLabel, resolution, chosenApproach, resolvedBy });
      if (!result) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Session not found or jam not started' }) }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ success: true, resolution: result }) }],
      };
    }
  );

  // Tool: jam_assign
  server.registerTool(
    'jam_assign',
    {
      description: 'Assign aggregate ownership to a role in the jam session',
      inputSchema: {
        code: z.string().describe('Session join code'),
        aggregate: z.string().describe('Name of the aggregate'),
        ownerRole: z.string().describe('Role that owns this aggregate'),
        assignedBy: z.string().describe('Name of participant making the assignment'),
      },
    },
    ({ code, aggregate, ownerRole, assignedBy }) => {
      const result = sessionStore.assignOwnership(code, { aggregate, ownerRole, assignedBy });
      if (!result) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Session not found or jam not started' }) }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ success: true, assignment: result }) }],
      };
    }
  );

  // Tool: jam_flag
  server.registerTool(
    'jam_flag',
    {
      description: 'Flag an unresolved item in the jam session for later follow-up',
      inputSchema: {
        code: z.string().describe('Session join code'),
        description: z.string().describe('Description of the unresolved item'),
        flaggedBy: z.string().describe('Name of the participant flagging this item'),
        relatedOverlap: z.string().optional().describe('Label of a related overlap, if any'),
      },
    },
    ({ code, description, flaggedBy, relatedOverlap }) => {
      const item = relatedOverlap
        ? { description, flaggedBy, relatedOverlap }
        : { description, flaggedBy };
      const result = sessionStore.flagUnresolved(code, item);
      if (!result) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Session not found or jam not started' }) }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ success: true, flagged: result }) }],
      };
    }
  );

  // Tool: jam_export
  server.registerTool(
    'jam_export',
    {
      description: 'Export all jam session artifacts (resolutions, ownership map, unresolved items)',
      inputSchema: {
        code: z.string().describe('Session join code'),
      },
    },
    ({ code }) => {
      const jam = sessionStore.exportJam(code);
      if (!jam) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Session not found or jam not started' }) }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(jam) }],
      };
    }
  );

  // Tool: prep_load
  server.registerTool(
    'prep_load',
    {
      description:
        'Submit a YAML file directly to a session (parse + validate + submit in one step). Returns completeness analysis of the submitted file.',
      inputSchema: {
        code: z.string().describe('Session join code'),
        participantId: z.string().describe('Participant ID from create_session or join_session'),
        fileName: z.string().describe('File name for the submission'),
        yamlContent: z.string().describe('Raw YAML string to parse and validate'),
      },
    },
    ({ code, participantId, fileName, yamlContent }) => {
      const outcome = parseAndValidate(fileName, yamlContent);
      if (!outcome.ok) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ error: 'YAML validation failed', errors: outcome.errors }),
            },
          ],
          isError: true,
        };
      }

      const submission = sessionStore.submitYaml(code, participantId, fileName, outcome.file.data);
      if (!submission) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ error: 'Session not found or participant not in session' }),
            },
          ],
          isError: true,
        };
      }

      const prepStatus = computePrepStatus(outcome.file.data);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              submittedAt: submission.submittedAt,
              completeness: prepStatus,
            }),
          },
        ],
      };
    }
  );

  // Tool: contract_load
  server.registerTool(
    'contract_load',
    {
      description: 'Load a contract bundle (from /formalize output) into the session',
      inputSchema: {
        code: z.string().describe('Session join code'),
        bundle: z.string().describe('JSON string of the ContractBundle'),
      },
    },
    ({ code, bundle }) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(bundle);
      } catch {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Invalid JSON' }) }],
          isError: true,
        };
      }
      const result = sessionStore.loadContracts(code, parsed as import('../schema/types.js').ContractBundle);
      if (!result) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Session not found' }) }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ success: true, eventContracts: result.eventContracts.length, boundaryContracts: result.boundaryContracts.length }) }],
      };
    }
  );

  // Tool: contract_diff
  server.registerTool(
    'contract_diff',
    {
      description: 'Compare loaded contracts against the original prep submissions to show what changed',
      inputSchema: {
        code: z.string().describe('Session join code'),
      },
    },
    ({ code }) => {
      const contracts = sessionStore.getContracts(code);
      const files = sessionStore.getSessionFiles(code);
      if (!contracts) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'No contracts loaded' }) }],
          isError: true,
        };
      }
      // Diff: events in contracts vs events in submissions
      const contractEventNames = new Set(contracts.eventContracts.map((c) => c.eventName));
      const prepEventNames = new Set(files.flatMap((f) => f.data.domain_events.map((e) => e.name)));
      const added = [...contractEventNames].filter((n) => !prepEventNames.has(n));
      const removed = [...prepEventNames].filter((n) => !contractEventNames.has(n));
      const retained = [...contractEventNames].filter((n) => prepEventNames.has(n));
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ added, removed, retained, totalContracts: contracts.eventContracts.length, totalPrepEvents: prepEventNames.size }),
        }],
      };
    }
  );

  // Tool: integration_load
  server.registerTool(
    'integration_load',
    {
      description: 'Load an integration report (from /integrate output) into the session',
      inputSchema: {
        code: z.string().describe('Session join code'),
        report: z.string().describe('JSON string of the IntegrationReport'),
      },
    },
    ({ code, report }) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(report);
      } catch {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Invalid JSON' }) }],
          isError: true,
        };
      }
      const result = sessionStore.loadIntegrationReport(code, parsed as import('../schema/types.js').IntegrationReport);
      if (!result) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Session not found' }) }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ success: true, overallStatus: result.overallStatus, checkCount: result.checks.length }) }],
      };
    }
  );

  // Tool: integration_status
  server.registerTool(
    'integration_status',
    {
      description: 'Get the integration report status for a session — checks, overall status, and go/no-go assessment',
      inputSchema: {
        code: z.string().describe('Session join code'),
      },
    },
    ({ code }) => {
      const report = sessionStore.getIntegrationReport(code);
      if (!report) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'No integration report loaded' }) }],
          isError: true,
        };
      }
      const passCount = report.checks.filter((c) => c.status === 'pass').length;
      const failCount = report.checks.filter((c) => c.status === 'fail').length;
      const warnCount = report.checks.filter((c) => c.status === 'warn').length;
      const goNoGo = failCount === 0 ? 'GO' : 'NO-GO';
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            overallStatus: report.overallStatus,
            goNoGo,
            summary: report.summary,
            checks: { pass: passCount, fail: failCount, warn: warnCount, total: report.checks.length },
            details: report.checks,
          }),
        }],
      };
    }
  );

  // Tool: workflow_phase
  server.registerTool(
    'workflow_phase',
    {
      description:
        'Get the current workflow phase, all phase statuses, artifact inventory, and suggested next action for a session',
      inputSchema: {
        code: z.string().describe('Session join code'),
      },
    },
    ({ code }) => {
      const session = sessionStore.getSession(code);
      if (!session) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Session not found' }) }],
          isError: true,
        };
      }
      const status = computeWorkflowStatus({
        participantCount: session.participants.size,
        submissionCount: session.submissions.length,
        jam: session.jam,
        contracts: session.contracts,
        integrationReport: session.integrationReport,
      });
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(status) }],
      };
    }
  );

  // Tool: workflow_phase_subscribe
  server.registerTool(
    'workflow_phase_subscribe',
    {
      description:
        'Poll for workflow phase changes. Call without `since` to get the current phase and a lastChecked timestamp. ' +
        'Call again with the returned lastChecked value to detect whether the phase has changed since your last poll.',
      inputSchema: {
        code: z.string().describe('Session join code'),
        since: z.string().optional().describe('ISO timestamp from a prior lastChecked value; if provided, a `changed` boolean is included in the response'),
      },
    },
    ({ code, since }) => {
      const session = sessionStore.getSession(code);
      if (!session) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Session not found' }) }],
          isError: true,
        };
      }
      const status = computeWorkflowStatus({
        participantCount: session.participants.size,
        submissionCount: session.submissions.length,
        jam: session.jam,
        contracts: session.contracts,
        integrationReport: session.integrationReport,
      });
      const lastChecked = new Date().toISOString();
      const response: Record<string, unknown> = {
        ...status,
        lastChecked,
      };
      if (since !== undefined) {
        // Determine whether any phase has changed by comparing artifact counts.
        // Since computeWorkflowStatus is deterministic, we detect change by checking
        // whether the currentPhase differs from what the caller last saw. Callers
        // should compare the returned currentPhase against their stored value to act
        // on changes. The `changed` flag here indicates whether the session had any
        // meaningful activity since `since` — we use the lastChecked timestamp itself
        // as a proxy: if since < the creation of this response, we can only confirm
        // the phase at poll time. The caller is responsible for comparing currentPhase.
        const sinceDate = new Date(since);
        const isValidDate = !isNaN(sinceDate.getTime());
        response['changed'] = isValidDate ? new Date(lastChecked) > sinceDate : true;
      }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(response) }],
      };
    }
  );

  // Tool: compare_artifacts
  server.registerTool(
    'compare_artifacts',
    {
      description:
        'Compare submitted artifacts across participants — returns overlapping events, aggregate conflicts, and assumption conflicts without requiring a full prep status query',
      inputSchema: {
        code: z.string().describe('Session join code'),
      },
    },
    ({ code }) => {
      const session = sessionStore.getSession(code);
      if (!session) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Session not found' }) }],
          isError: true,
        };
      }
      const files = sessionStore.getSessionFiles(code);
      if (files.length === 0) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ overlaps: [], message: 'No submissions yet' }) }],
        };
      }
      const overlaps = compareFiles(files);
      const byKind: Record<string, typeof overlaps> = {};
      for (const o of overlaps) {
        (byKind[o.kind] ??= []).push(o);
      }
      const uniquePerFile: Record<string, string[]> = {};
      for (const f of files) {
        const eventNames = f.data.domain_events.map((e) => e.name);
        const others = files.filter((g) => g.filename !== f.filename).flatMap((g) => g.data.domain_events.map((e) => e.name));
        uniquePerFile[f.role] = eventNames.filter((n) => !others.includes(n));
      }
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            overlapCount: overlaps.length,
            overlaps,
            byKind,
            uniquePerFile,
          }),
        }],
      };
    }
  );

  // Tool: check_compliance
  server.registerTool(
    'check_compliance',
    {
      description:
        'Validate current session state against loaded contracts — checks whether contracts are loaded, whether all prep events are covered, and returns integration report status if available',
      inputSchema: {
        code: z.string().describe('Session join code'),
      },
    },
    ({ code }) => {
      const session = sessionStore.getSession(code);
      if (!session) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Session not found' }) }],
          isError: true,
        };
      }
      const contracts = sessionStore.getContracts(code);
      if (!contracts) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              compliant: false,
              reason: 'No contracts loaded — run contract_load first',
              contractsLoaded: false,
            }),
          }],
        };
      }
      const files = sessionStore.getSessionFiles(code);
      const contractEventNames = new Set(contracts.eventContracts.map((c) => c.eventName));
      const prepEventNames = new Set(files.flatMap((f) => f.data.domain_events.map((e) => e.name)));
      const uncovered = [...prepEventNames].filter((n) => !contractEventNames.has(n));
      const missing = [...contractEventNames].filter((n) => !prepEventNames.has(n));
      const report = sessionStore.getIntegrationReport(code);
      const result: Record<string, unknown> = {
        contractsLoaded: true,
        eventContractCount: contracts.eventContracts.length,
        boundaryContractCount: contracts.boundaryContracts.length,
        prepEventCount: prepEventNames.size,
        uncoveredPrepEvents: uncovered,
        contractEventsNotInPrep: missing,
        compliant: uncovered.length === 0 && missing.length === 0,
      };
      if (report) {
        const failCount = report.checks.filter((c) => c.status === 'fail').length;
        result['integrationReport'] = {
          overallStatus: report.overallStatus,
          goNoGo: failCount === 0 ? 'GO' : 'NO-GO',
          failCount,
          warnCount: report.checks.filter((c) => c.status === 'warn').length,
          passCount: report.checks.filter((c) => c.status === 'pass').length,
        };
        result['compliant'] = (result['compliant'] as boolean) && failCount === 0;
      }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result) }],
      };
    }
  );

  // Tool: send_message
  server.registerTool(
    'send_message',
    {
      description: 'Send a message to a session. Omit toParticipantId for a broadcast to all participants.',
      inputSchema: {
        code: z.string().describe('Session join code'),
        participantId: z.string().describe('Sender participant ID'),
        content: z.string().describe('Message content'),
        toParticipantId: z.string().optional().describe('Recipient participant ID (omit for broadcast)'),
      },
    },
    ({ code, participantId, content, toParticipantId }) => {
      const msg = sessionStore.sendMessage(code, participantId, content, toParticipantId);
      if (!msg) {
        const session = sessionStore.getSession(code);
        if (!session) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Session not found' }) }],
            isError: true,
          };
        }
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Failed to send — participant not in session or session is closed' }) }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ sent: msg }) }],
      };
    }
  );

  // Tool: get_messages
  server.registerTool(
    'get_messages',
    {
      description: 'Get messages for a participant in a session. Pass since to retrieve only messages after that ISO timestamp.',
      inputSchema: {
        code: z.string().describe('Session join code'),
        participantId: z.string().describe('Participant ID — only messages visible to this participant are returned'),
        since: z.string().optional().describe('ISO timestamp — only messages after this time are returned'),
      },
    },
    ({ code, participantId, since }) => {
      const session = sessionStore.getSession(code);
      if (!session) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Session not found' }) }],
          isError: true,
        };
      }
      const messages = sessionStore.getMessages(code, participantId, since);
      const lastChecked = new Date().toISOString();
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ messages, count: messages.length, lastChecked }),
        }],
      };
    }
  );

  // -------------------------------------------------------------------------
  // Scoped tools — only registered when --session/--user are provided
  // -------------------------------------------------------------------------

  if (scoped) {
    const ctx = scoped; // capture for closures

    // Tool: my_session — get session state without needing the code
    server.registerTool(
      'my_session',
      {
        description: 'Get the current state of your session (participants, submissions, phase)',
        inputSchema: {},
      },
      () => {
        const session = sessionStore.getSession(ctx.sessionCode);
        if (!session) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Session not found' }) }],
            isError: true,
          };
        }
        const status = computeWorkflowStatus({
          participantCount: session.participants.size,
          submissionCount: session.submissions.length,
          jam: session.jam,
          contracts: session.contracts,
          integrationReport: session.integrationReport,
        });
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              you: { name: ctx.participantName, id: ctx.participantId },
              session: serializeSession(session),
              workflow: status,
            }),
          }],
        };
      }
    );

    // Tool: my_submit — submit YAML without needing code or participantId
    server.registerTool(
      'my_submit',
      {
        description: 'Submit a YAML file to your session (parse + validate + submit)',
        inputSchema: {
          fileName: z.string().describe('File name for the submission'),
          yamlContent: z.string().describe('Raw YAML string to parse and validate'),
        },
      },
      ({ fileName, yamlContent }) => {
        const outcome = parseAndValidate(fileName, yamlContent);
        if (!outcome.ok) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({ error: 'YAML validation failed', errors: outcome.errors }),
            }],
            isError: true,
          };
        }

        const submission = sessionStore.submitYaml(ctx.sessionCode, ctx.participantId, fileName, outcome.file.data);
        if (!submission) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({ error: 'Session not found or participant not in session' }),
            }],
            isError: true,
          };
        }

        const prepStatus = computePrepStatus(outcome.file.data);
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              submittedAt: submission.submittedAt,
              completeness: prepStatus,
            }),
          }],
        };
      }
    );

    // Tool: send_message — post a message to the session
    server.registerTool(
      'send_message',
      {
        description: 'Send a message to the session. Omit recipientName for a broadcast to all participants.',
        inputSchema: {
          content: z.string().describe('Message content'),
          recipientName: z.string().optional().describe('Name of a specific participant to message (omit for broadcast)'),
        },
      },
      ({ content, recipientName }) => {
        let toId: string | undefined;
        if (recipientName) {
          // Look up recipient by name
          const session = sessionStore.getSession(ctx.sessionCode);
          if (!session) {
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Session not found' }) }],
              isError: true,
            };
          }
          for (const [id, p] of session.participants) {
            if (p.name === recipientName) {
              toId = id;
              break;
            }
          }
          if (!toId) {
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({ error: `Participant "${recipientName}" not found in session` }),
              }],
              isError: true,
            };
          }
        }

        const msg = sessionStore.sendMessage(ctx.sessionCode, ctx.participantId, content, toId);
        if (!msg) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Failed to send message' }) }],
            isError: true,
          };
        }
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ sent: msg }),
          }],
        };
      }
    );

    // Tool: check_messages — poll for messages
    server.registerTool(
      'check_messages',
      {
        description: 'Check for new messages in your session. Pass the lastChecked timestamp from a prior call to get only new messages.',
        inputSchema: {
          since: z.string().optional().describe('ISO timestamp from a prior check; only messages after this time are returned'),
        },
      },
      ({ since }) => {
        const messages = sessionStore.getMessages(ctx.sessionCode, ctx.participantId, since);
        const lastChecked = new Date().toISOString();
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              messages,
              count: messages.length,
              lastChecked,
            }),
          }],
        };
      }
    );
  }

  const transport = new StdioServerTransport();

  const modeLabel = scoped ? `scoped to ${scoped.participantName}@${scoped.sessionCode}` : 'unscoped';
  console.error(`[mcp] starting multi-human-workflows MCP server (${modeLabel})`);

  await server.connect(transport);

  console.error('[mcp] server connected via stdio transport');
}

main().catch((err: unknown) => {
  console.error('[mcp] fatal error:', err);
  process.exit(1);
});
