# Seam

**Your systems will meet. Make sure they agree.**

Seam is the boundary negotiation platform where teams and AI agents turn integration assumptions into verified contracts. Participants create or join sessions via join codes, contribute storm-prep YAML files, and visualize combined domain event flows in real time.

## Features

- **Drag-and-drop YAML loading** -- drop one or more storm-prep YAML files to begin
- **Card view** -- browse candidate events grouped by aggregate
- **Comparison view** -- see where participants agree, diverge, or conflict on domain events
- **Flow diagram** -- interactive ELK-layout graph with compound aggregate nodes, text search, minimap, and edge filtering by confidence/direction
- **Schema validation** -- files are validated against the canonical `candidate-events.schema.json` on load

## Tech Stack

| Layer | Technology |
|---|---|
| Components | [Lit](https://lit.dev/) web components |
| Styling | [Tailwind CSS v4](https://tailwindcss.com/) |
| UI primitives | [Shoelace](https://shoelace.style/) |
| Graph layout | [ELK.js](https://github.com/kieler/elkjs) + [D3](https://d3js.org/) (zoom/pan) |
| Build | [Vite](https://vite.dev/) |
| Testing | [Vitest](https://vitest.dev/) |
| Language | TypeScript |

## Getting Started

```bash
npm install
npm run dev        # start dev server at localhost:5173
```

Open the app and drag a storm-prep YAML file onto the drop zone.

## Scripts

```bash
npm run dev          # Vite dev server
npm run build        # type-check + production build
npm run preview      # preview production build
npm test             # run tests once
npm run test:watch   # run tests in watch mode
```

## Project Structure

```
src/
  schema/        # JSON schema + TypeScript types for candidate events
  lib/           # Pure functions: YAML loading, validation, comparison, layout
  state/         # Reactive pub/sub store (framework-independent)
  components/    # Lit web components (one element per file)
  fixtures/      # Sample YAML files for development
```

## License

Private -- not published.
