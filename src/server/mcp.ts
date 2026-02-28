import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { sessionStore } from './store.js';
import { parseAndValidate } from '../lib/yaml-validator-server.js';
import { computePrepStatus, computeSessionStatus } from '../lib/prep-completeness.js';
import { computeWorkflowStatus } from '../lib/workflow-engine.js';

async function main(): Promise<void> {
  const server = new McpServer({
    name: 'multi-human-workflows',
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

  const transport = new StdioServerTransport();

  console.error('[mcp] starting multi-human-workflows MCP server');

  await server.connect(transport);

  console.error('[mcp] server connected via stdio transport');
}

main().catch((err: unknown) => {
  console.error('[mcp] fatal error:', err);
  process.exit(1);
});
