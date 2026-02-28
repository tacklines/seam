---
paths:
  - "src/**/*.ts"
---

# Testing

## Framework

Vitest 4. Config in `vitest.config.ts`.

## Conventions

- Tests are colocated: `src/lib/foo.ts` -> `src/lib/foo.test.ts`
- Test pattern: `src/**/*.test.ts`
- Path alias `@` resolves to `/src` in test config

## Running

```bash
npm test            # vitest run (single pass)
npm run test:watch  # vitest watch mode
```

## Style

- Use `describe` blocks named with Given/When/Then intent
- Import from vitest: `describe`, `it`, `expect`
- Import source modules with `.js` extension (ESM resolution)

## What to Test

- Pure functions in `src/lib/` -- always test
- Schema validation edge cases -- always test
- State store mutations -- test when behavior is non-obvious
- Components -- verify via Playwright e2e tests or manual dev server inspection

## E2E Testing (Playwright)

- E2E tests live in `e2e/` directory (not colocated with source)
- Config: `playwright.config.ts` (auto-starts Vite dev server)
- Run: `npm run test:e2e` (headless) or `npm run test:e2e:ui` (interactive)
- Use scoped locators (`.locator('.header')`) to avoid strict mode violations from duplicate text
- Playwright pierces shadow DOM by default -- no special handling needed for Lit components
- Fixture YAML files in `src/fixtures/` can be loaded via `setInputFiles` on the file input
