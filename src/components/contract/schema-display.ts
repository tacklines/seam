import { LitElement, html, css, nothing, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { t } from '../../lib/i18n.js';

import '@shoelace-style/shoelace/dist/components/badge/badge.js';
import '@shoelace-style/shoelace/dist/components/icon-button/icon-button.js';
import '@shoelace-style/shoelace/dist/components/tooltip/tooltip.js';

// ── Types ──────────────────────────────────────────────────────────────────

/**
 * A schema field entry — represents one key in a JSON-Schema-like object.
 * The value can be a primitive descriptor ({ type, description, required })
 * or a nested object (treated as sub-schema).
 */
interface SchemaFieldDescriptor {
  type?: string;
  description?: string;
  required?: boolean;
}

/**
 * Parsed representation of a single schema field for rendering.
 */
interface ParsedField {
  key: string;
  type: string;
  description: string;
  required: boolean;
  nested: ParsedField[] | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function parseSchema(schema: Record<string, unknown>, depth = 0): ParsedField[] {
  if (depth > 5) return []; // Guard against infinite nesting
  return Object.entries(schema).map(([key, value]) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const v = value as Record<string, unknown>;
      // Check if this looks like a nested object schema (no "type" key, or type === 'object')
      const hasNestedKeys =
        v.type === 'object' ||
        (v.type === undefined &&
          !('description' in v) &&
          Object.keys(v).length > 0 &&
          Object.values(v).every((sub) => sub && typeof sub === 'object'));

      if (hasNestedKeys) {
        const nested = v.properties
          ? parseSchema(v.properties as Record<string, unknown>, depth + 1)
          : parseSchema(
              Object.fromEntries(
                Object.entries(v).filter(([k]) => k !== 'type' && k !== 'description' && k !== 'required')
              ),
              depth + 1
            );
        return {
          key,
          type: (v.type as string | undefined) ?? 'object',
          description: (v.description as string | undefined) ?? '',
          required: Boolean(v.required),
          nested: nested.length > 0 ? nested : null,
        };
      }

      return {
        key,
        type: (v.type as string | undefined) ?? 'unknown',
        description: (v.description as string | undefined) ?? '',
        required: Boolean(v.required),
        nested: null,
      };
    }

    // Primitive value (e.g. "string" directly)
    return {
      key,
      type: typeof value === 'string' ? value : 'unknown',
      description: '',
      required: false,
      nested: null,
    };
  });
}

const TYPE_COLORS: Record<string, string> = {
  string: '#2563eb',
  number: '#16a34a',
  integer: '#16a34a',
  boolean: '#7c3aed',
  object: '#b45309',
  array: '#db2777',
  null: '#6b7280',
  unknown: '#9ca3af',
};

// ── Component ──────────────────────────────────────────────────────────────

/**
 * `<schema-display>` renders a JSON-Schema-like object as a readable field list.
 * Supports expandable nested objects, type badges, required/optional indicators,
 * and keyboard navigation.
 *
 * @property schema - The schema object to display (Record<string, unknown>)
 * @property label  - Optional heading label for the schema section
 */
@customElement('schema-display')
export class SchemaDisplay extends LitElement {
  static styles = css`
    :host {
      display: block;
      font-family: var(--sl-font-sans);
    }

    .empty {
      text-align: center;
      padding: 1.5rem;
      color: #9ca3af;
      font-size: 0.875rem;
      font-style: italic;
    }

    .schema-label {
      font-size: 0.8125rem;
      font-weight: 700;
      color: #374151;
      margin-bottom: 0.5rem;
      letter-spacing: 0.02em;
      text-transform: uppercase;
    }

    .field-list {
      list-style: none;
      margin: 0;
      padding: 0;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      overflow: hidden;
    }

    .field-item {
      border-bottom: 1px solid #f3f4f6;
    }

    .field-item:last-child {
      border-bottom: none;
    }

    .field-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 0.75rem;
      background: #fff;
      min-height: 2.5rem;
      cursor: default;
    }

    .field-row:hover {
      background: #f9fafb;
    }

    .field-row.has-nested {
      cursor: pointer;
    }

    .field-row.has-nested:focus {
      outline: 2px solid #3b82f6;
      outline-offset: -2px;
    }

    .expand-btn {
      flex-shrink: 0;
      width: 1.25rem;
      height: 1.25rem;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 3px;
      font-size: 0.625rem;
      color: #6b7280;
      transition: transform 0.2s ease;
    }

    .expand-btn.expanded {
      transform: rotate(90deg);
    }

    .expand-placeholder {
      flex-shrink: 0;
      width: 1.25rem;
    }

    .field-key {
      font-family: var(--sl-font-mono, monospace);
      font-size: 0.8125rem;
      font-weight: 600;
      color: #111827;
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .type-badge {
      font-family: var(--sl-font-mono, monospace);
      font-size: 0.6875rem;
      font-weight: 600;
      padding: 0.125rem 0.375rem;
      border-radius: 3px;
      background: #f3f4f6;
      border: 1px solid #e5e7eb;
      flex-shrink: 0;
      white-space: nowrap;
    }

    .required-indicator {
      flex-shrink: 0;
      font-size: 0.75rem;
      font-weight: 700;
    }

    .required-indicator.required {
      color: #dc2626;
    }

    .required-indicator.optional {
      color: #9ca3af;
    }

    .field-description {
      font-size: 0.75rem;
      color: #6b7280;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 20ch;
    }

    .nested-list {
      margin: 0;
      padding: 0 0 0 1.5rem;
      list-style: none;
      background: #f9fafb;
      border-top: 1px solid #f3f4f6;
    }

    .nested-list .field-row {
      background: #f9fafb;
    }

    .nested-list .field-row:hover {
      background: #f3f4f6;
    }
  `;

  /** The schema object to render. Keys are field names; values are descriptors. */
  @property({ attribute: false }) schema: Record<string, unknown> = {};

  /** Optional label shown above the schema. */
  @property({ type: String }) label = '';

  @state() private _expanded = new Set<string>();

  private _toggleExpand(key: string) {
    const next = new Set(this._expanded);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    this._expanded = next;
  }

  private _onKeyDown(e: KeyboardEvent, key: string) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this._toggleExpand(key);
    }
  }

  override render() {
    const entries = parseSchema(this.schema);

    if (entries.length === 0) {
      return html`<div class="empty">${t('schemaDisplay.empty')}</div>`;
    }

    return html`
      ${this.label ? html`<div class="schema-label">${this.label}</div>` : nothing}
      <ul class="field-list" role="tree" aria-label="${this.label || t('schemaDisplay.defaultAriaLabel')}">
        ${entries.map((f) => this._renderField(f, ''))}
      </ul>
    `;
  }

  private _renderField(field: ParsedField, parentPath: string): TemplateResult {
    const path = parentPath ? `${parentPath}.${field.key}` : field.key;
    const hasNested = field.nested !== null && field.nested.length > 0;
    const isExpanded = this._expanded.has(path);
    const typeColor = TYPE_COLORS[field.type] ?? TYPE_COLORS.unknown;

    return html`
      <li class="field-item" role="treeitem" aria-expanded=${hasNested ? String(isExpanded) : nothing}>
        <div
          class="field-row ${hasNested ? 'has-nested' : ''}"
          tabindex=${hasNested ? '0' : '-1'}
          @click=${hasNested ? () => this._toggleExpand(path) : nothing}
          @keydown=${hasNested ? (e: KeyboardEvent) => this._onKeyDown(e, path) : nothing}
          aria-label="${field.key}: ${field.type} (${field.required ? t('schemaDisplay.fieldAriaLabel.required') : t('schemaDisplay.fieldAriaLabel.optional')})${field.description ? '. ' + field.description : ''}"
        >
          ${hasNested
            ? html`<span class="expand-btn ${isExpanded ? 'expanded' : ''}" aria-hidden="true">&#9654;</span>`
            : html`<span class="expand-placeholder" aria-hidden="true"></span>`}

          <span class="field-key">${field.key}</span>

          <span
            class="type-badge"
            style="color: ${typeColor}; border-color: ${typeColor}22;"
          >${field.type}</span>

          <sl-tooltip content="${field.required ? t('schemaDisplay.required') : t('schemaDisplay.optional')}">
            <span
              class="required-indicator ${field.required ? 'required' : 'optional'}"
              aria-label="${field.required ? t('schemaDisplay.required') : t('schemaDisplay.optional')}"
            >${field.required ? '*' : '?'}</span>
          </sl-tooltip>

          ${field.description
            ? html`<span class="field-description" title="${field.description}">${field.description}</span>`
            : nothing}
        </div>

        ${hasNested && isExpanded
          ? html`
              <ul class="nested-list" role="group" aria-label="${t('schemaDisplay.fieldsOfAriaLabel', { key: field.key })}">
                ${field.nested!.map((f) => this._renderField(f, path))}
              </ul>
            `
          : nothing}
      </li>
    `;
  }
}
