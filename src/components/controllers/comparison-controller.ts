import type { ReactiveController, ReactiveControllerHost } from 'lit';
import type { LoadedFile } from '../../schema/types.js';
import { compareFiles, type Overlap } from '../../lib/comparison.js';

/**
 * ReactiveController that computes cross-role overlaps from a set of loaded
 * files and categorizes them into conflicts, shared events, and shared
 * aggregates.
 *
 * Recomputes only when the `files` property is updated via `setFiles()`.
 *
 * Usage:
 *   private _comparison = new ComparisonController(this);
 *   // In render: this._comparison.conflictCount
 *   // In updated: this._comparison.setFiles(this.files);
 */
export class ComparisonController implements ReactiveController {
  host: ReactiveControllerHost;

  private _files: LoadedFile[] = [];
  private _overlaps: Overlap[] = [];

  constructor(host: ReactiveControllerHost) {
    this.host = host;
    host.addController(this);
  }

  hostConnected(): void {
    // Nothing to subscribe to — data is push-fed via setFiles()
  }

  hostDisconnected(): void {
    // No subscriptions to clean up
  }

  /**
   * Push new files into the controller. Recomputes overlaps and requests a
   * host re-render if the file list has changed.
   */
  setFiles(files: LoadedFile[]): void {
    if (files === this._files) return;
    this._files = files;
    this._overlaps = files.length >= 2 ? compareFiles(files) : [];
    this.host.requestUpdate();
  }

  /** All overlaps across all kinds */
  get overlaps(): Overlap[] {
    return this._overlaps;
  }

  /** Overlaps where two roles have conflicting boundary assumptions */
  get conflicts(): Overlap[] {
    return this._overlaps.filter((o) => o.kind === 'assumption-conflict');
  }

  /** Overlaps where the same event name appears in multiple roles */
  get sharedEvents(): Overlap[] {
    return this._overlaps.filter((o) => o.kind === 'same-name');
  }

  /** Overlaps where the same aggregate name appears in multiple roles */
  get sharedAggregates(): Overlap[] {
    return this._overlaps.filter((o) => o.kind === 'same-aggregate');
  }

  /** Total conflict count (assumption-conflict kind only) */
  get conflictCount(): number {
    return this.conflicts.length;
  }

  /** Total overlap count across all kinds */
  get overlapCount(): number {
    return this._overlaps.length;
  }
}
