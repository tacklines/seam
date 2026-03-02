import type { AppState } from '../state/app-state.js';
import type { Overlap } from './comparison.js';
import type { ContractEntry } from '../components/artifact/contract-sidebar.js';
import type { ContractBundle, EventContract, BoundaryContract } from '../schema/types.js';
import type { ProvenanceStep } from '../components/contract/provenance-explorer.js';

export type { ContractEntry, ProvenanceStep };

/**
 * Derive ContractEntry[] from loaded files.
 * Events appearing in 2+ files are potential contract points.
 * Uses sharedEvents from the comparison controller for overlap detection.
 * Pure derivation — no side effects.
 */
export function deriveContractEntries(
  files: AppState['files'],
  sharedEvents: Overlap[],
): ContractEntry[] {
  if (files.length < 2) return [];
  if (sharedEvents.length === 0) return [];

  // Build a map of eventName -> all event definitions (for conflict detection)
  const eventDefinitions = new Map<string, { aggregate: string; trigger: string | undefined; role: string }[]>();
  for (const file of files) {
    for (const ev of file.data.domain_events) {
      const defs = eventDefinitions.get(ev.name) ?? [];
      defs.push({ aggregate: ev.aggregate, trigger: ev.trigger, role: file.role });
      eventDefinitions.set(ev.name, defs);
    }
  }

  return sharedEvents.map((overlap): ContractEntry => {
    const eventName = overlap.label;
    const defs = eventDefinitions.get(eventName) ?? [];
    const owner = defs[0]?.aggregate ?? overlap.roles[0];

    // Consumers are roles that reference this event but are not the first definer
    const consumers = overlap.roles.slice(1);

    // Determine status: fail if aggregates disagree, warn if triggers differ, pass otherwise
    const aggregates = [...new Set(defs.map((d) => d.aggregate))];
    const triggers = [...new Set(defs.map((d) => d.trigger).filter(Boolean))];

    let status: 'pass' | 'warn' | 'fail';
    if (aggregates.length > 1) {
      status = 'fail';
    } else if (triggers.length > 1) {
      status = 'warn';
    } else {
      status = 'pass';
    }

    return { eventName, owner, consumers, status };
  });
}

/**
 * Derive a synthetic ContractBundle from loaded files for the contracts tab.
 * Shared events become EventContracts (version "0.0.1-draft"); aggregates become
 * BoundaryContracts. Also builds a combined schemas map for schema-display.
 * Pure derivation — no side effects.
 */
export function deriveContractsData(
  files: AppState['files'],
  sharedOverlaps: Overlap[],
): {
  bundle: ContractBundle;
  schemas: Record<string, unknown>;
} {
  const empty: ContractBundle = {
    generatedAt: new Date().toISOString(),
    eventContracts: [],
    boundaryContracts: [],
  };
  if (files.length < 2) return { bundle: empty, schemas: {} };
  if (sharedOverlaps.length === 0) return { bundle: empty, schemas: {} };

  // Build eventName -> aggregate from all files (first occurrence wins)
  const eventAggregateMap = new Map<string, string>();
  for (const file of files) {
    for (const ev of file.data.domain_events) {
      if (!eventAggregateMap.has(ev.name)) {
        eventAggregateMap.set(ev.name, ev.aggregate);
      }
    }
  }

  const eventContracts: EventContract[] = sharedOverlaps.map((overlap) => {
    const eventName = overlap.label;
    const aggregate = eventAggregateMap.get(eventName) ?? '';
    const roles = overlap.roles;
    return {
      eventName,
      aggregate,
      version: '0.0.1-draft',
      schema: {},
      owner: roles[0] ?? '',
      consumers: roles.slice(1),
      producedBy: roles[0] ?? '',
    };
  });

  // Group shared events by aggregate for BoundaryContracts
  const aggregateEventsMap = new Map<string, string[]>();
  for (const ec of eventContracts) {
    const evs = aggregateEventsMap.get(ec.aggregate) ?? [];
    evs.push(ec.eventName);
    aggregateEventsMap.set(ec.aggregate, evs);
  }
  const aggregateOwnerMap = new Map<string, string>();
  for (const ec of eventContracts) {
    if (!aggregateOwnerMap.has(ec.aggregate)) {
      aggregateOwnerMap.set(ec.aggregate, ec.owner);
    }
  }

  const boundaryContracts: BoundaryContract[] = [...aggregateEventsMap.entries()].map(
    ([aggregate, events]): BoundaryContract => ({
      boundaryName: aggregate,
      aggregates: [aggregate],
      events,
      owner: aggregateOwnerMap.get(aggregate) ?? '',
      externalDependencies: [],
    })
  );

  const bundle: ContractBundle = {
    generatedAt: new Date().toISOString(),
    eventContracts,
    boundaryContracts,
  };

  // Build combined schema map: eventName -> {} for schema-display
  const schemas: Record<string, unknown> = {};
  for (const ec of eventContracts) {
    schemas[ec.eventName] = { type: 'object', description: `${ec.aggregate} (draft)` };
  }

  return { bundle, schemas };
}

/**
 * Derive a provenance chain for the contracts tab, tracing the lineage of
 * contract data back through participants, conflicts, and shared events.
 * Pure derivation — no side effects.
 */
export function deriveProvenanceChain(
  files: AppState['files'],
  conflicts: Overlap[],
  sharedEvents: Overlap[],
): ProvenanceStep[] {
  if (files.length < 2) return [];
  const chain: ProvenanceStep[] = [];

  // Add participant steps (base of the chain)
  for (const file of files) {
    chain.push({
      kind: 'participant',
      label: file.role,
      detail: `Submitted ${file.data.domain_events.length} events`,
    });
  }

  // Add conflict steps for overlaps
  for (const conflict of conflicts) {
    chain.push({
      kind: 'conflict',
      label: conflict.label,
      detail: conflict.details || `Conflict between ${conflict.roles.join(', ')}`,
    });
  }

  // Add resolution steps for shared events (agreements)
  for (const shared of sharedEvents) {
    chain.push({
      kind: 'resolution',
      label: shared.label,
      detail: `Agreed by ${shared.roles.join(', ')}`,
    });
  }

  return chain;
}
