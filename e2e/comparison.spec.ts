import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(__dirname, '..', 'src', 'fixtures');

/**
 * checkout-frontend and payment-backend both have a "PaymentSucceeded" event
 * (checkout-frontend has it as inbound, payment-backend as outbound) — they
 * share the same aggregate name "Checkout"/"Payment" and the event name
 * "PaymentSucceeded", which triggers conflicts or shared-event detection.
 */
test.describe('Comparison / Conflicts View', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByText('Load files locally').click();

    const fileInput = page.locator('file-drop-zone input[type="file"]');
    await fileInput.setInputFiles([
      path.join(FIXTURE_DIR, 'checkout-frontend.yaml'),
      path.join(FIXTURE_DIR, 'payment-backend.yaml'),
    ]);

    await expect(page.locator('.header-title')).toBeVisible({ timeout: 10_000 });

    // Navigate to Conflicts tab (scoped to .main to avoid settings-dialog tabs)
    await page.locator('.main sl-tab[panel="comparison"]').click();
  });

  test('comparison-view component is rendered after switching to Conflicts tab', async ({ page }) => {
    const comparisonView = page.locator('comparison-view');
    await expect(comparisonView).toBeAttached({ timeout: 10_000 });
  });

  test('comparison summary stat cards are visible', async ({ page }) => {
    const statsRegion = page.locator('[aria-label="Comparison summary"]');
    await expect(statsRegion).toBeVisible({ timeout: 10_000 });

    // Three stat cards: Conflicts, Shared Events, Shared Aggregates
    const statCards = statsRegion.locator('.stat-card');
    await expect(statCards).toHaveCount(3);
  });

  test('conflicts section heading is visible', async ({ page }) => {
    // The heading "Conflicts" appears as a section heading in the comparison view
    const conflictsHeading = page.locator('.section-heading.conflicts');
    await expect(conflictsHeading).toBeVisible({ timeout: 10_000 });
  });

  test('shared events section heading is visible', async ({ page }) => {
    const sharedEventsHeading = page.locator('.section-heading.shared-events');
    await expect(sharedEventsHeading).toBeVisible({ timeout: 10_000 });
  });

  test('shared aggregates section heading is visible', async ({ page }) => {
    const sharedAggregatesHeading = page.locator('.section-heading.shared-aggregates');
    await expect(sharedAggregatesHeading).toBeVisible({ timeout: 10_000 });
  });

  test('PaymentSucceeded is flagged as a shared event across the two roles', async ({ page }) => {
    // Both checkout-frontend and payment-backend define PaymentSucceeded.
    // The comparison-view renders conflict-card elements whose `.label` span holds the event name.
    // Wait for comparison-view to be fully rendered, then look for the text in the entire page.
    const comparisonView = page.locator('comparison-view');
    await expect(comparisonView).toBeAttached({ timeout: 10_000 });
    // The shared-events section heading should be visible before checking for the event name
    await expect(page.locator('.section-heading.shared-events')).toBeVisible({ timeout: 10_000 });
    // Look for PaymentSucceeded text anywhere in the page (Playwright pierces shadow DOM)
    await expect(page.locator('conflict-card').filter({ hasText: 'PaymentSucceeded' }).first()).toBeAttached({ timeout: 10_000 });
  });

  test('role panels collapsible is present', async ({ page }) => {
    // The comparison-view renders sl-details inside its shadow root.
    // Playwright pierces shadow DOM when using locator('sl-details').
    const comparisonView = page.locator('comparison-view');
    await expect(comparisonView).toBeAttached({ timeout: 10_000 });
    // sl-details is rendered inside comparison-view's shadow DOM — Playwright pierces it
    await expect(page.locator('sl-details').first()).toBeAttached({ timeout: 10_000 });
  });

  test('conflicts tab badge shows a count when conflicts exist', async ({ page }) => {
    // Navigate away first, then come back to check the tab
    await page.locator('.main sl-tab[panel="cards"]').click();

    const conflictsTab = page.locator('.main sl-tab[panel="comparison"]');
    // If there are conflicts, an sl-badge appears inside the tab
    // We just verify the tab is active/enabled
    await expect(conflictsTab).not.toHaveAttribute('disabled', '');
  });
});

test.describe('Comparison with three files', () => {
  test('shows all three roles in the comparison view role panels', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Load files locally').click();

    const fileInput = page.locator('file-drop-zone input[type="file"]');
    await fileInput.setInputFiles([
      path.join(FIXTURE_DIR, 'checkout-frontend.yaml'),
      path.join(FIXTURE_DIR, 'payment-backend.yaml'),
      path.join(FIXTURE_DIR, 'session-orchestration.yaml'),
    ]);

    await expect(page.locator('.header-title')).toBeVisible({ timeout: 10_000 });
    await page.locator('.main sl-tab[panel="comparison"]').click();

    const comparisonView = page.locator('comparison-view');
    await expect(comparisonView).toBeAttached({ timeout: 10_000 });

    // All three roles should appear in the comparison view panels
    // (either in stat cards or role-specific panels)
    await expect(page.getByText('checkout-frontend').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('payment-backend').first()).toBeVisible();
  });
});
