import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(__dirname, '..', 'src', 'fixtures');

test.describe('Session Lifecycle — Multi-File Loading', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByText('Load files locally').click();
  });

  test('loads three fixture files and shows all roles as header pills', async ({ page }) => {
    const fileInput = page.locator('file-drop-zone input[type="file"]');
    await fileInput.setInputFiles([
      path.join(FIXTURE_DIR, 'checkout-frontend.yaml'),
      path.join(FIXTURE_DIR, 'payment-backend.yaml'),
      path.join(FIXTURE_DIR, 'session-orchestration.yaml'),
    ]);

    const header = page.locator('.header');
    await expect(header.getByText('checkout-frontend')).toBeVisible({ timeout: 10_000 });
    await expect(header.getByText('payment-backend')).toBeVisible();
    await expect(header.getByText('session-orchestration')).toBeVisible();
  });

  test('Conflicts tab becomes enabled with multiple files', async ({ page }) => {
    const fileInput = page.locator('file-drop-zone input[type="file"]');
    await fileInput.setInputFiles([
      path.join(FIXTURE_DIR, 'checkout-frontend.yaml'),
      path.join(FIXTURE_DIR, 'payment-backend.yaml'),
    ]);

    // Wait for app layout
    await expect(page.locator('.header-title')).toBeVisible({ timeout: 10_000 });

    // Conflicts tab should no longer be disabled (scope to main tabs, not settings-dialog)
    const conflictsTab = page.locator('.main sl-tab[panel="comparison"]');
    await expect(conflictsTab).not.toHaveAttribute('disabled', '');
  });

  test('can switch between Events, Flow, and Conflicts tabs', async ({ page }) => {
    const fileInput = page.locator('file-drop-zone input[type="file"]');
    await fileInput.setInputFiles([
      path.join(FIXTURE_DIR, 'checkout-frontend.yaml'),
      path.join(FIXTURE_DIR, 'payment-backend.yaml'),
    ]);

    await expect(page.locator('.header-title')).toBeVisible({ timeout: 10_000 });

    // Switch to Flow tab (scope to .main to avoid settings-dialog tabs)
    await page.locator('.main sl-tab[panel="flow"]').click();
    const flowDiagram = page.locator('flow-diagram');
    await expect(flowDiagram).toBeAttached();

    // Switch to Conflicts tab
    await page.locator('.main sl-tab[panel="comparison"]').click();
    const comparisonView = page.locator('comparison-view');
    await expect(comparisonView).toBeAttached();

    // Switch back to Events tab
    await page.locator('.main sl-tab[panel="cards"]').click();
    const cardView = page.locator('card-view');
    await expect(cardView).toBeAttached();
  });

  test('comparison view renders stat cards with multiple files', async ({ page }) => {
    const fileInput = page.locator('file-drop-zone input[type="file"]');
    await fileInput.setInputFiles([
      path.join(FIXTURE_DIR, 'checkout-frontend.yaml'),
      path.join(FIXTURE_DIR, 'payment-backend.yaml'),
    ]);

    await expect(page.locator('.header-title')).toBeVisible({ timeout: 10_000 });

    await page.locator('.main sl-tab[panel="comparison"]').click();

    // Comparison dashboard shows three stat cards
    const statsRegion = page.locator('[aria-label="Comparison summary"]');
    await expect(statsRegion).toBeVisible({ timeout: 10_000 });

    const statCards = statsRegion.locator('.stat-card');
    await expect(statCards).toHaveCount(3);
  });

  test('aggregate nav shows aggregates in the sidebar after loading files', async ({ page }) => {
    const fileInput = page.locator('file-drop-zone input[type="file"]');
    await fileInput.setInputFiles([
      path.join(FIXTURE_DIR, 'checkout-frontend.yaml'),
    ]);

    await expect(page.locator('.header-title')).toBeVisible({ timeout: 10_000 });

    // aggregate-nav component should be present in the sidebar
    const aggregateNav = page.locator('aggregate-nav');
    await expect(aggregateNav).toBeAttached();

    // The "Checkout" aggregate should be listed (from checkout-frontend fixture)
    // Use the aggregate-name span to avoid matching "checkout-frontend" role label
    await expect(aggregateNav.locator('.aggregate-name', { hasText: 'Checkout' })).toBeVisible();
  });

  test('removing a file pill removes it from the header', async ({ page }) => {
    const fileInput = page.locator('file-drop-zone input[type="file"]');
    await fileInput.setInputFiles([
      path.join(FIXTURE_DIR, 'checkout-frontend.yaml'),
      path.join(FIXTURE_DIR, 'payment-backend.yaml'),
    ]);

    const header = page.locator('.header');
    await expect(header.getByText('checkout-frontend')).toBeVisible({ timeout: 10_000 });
    await expect(header.getByText('payment-backend')).toBeVisible();

    // Remove the checkout-frontend pill using the sl-tag remove button
    const checkoutTag = header.locator('sl-tag').filter({ hasText: 'checkout-frontend' });
    await checkoutTag.locator('[part="remove-button"]').click();

    // The checkout-frontend pill should be gone
    await expect(header.getByText('checkout-frontend')).not.toBeVisible();
    // The payment-backend pill should remain
    await expect(header.getByText('payment-backend')).toBeVisible();
  });
});
