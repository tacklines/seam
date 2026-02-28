import type { ReactiveController, ReactiveControllerHost } from 'lit';
import type { LoadedFile, DomainEvent, Confidence, Direction } from '../../schema/types.js';
import { groupByAggregate } from '../../lib/grouping.js';

export interface EventStats {
  total: number;
  byConfidence: Record<Confidence, number>;
  byDirection: Record<Direction, number>;
}

/**
 * ReactiveController that applies confidence/direction filters to a set of
 * loaded files and computes derived statistics.
 *
 * Recomputes eagerly whenever files or filters change via `setFiles()` or
 * `setFilters()`. Consumers read `.filteredFiles`, `.stats`, and
 * `.groupsForFile()` directly in their `render()`.
 *
 * Usage:
 *   private _eventFilter = new EventFilterController(this);
 *   // In updated():
 *   //   this._eventFilter.setFiles(this.files);
 *   //   this._eventFilter.setFilters(this.confidenceFilter, this.directionFilter);
 *   // In render():
 *   //   this._eventFilter.stats
 *   //   this._eventFilter.groupsForFile(file)
 */
export class EventFilterController implements ReactiveController {
  host: ReactiveControllerHost;

  private _files: LoadedFile[] = [];
  private _confidenceFilter = new Set<Confidence>(['CONFIRMED', 'LIKELY', 'POSSIBLE']);
  private _directionFilter = new Set<Direction>(['inbound', 'outbound', 'internal']);

  private _allFiltered: DomainEvent[] = [];
  private _stats: EventStats = {
    total: 0,
    byConfidence: { CONFIRMED: 0, LIKELY: 0, POSSIBLE: 0 },
    byDirection: { inbound: 0, outbound: 0, internal: 0 },
  };

  constructor(host: ReactiveControllerHost) {
    this.host = host;
    host.addController(this);
  }

  hostConnected(): void {
    // No subscriptions — data is push-fed via setFiles() / setFilters()
  }

  hostDisconnected(): void {
    // No subscriptions to clean up
  }

  /** Update the loaded files. Triggers recompute and host re-render when changed. */
  setFiles(files: LoadedFile[]): void {
    if (files === this._files) return;
    this._files = files;
    this._recompute();
    this.host.requestUpdate();
  }

  /** Update the active confidence and direction filter sets. Triggers recompute when changed. */
  setFilters(confidence: Set<Confidence>, direction: Set<Direction>): void {
    const confChanged = !setsEqual(confidence, this._confidenceFilter);
    const dirChanged = !setsEqual(direction, this._directionFilter);
    if (!confChanged && !dirChanged) return;
    this._confidenceFilter = confidence;
    this._directionFilter = direction;
    this._recompute();
    this.host.requestUpdate();
  }

  /** All domain events from all files that pass the active filters */
  get allFiltered(): DomainEvent[] {
    return this._allFiltered;
  }

  /** Aggregated stats across all filtered events */
  get stats(): EventStats {
    return this._stats;
  }

  /**
   * Filter a single file's events and group them by aggregate.
   * Returns an empty Map when the file has no events that pass filters.
   */
  groupsForFile(file: LoadedFile): Map<string, DomainEvent[]> {
    const filtered = this._filterEvents(file.data.domain_events);
    return groupByAggregate(filtered);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private _filterEvents(events: DomainEvent[]): DomainEvent[] {
    return events.filter(
      (e) =>
        this._confidenceFilter.has(e.confidence) &&
        this._directionFilter.has(e.integration.direction),
    );
  }

  private _recompute(): void {
    this._allFiltered = this._files.flatMap((f) => this._filterEvents(f.data.domain_events));
    this._stats = {
      total: this._allFiltered.length,
      byConfidence: countByConfidence(this._allFiltered),
      byDirection: countByDirection(this._allFiltered),
    };
  }
}

// ── Module-level pure helpers (no DOM, easily testable) ─────────────────────

function countByConfidence(events: DomainEvent[]): Record<Confidence, number> {
  const counts: Record<Confidence, number> = { CONFIRMED: 0, LIKELY: 0, POSSIBLE: 0 };
  for (const e of events) {
    counts[e.confidence]++;
  }
  return counts;
}

function countByDirection(events: DomainEvent[]): Record<Direction, number> {
  const counts: Record<Direction, number> = { inbound: 0, outbound: 0, internal: 0 };
  for (const e of events) {
    counts[e.integration.direction]++;
  }
  return counts;
}

function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}
