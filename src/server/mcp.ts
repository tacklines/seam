import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { sessionStore } from './store.js';
import { parseAndValidate } from '../lib/yaml-validator-server.js';
import { computePrepStatus, computeSessionStatus } from '../lib/prep-completeness.js';
import { computeWorkflowStatus } from '../lib/workflow-engine.js';
import { serializeSession } from '../lib/session-store.js';
import { compareFiles } from '../lib/comparison.js';
import {
  suggestResolutionHeuristic,
  runIntegrationChecks,
  deriveOverallStatus,
} from '../lib/integration-heuristics.js';

// ---------------------------------------------------------------------------
// Module-level progress store for report_progress (Phase VI — Build)
// Key: `${code}:${participantId}` → Map<workItemId, progress record>
// ---------------------------------------------------------------------------
interface ProgressRecord {
  workItemId: string;
  percentComplete: number;
  notes?: string;
  updatedAt: string;
}
const progressStore = new Map<string, Map<string, ProgressRecord>>();

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

  // Tool: submit_artifact
  server.registerTool(
    'submit_artifact',
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

  // Tool: query_prep_status
  server.registerTool(
    'query_prep_status',
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

  // Tool: start_jam
  server.registerTool(
    'start_jam',
    {
      description: 'Start a jam session for collaborative conflict resolution. Must be called before record_resolution/assign_ownership/flag_unresolved tools.',
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

  // Tool: record_resolution
  server.registerTool(
    'record_resolution',
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

  // Tool: assign_ownership
  server.registerTool(
    'assign_ownership',
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

  // Tool: flag_unresolved
  server.registerTool(
    'flag_unresolved',
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

  // Tool: export_jam_artifacts
  server.registerTool(
    'export_jam_artifacts',
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

  // Tool: load_prep_artifact
  server.registerTool(
    'load_prep_artifact',
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

  // Tool: load_contracts
  server.registerTool(
    'load_contracts',
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

  // Tool: diff_contracts
  server.registerTool(
    'diff_contracts',
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

  // Tool: load_integration_report
  server.registerTool(
    'load_integration_report',
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

  // Tool: query_integration_status
  server.registerTool(
    'query_integration_status',
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

  // Tool: query_workflow_phase
  server.registerTool(
    'query_workflow_phase',
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

  // Tool: poll_workflow_phase
  server.registerTool(
    'poll_workflow_phase',
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

  // Tool: configure_session
  server.registerTool(
    'configure_session',
    {
      description:
        'Update session configuration settings. Accepts a partial config delta — only specified keys are changed. ' +
        'Emits a SessionConfigured domain event and returns the full updated config.',
      inputSchema: {
        code: z.string().describe('Session join code'),
        config: z
          .object({
            comparison: z
              .object({
                sensitivity: z.enum(['semantic', 'exact']).optional(),
                autoDetectConflicts: z.boolean().optional(),
                suggestResolutions: z.boolean().optional(),
              })
              .optional(),
            contracts: z
              .object({
                strictness: z.enum(['strict', 'warn', 'relaxed']).optional(),
                driftNotifications: z.enum(['immediate', 'batched', 'silent']).optional(),
              })
              .optional(),
            ranking: z
              .object({
                weights: z
                  .object({
                    confidence: z.number().optional(),
                    complexity: z.number().optional(),
                    references: z.number().optional(),
                  })
                  .optional(),
                defaultTier: z.string().optional(),
              })
              .optional(),
            delegation: z
              .object({
                level: z.enum(['assisted', 'semi_autonomous', 'autonomous']).optional(),
                approvalExpiry: z.number().optional(),
              })
              .optional(),
            notifications: z
              .object({
                toastDuration: z.number().optional(),
                silentEvents: z.array(z.string()).optional(),
              })
              .optional(),
          })
          .describe('Partial session config delta — only specified sections/keys are updated'),
        changedBy: z.string().optional().describe('Name of the participant making the change (for audit trail)'),
      },
    },
    ({ code, config, changedBy }) => {
      try {
        const updatedConfig = sessionStore.updateSessionConfig(code, config as import('../schema/types.js').SessionConfig, changedBy);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ config: updatedConfig }) }],
        };
      } catch {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: `Session not found: ${code}` }) }],
          isError: true,
        };
      }
    }
  );

  // Tool: get_session_config
  server.registerTool(
    'get_session_config',
    {
      description: 'Get the current session configuration. Returns the full config including all sections and their current values.',
      inputSchema: {
        code: z.string().describe('Session join code'),
      },
    },
    ({ code }) => {
      try {
        const config = sessionStore.getSessionConfig(code);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ config }) }],
        };
      } catch {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: `Session not found: ${code}` }) }],
          isError: true,
        };
      }
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
  // Phase V: Agree — suggest_resolution
  // -------------------------------------------------------------------------

  // Tool: suggest_resolution
  server.registerTool(
    'suggest_resolution',
    {
      description:
        'Get a heuristic suggestion for resolving an overlap identified during comparison. ' +
        'Returns an approach (merge/pick-left/split/custom), a human-readable resolution, ' +
        'a confidence score (0–1), and the reasoning behind the suggestion.',
      inputSchema: {
        code: z.string().describe('Session join code'),
        overlapLabel: z.string().describe('Label of the overlap to get a suggestion for (from compare_artifacts)'),
      },
    },
    ({ code, overlapLabel }) => {
      const session = sessionStore.getSession(code);
      if (!session) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Session not found' }) }],
          isError: true,
        };
      }

      // Determine the overlap kind by looking in comparison results
      const files = sessionStore.getSessionFiles(code);
      const overlaps = files.length > 0 ? compareFiles(files) : [];
      const match = overlaps.find((o) => o.label === overlapLabel);
      const overlapKind = match?.kind ?? 'unknown';

      const suggestion = suggestResolutionHeuristic(overlapKind, overlapLabel);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ suggestion }) }],
      };
    }
  );

  // -------------------------------------------------------------------------
  // Phase VI: Build — validate_against_contract, report_progress
  // -------------------------------------------------------------------------

  // Tool: validate_against_contract
  server.registerTool(
    'validate_against_contract',
    {
      description:
        'Validate an artifact against a specific event contract loaded in the session. ' +
        'Returns compliant (boolean) and a list of field-level violations.',
      inputSchema: {
        code: z.string().describe('Session join code'),
        artifactContent: z.record(z.string(), z.unknown()).describe('The artifact object to validate'),
        contractEventName: z.string().describe('Name of the event contract to validate against'),
      },
    },
    ({ code, artifactContent, contractEventName }) => {
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
              violations: [{ field: 'contract', expected: contractEventName, actual: 'no contracts loaded' }],
            }),
          }],
        };
      }

      const contract = contracts.eventContracts.find(
        (ec) => ec.eventName === contractEventName
      );

      if (!contract) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              compliant: false,
              violations: [{ field: 'contract', expected: contractEventName, actual: 'not found' }],
            }),
          }],
        };
      }

      // Compare artifact fields against contract schema
      const violations: Array<{ field: string; expected: string; actual: string }> = [];
      const schema = contract.schema as Record<string, { type?: string }>;

      for (const [field, fieldSpec] of Object.entries(schema)) {
        const artifactValue = artifactContent[field];
        if (artifactValue === undefined) {
          violations.push({
            field,
            expected: fieldSpec.type ?? 'present',
            actual: 'missing',
          });
        } else if (fieldSpec.type) {
          const actualType = Array.isArray(artifactValue) ? 'array' : typeof artifactValue;
          if (actualType !== fieldSpec.type) {
            violations.push({
              field,
              expected: fieldSpec.type,
              actual: actualType,
            });
          }
        }
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ compliant: violations.length === 0, violations }),
        }],
      };
    }
  );

  // Tool: report_progress
  server.registerTool(
    'report_progress',
    {
      description:
        'Report progress on a work item (Phase VI — Build). ' +
        'Stores the progress update and returns confirmation.',
      inputSchema: {
        code: z.string().describe('Session join code'),
        participantId: z.string().describe('Participant reporting progress'),
        workItemId: z.string().describe('ID of the work item being updated'),
        percentComplete: z.number().min(0).max(100).describe('Completion percentage (0–100)'),
        notes: z.string().optional().describe('Optional progress notes'),
      },
    },
    ({ code, participantId, workItemId, percentComplete, notes }) => {
      const session = sessionStore.getSession(code);
      if (!session) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Session not found' }) }],
          isError: true,
        };
      }

      const storeKey = `${code}:${participantId}`;
      if (!progressStore.has(storeKey)) {
        progressStore.set(storeKey, new Map());
      }
      const participantProgress = progressStore.get(storeKey)!;

      const record: ProgressRecord = {
        workItemId,
        percentComplete,
        updatedAt: new Date().toISOString(),
        ...(notes !== undefined ? { notes } : {}),
      };
      participantProgress.set(workItemId, record);

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ updated: true, record }) }],
      };
    }
  );

  // -------------------------------------------------------------------------
  // Phase VII: Ship — run_integration_check, get_go_no_go
  // -------------------------------------------------------------------------

  // Tool: run_integration_check
  server.registerTool(
    'run_integration_check',
    {
      description:
        'Run heuristic integration checks on the current session state and return a report. ' +
        'Checks: aggregate ownership, conflict resolution, contract coverage, and work item existence.',
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
      const failCount = checks.filter((c) => c.status === 'fail').length;
      const warnCount = checks.filter((c) => c.status === 'warn').length;
      const summary =
        failCount > 0
          ? `Integration check failed: ${failCount} failure(s), ${warnCount} warning(s)`
          : warnCount > 0
          ? `Integration check passed with ${warnCount} warning(s)`
          : `All ${checks.length} integration check(s) passed`;

      const report = {
        generatedAt: new Date().toISOString(),
        sourceContracts: session.contracts ? [session.contracts.sourceJamCode ?? code] : [],
        checks,
        overallStatus,
        summary,
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(report) }],
      };
    }
  );

  // Tool: get_go_no_go
  server.registerTool(
    'get_go_no_go',
    {
      description:
        'Get a simplified go/no-go verdict for shipping. ' +
        'Runs the same checks as run_integration_check but returns a verdict: ' +
        '"go" (all pass), "no_go" (any error-severity failure), or "caution" (warnings only).',
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

      const checkResults = checks.map((c) => ({
        name: c.name,
        passed: c.status === 'pass',
        severity: c.severity,
        message: c.message,
      }));

      const hasErrors = checks.some((c) => c.status === 'fail' && c.severity === 'error');
      const hasWarns = checks.some((c) => c.status === 'warn' || (c.status === 'fail' && c.severity === 'warn'));
      const verdict: 'go' | 'no_go' | 'caution' = hasErrors ? 'no_go' : hasWarns ? 'caution' : 'go';

      const passCount = checks.filter((c) => c.status === 'pass').length;
      const failCount = checks.filter((c) => c.status === 'fail').length;
      const warnCount = checks.filter((c) => c.status === 'warn').length;
      const summary =
        verdict === 'go'
          ? `GO: All ${passCount} check(s) passed — session is ready to ship`
          : verdict === 'no_go'
          ? `NO-GO: ${failCount} check(s) failed — resolve issues before shipping`
          : `CAUTION: ${warnCount} warning(s) present — review before shipping`;

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ verdict, summary, checkResults }),
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
