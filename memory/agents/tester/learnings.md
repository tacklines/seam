# Learnings: tester

## Codebase Patterns
- Test runner is Vitest (`npm test` for run, `npm run test:watch` for watch mode)
- Tests colocated next to source files (`foo.test.ts` beside `foo.ts`)
- Type checking via `npx tsc --noEmit` (separate from test run)
- Definition of done requires: happy path + at least one error path per pure function

## Gotchas
- Test commands require `dangerouslyDisableSandbox: true` due to bwrap loopback restrictions in sandbox (added: 2026-02-28, dispatch: multi-human-workflows-8ge)
- Build produces ~1.9 MB chunk with rollup advisory — not blocking but note if bundle size becomes a concern (added: 2026-02-28, dispatch: multi-human-workflows-8ge)
- Worktrees don't inherit node_modules from parent repo — must run `npm install` before `tsc --noEmit` or tests (added: 2026-03-01, dispatch: 36k)
- Storybook TS errors: TS2307 (module not found) cascades from missing node_modules, not wrong import paths; TS7006 (implicit any on render callback) fixed with explicit `Args` type annotation (added: 2026-03-01, dispatch: 36k)
- Shoelace dialogs in Lit shadow DOMs: `page.keyboard.press('Escape')` may not trigger close; use `[part="close-button"]` click instead (added: 2026-03-02, dispatch: 3r3.30)
- Scope main-area tab locators to `.main` because `settings-dialog` renders its own `sl-tab-group` simultaneously — strict mode violations otherwise (added: 2026-03-02, dispatch: 3r3.30)
- For `sl-input` fill operations in Playwright, target `sl-input input[type="search"]` to reach the inner native input (added: 2026-03-02, dispatch: 3r3.30)

## E2E Patterns
- 56 e2e tests across 7 spec files (app, file-loading, session-lifecycle, exploration, comparison, accessibility, settings) (added: 2026-03-02, dispatch: 3r3.30)
- Playwright pierces shadow DOM by default for locators, but `.filter({ hasText })` is needed for deeply nested shadow DOM text (added: 2026-03-02, dispatch: 3r3.30)

## Preferences
- (none yet)

## Cross-Agent Notes
- (none yet)
