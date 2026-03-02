/**
 * Keyboard shortcut registry for Seam.
 *
 * Framework-agnostic: takes KeyboardEvents and calls registered handlers.
 * Customizations are stored in localStorage under `mhw-keyboard-shortcuts`.
 *
 * Usage:
 *   import { registry } from '@/lib/shortcut-registry';
 *   registry.register({ id: 'action.resolve', key: 'r', ... }, () => openResolveDialog());
 */

export interface Shortcut {
  id: string;           // e.g. 'phase.spark', 'action.resolve'
  key: string;          // e.g. 'n', 'r', 'Enter', 'Escape'
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  description: string;  // Human-readable, shown in settings dialog
  category: string;     // 'Navigation' | 'Actions' | 'Phases'
}

export type ShortcutCustomization = Pick<Shortcut, 'key' | 'ctrl' | 'shift' | 'alt' | 'meta'>;

const STORAGE_KEY = 'mhw-keyboard-shortcuts';

/** Elements that should suppress global keyboard shortcuts when focused. */
const INPUT_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

function isEditableTarget(target: EventTarget | null): boolean {
  if (!target) return false;
  const el = target as { tagName?: string; isContentEditable?: boolean };
  if (typeof el.tagName === 'string' && INPUT_TAGS.has(el.tagName)) return true;
  // contenteditable elements
  if (el.isContentEditable === true) return true;
  return false;
}

function matchesShortcut(event: KeyboardEvent, shortcut: Shortcut): boolean {
  // Key comparison is case-insensitive for single characters, exact for special keys
  const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase();
  const ctrlMatch = !!event.ctrlKey === !!shortcut.ctrl;
  const shiftMatch = !!event.shiftKey === !!shortcut.shift;
  const altMatch = !!event.altKey === !!shortcut.alt;
  const metaMatch = !!event.metaKey === !!shortcut.meta;
  return keyMatch && ctrlMatch && shiftMatch && altMatch && metaMatch;
}

export class ShortcutRegistry {
  private _shortcuts: Map<string, Shortcut> = new Map();
  private _handlers: Map<string, () => void> = new Map();
  private _customizations: Map<string, ShortcutCustomization> = new Map();

  /**
   * Register a shortcut with its handler.
   * If the shortcut id already exists, it will be replaced.
   */
  register(shortcut: Shortcut, handler: () => void): void {
    // Apply any stored customization for this id
    const customization = this._customizations.get(shortcut.id);
    const effective: Shortcut = customization
      ? { ...shortcut, ...customization }
      : shortcut;

    this._shortcuts.set(shortcut.id, effective);
    this._handlers.set(shortcut.id, handler);
  }

  /**
   * Unregister a shortcut by id.
   */
  unregister(id: string): void {
    this._shortcuts.delete(id);
    this._handlers.delete(id);
  }

  /**
   * Return all registered shortcuts.
   */
  getAll(): Shortcut[] {
    return Array.from(this._shortcuts.values());
  }

  /**
   * Return shortcuts filtered by category.
   */
  getByCategory(category: string): Shortcut[] {
    return this.getAll().filter((s) => s.category === category);
  }

  /**
   * Process a keyboard event. Calls the matching handler if found.
   * Returns true if the event was handled (caller should call preventDefault/stopPropagation).
   * Skips handling when target is an editable element.
   */
  handleKeydown(event: KeyboardEvent): boolean {
    if (isEditableTarget(event.target)) return false;

    for (const [id, shortcut] of this._shortcuts) {
      if (matchesShortcut(event, shortcut)) {
        const handler = this._handlers.get(id);
        if (handler) {
          handler();
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Customize the key binding for an existing shortcut.
   * The change takes effect immediately and is persisted to localStorage.
   */
  customize(id: string, newKey: Partial<ShortcutCustomization>): void {
    const existing = this._shortcuts.get(id);
    if (!existing) return;

    const current = this._customizations.get(id) ?? {};
    const updated: ShortcutCustomization = {
      key: existing.key,
      ctrl: existing.ctrl,
      shift: existing.shift,
      alt: existing.alt,
      meta: existing.meta,
      ...current,
      ...newKey,
    };
    this._customizations.set(id, updated);

    // Update the live shortcut entry
    this._shortcuts.set(id, { ...existing, ...updated });

    this.saveToStorage();
  }

  /**
   * Reset all customizations to their registered defaults.
   * Handlers are NOT cleared — only the key bindings revert to default.
   */
  resetDefaults(): void {
    this._customizations.clear();
    this.saveToStorage();
    // Re-apply defaults for any registered shortcuts by stripping customizations
    // We need to re-register with original shortcut objects, but we only have the
    // current (possibly customized) versions. The registry cannot recover the
    // original defaults on its own — callers must re-register after resetDefaults().
    // We fire a custom event so the host (e.g. app-shell) can re-register.
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('shortcut-registry-reset'));
    }
  }

  /**
   * Load customizations from localStorage and apply them to any already-registered shortcuts.
   */
  loadFromStorage(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, ShortcutCustomization>;
      this._customizations = new Map(Object.entries(parsed));

      // Apply loaded customizations to already-registered shortcuts
      for (const [id, customization] of this._customizations) {
        const existing = this._shortcuts.get(id);
        if (existing) {
          this._shortcuts.set(id, { ...existing, ...customization });
        }
      }
    } catch {
      // Corrupted storage — silently ignore and start fresh
    }
  }

  /**
   * Persist current customizations to localStorage.
   */
  saveToStorage(): void {
    try {
      const obj: Record<string, ShortcutCustomization> = {};
      for (const [id, customization] of this._customizations) {
        obj[id] = customization;
      }
      if (Object.keys(obj).length === 0) {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
      }
    } catch {
      // localStorage unavailable — silently swallow
    }
  }
}

/** Module-level singleton registry. Import this in components and app-shell. */
export const registry = new ShortcutRegistry();
