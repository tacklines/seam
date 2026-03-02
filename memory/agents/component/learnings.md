# Learnings: component

## Core — High-Reuse Fundamentals

### Project Structure
- One custom element per file, registered via `@customElement('tag-name')` decorator
- Shoelace components imported per-component (tree-shaking, not full bundle)
- `experimentalDecorators: true` + `useDefineForClassFields: false` in tsconfig (required for Lit)
- Components organized by domain feature: shared/, session/, artifact/, comparison/, visualization/ under src/components/ (added: 2026-02-28)

### Accessibility
- SVG: `tabindex="0"`, `role="application"`, `aria-activedescendant`; roving tabindex with adjacency map for keyboard navigation (added: 2026-02-28)
- Panels: `aria-hidden` toggling + focus-on-open + restore-on-close; SVG-only views use visually-hidden `<table>` as screen reader fallback (added: 2026-02-28)

### Shoelace Gotchas
- `sl-change` on `SlSelect`: cast via `(e.target as unknown as { value: string }).value` (added: 2026-02-28)
- `sl-switch` fires `sl-change` with `.checked` on target (not `.value`) — cast as `{ checked: boolean }` (added: 2026-03-02)
- `sl-details` custom summary: use `slot="summary"` div pattern, not `summary=""` string attribute (added: 2026-03-02)

### Lit Reactivity
- `@state() private _foo: Set<T>` requires `new Set(this._foo)` assignments (not `.add()`) to trigger re-renders (added: 2026-03-02)
- Avoid `before`, `after`, `remove`, `append`, `prepend`, `replaceWith` as @property names — they collide with Element DOM methods (added: 2026-02-28)
- For recursive render methods, add explicit `: TemplateResult` return type — TS can't infer through html`` tags (added: 2026-02-28)

### State & Events
- Connection lifecycle (EventSource, WebSocket) belongs in `state/`, not components — state persists across navigation (added: 2026-02-28)
- Store subscriptions: connect in `connectedCallback`, unsubscribe in `disconnectedCallback` (added: 2026-02-28)
- Global document listeners: bind handler to instance field in connectedCallback, remove in disconnectedCallback (added: 2026-03-02)
- Offline mode: fire custom events with `composed:true` when no session code — supports connected and standalone usage (added: 2026-02-28)

## Task-Relevant — Current Sprint Context

### i18n
- `t(key, params?)` with `{{param}}` interpolation; when loop variable shadows `t`, rename the loop variable (added: 2026-03-01)

### Animation & SVG
- CSS animation re-triggering: toggle `animating` class on/off with `setTimeout` matching duration (added: 2026-03-01)
- SVG drag-to-connect: mousedown/mouseup + window.addEventListener — HTML DnD API unreliable on SVG (added: 2026-03-02)
- SVG progress ring: `stroke-dasharray=circumference`, `stroke-dashoffset=circumference*(1-pct/100)`, rotate -90deg (added: 2026-03-02)
- CSS confetti: stacked wrapper divs with `::before`/`::after`, each with own `@keyframes` + delay; wrap in `prefers-reduced-motion` (added: 2026-03-02)

### D&D / Kanban
- Board-mode D&D: store dragging item in @state, set dragover/dragleave/drop on columns, dragstart/dragend on cards. Keyboard: ArrowLeft/Right (added: 2026-03-02)

### Testing
- KeyboardEvent tests in node: use plain objects cast with `as unknown as KeyboardEvent` (added: 2026-03-02)
- Module-level singletons: export both class (for test isolation) and singleton (for app use) (added: 2026-03-02)

### Settings
- Casting typed sub-config to `Record<string, unknown>`: use `as unknown as Record<string, unknown>` (added: 2026-03-02)

### Storybook
- Config runs as ESM — use `fileURLToPath(import.meta.url)` + `path.dirname()` instead of `__dirname` (added: 2026-03-01)
- `viteFinal` hook (not `viteFinalConfig`) for Vite customization; stories in `src/stories/` (added: 2026-03-01)

## Cross-Agent Notes
- (from logic) ELK returns top-left (x,y) not center; use `_nodeCx`/`_nodeCy` helpers (added: 2026-02-28)
