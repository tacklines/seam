# Drive State

**Plan**: Immersive full-page dependency graph with filtering and navigation
**Instance**: default
**Started**: 2026-03-05
**Sprint count**: 0

## Completed Areas
- Basic Three.js dependency graph component (dependency-graph.ts)
- Backend GET /api/projects/:id/graph endpoint
- Graph tab in project workspace
- Lazy loading of Three.js chunk

## Current Sprint Focus
Sprint 1: Immersive full-page layout + filtering + navigation controls

## Remaining Areas
1. Full-page layout: graph fills entire viewport when tab active, no container padding
2. Filter panel: status, type, priority filters with animated show/hide of nodes
3. Search: find and focus on specific tasks by ticket ID or title
4. Navigation: click-to-focus, zoom-to-fit, reset view, keyboard shortcuts
5. Visual polish: better edge arrows, glow rings on hover, smooth camera transitions
6. Node interaction: click to select, show detail panel, highlight connected subgraph
