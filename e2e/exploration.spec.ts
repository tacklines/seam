import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(__dirname, '..', 'src', 'fixtures');

test.describe('Exploration Phase — Events Card View', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByText('Load files locally').click();

    const fileInput = page.locator('file-drop-zone input[type="file"]');
    await fileInput.setInputFiles(path.join(FIXTURE_DIR, 'checkout-frontend.yaml'));

    // Wait for app layout to render
    await expect(page.locator('.header-title')).toBeVisible({ timeout: 10_000 });
  });

  test('card-view renders event cards after loading a file', async ({ page }) => {
    const cardView = page.locator('card-view');
    await expect(cardView).toBeAttached();

    // The checkout-frontend fixture has 5 events — at least one event card should render
    const eventCards = page.locator('event-card');
    await expect(eventCards.first()).toBeAttached({ timeout: 10_000 });
  });

  test('event cards display event names from the loaded fixture', async ({ page }) => {
    // "CheckoutStarted" is the first event in checkout-frontend.yaml
    // Scope to card-view to avoid strict mode violations from duplicate text in assumptions
    const cardView = page.locator('card-view');
    await expect(cardView.locator('.event-name', { hasText: 'CheckoutStarted' })).toBeVisible({ timeout: 10_000 });
    await expect(cardView.locator('.event-name', { hasText: 'PaymentFormSubmitted' })).toBeVisible();
  });

  test('aggregate nav click filters events to selected aggregate', async ({ page }) => {
    const aggregateNav = page.locator('aggregate-nav');
    await expect(aggregateNav).toBeAttached();

    // Click on "Checkout" aggregate in the nav
    const checkoutEntry = aggregateNav.locator('[role="button"]').filter({ hasText: 'Checkout' });
    await checkoutEntry.first().click();

    // The aggregate nav item should become selected (aria-pressed=true)
    await expect(checkoutEntry.first()).toHaveAttribute('aria-pressed', 'true');
  });

  test('aggregate nav "Show All" button clears the filter', async ({ page }) => {
    const aggregateNav = page.locator('aggregate-nav');

    // First select an aggregate
    const checkoutEntry = aggregateNav.locator('[role="button"]').filter({ hasText: 'Checkout' });
    await checkoutEntry.first().click();
    await expect(checkoutEntry.first()).toHaveAttribute('aria-pressed', 'true');

    // Then click "Show All"
    const showAllButton = aggregateNav.locator('[aria-label*="Show all"]');
    await showAllButton.click();
    await expect(showAllButton).toHaveAttribute('aria-pressed', 'true');
  });

  test('filter-panel component is present in the sidebar', async ({ page }) => {
    const filterPanel = page.locator('filter-panel');
    await expect(filterPanel).toBeAttached();
  });
});

test.describe('Exploration Phase — Flow Diagram', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByText('Load files locally').click();

    const fileInput = page.locator('file-drop-zone input[type="file"]');
    await fileInput.setInputFiles(path.join(FIXTURE_DIR, 'checkout-frontend.yaml'));

    await expect(page.locator('.header-title')).toBeVisible({ timeout: 10_000 });

    // Navigate to Flow tab (scoped to .main to avoid settings-dialog tabs)
    await page.locator('.main sl-tab[panel="flow"]').click();
  });

  test('flow diagram renders after switching to Flow tab', async ({ page }) => {
    const flowDiagram = page.locator('flow-diagram');
    await expect(flowDiagram).toBeAttached();
  });

  test('flow-search component is present in the flow tab', async ({ page }) => {
    const flowSearch = page.locator('flow-search');
    await expect(flowSearch).toBeAttached();
  });

  test('typing in flow search input updates the search query', async ({ page }) => {
    // The flow-search uses sl-input (Shoelace) which wraps a native <input>
    // Playwright pierces shadow DOM so we can target the inner input
    const searchInput = page.locator('flow-search sl-input input[type="search"]');
    await expect(searchInput).toBeAttached({ timeout: 10_000 });

    // Type a search query into the native input
    await searchInput.fill('Checkout');

    // The native input should hold the typed value
    await expect(searchInput).toHaveValue('Checkout');
  });

  test('flow minimap is present in the flow tab', async ({ page }) => {
    const minimap = page.locator('flow-minimap');
    await expect(minimap).toBeAttached();
  });
});
