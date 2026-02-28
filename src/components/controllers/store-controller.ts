import type { ReactiveController, ReactiveControllerHost } from 'lit';
import { store, type AppState } from '../../state/app-state.js';

type Selector<T> = (state: AppState) => T;

/**
 * ReactiveController that subscribes to a slice of the app store and
 * triggers a host re-render whenever the selected value changes.
 *
 * Usage:
 *   private _filters = new StoreController(this, (s) => s.filters);
 *   // In render: this._filters.value
 */
export class StoreController<T> implements ReactiveController {
  host: ReactiveControllerHost;
  value: T;

  private readonly _selector: Selector<T>;
  private _unsubscribe: (() => void) | null = null;

  constructor(host: ReactiveControllerHost, selector: Selector<T>) {
    this.host = host;
    this._selector = selector;
    this.value = selector(store.get());
    host.addController(this);
  }

  hostConnected(): void {
    this._unsubscribe = store.subscribe(() => {
      const next = this._selector(store.get());
      if (next !== this.value) {
        this.value = next;
        this.host.requestUpdate();
      }
    });
  }

  hostDisconnected(): void {
    this._unsubscribe?.();
    this._unsubscribe = null;
  }
}
