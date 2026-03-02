import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(__dirname, '..', 'src', 'fixtures');

test.describe('File Loading Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Enter solo mode to get the file drop zone
    await page.getByText('Load files locally').click();
  });

  test('shows the file drop zone in hero mode after entering solo mode', async ({ page }) => {
    const dropZone = page.locator('file-drop-zone[mode="hero"]');
    await expect(dropZone).toBeAttached();

    // Should show instructional text
    await expect(page.getByText('Drop storm-prep YAML files here')).toBeVisible();
  });

  test('loads a single YAML fixture file and shows the app layout', async ({ page }) => {
    // The file-drop-zone has a hidden file input inside its shadow DOM
    const fileInput = page.locator('file-drop-zone input[type="file"]');
    await fileInput.setInputFiles(path.join(FIXTURE_DIR, 'checkout-frontend.yaml'));

    // After loading, the app should transition to the main layout
    // The header title "Storm-Prep" should appear (use exact match to avoid ambiguity)
    const headerTitle = page.locator('.header-title');
    await expect(headerTitle).toBeVisible({ timeout: 10_000 });

    // The loaded file should appear as a tag/pill in the header
    // Use the header region to scope the search and avoid duplicates in sidebar/panels
    const header = page.locator('.header');
    await expect(header.getByText('checkout-frontend')).toBeVisible();
  });

  test('loads multiple YAML fixture files', async ({ page }) => {
    const fileInput = page.locator('file-drop-zone input[type="file"]');
    await fileInput.setInputFiles([
      path.join(FIXTURE_DIR, 'checkout-frontend.yaml'),
      path.join(FIXTURE_DIR, 'payment-backend.yaml'),
    ]);

    // Both file roles should appear in the header pill area
    const header = page.locator('.header');
    await expect(header.getByText('checkout-frontend')).toBeVisible({ timeout: 10_000 });
    await expect(header.getByText('payment-backend')).toBeVisible();
  });
});

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByText('Load files locally').click();

    // Load a fixture file to get into the main app
    const fileInput = page.locator('file-drop-zone input[type="file"]');
    await fileInput.setInputFiles(path.join(FIXTURE_DIR, 'checkout-frontend.yaml'));

    // Wait for the app layout to render
    const headerTitle = page.locator('.header-title');
    await expect(headerTitle).toBeVisible({ timeout: 10_000 });
  });

  test('shows Events tab as default active view', async ({ page }) => {
    const eventsTab = page.locator('sl-tab[panel="cards"]');
    await expect(eventsTab).toBeAttached();
  });

  test('can switch to Flow tab', async ({ page }) => {
    await page.locator('sl-tab[panel="flow"]').click();

    // Flow diagram should be present
    const flowDiagram = page.locator('flow-diagram');
    await expect(flowDiagram).toBeAttached();
  });

  test('Conflicts tab is disabled with only one file', async ({ page }) => {
    // Scope to .main to avoid the settings-dialog's comparison tab
    const conflictsTab = page.locator('.main sl-tab[panel="comparison"]');
    await expect(conflictsTab).toHaveAttribute('disabled', '');
  });
});
