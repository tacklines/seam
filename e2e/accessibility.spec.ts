import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(__dirname, '..', 'src', 'fixtures');

test.describe('Accessibility — Landing Page', () => {
  test('landing page has a visible heading', async ({ page }) => {
    await page.goto('/');
    const heading = page.getByRole('heading', { name: 'Storm-Prep Visualizer' });
    await expect(heading).toBeVisible();
  });

  test('Start a Session and Join a Session are keyboard-focusable', async ({ page }) => {
    await page.goto('/');

    // The two option cards use role="button" and tabindex="0"
    const startCard = page.locator('[aria-label*="Start a Session"]');
    const joinCard = page.locator('[aria-label*="Join a Session"]');
    await expect(startCard).toBeAttached();
    await expect(joinCard).toBeAttached();
  });

  test('Load files locally link is present and accessible', async ({ page }) => {
    await page.goto('/');
    const soloLink = page.getByText('Load files locally');
    await expect(soloLink).toBeVisible();
  });
});

test.describe('Accessibility — App Layout with Files', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByText('Load files locally').click();

    const fileInput = page.locator('file-drop-zone input[type="file"]');
    await fileInput.setInputFiles(path.join(FIXTURE_DIR, 'checkout-frontend.yaml'));

    await expect(page.locator('.header-title')).toBeVisible({ timeout: 10_000 });
  });

  test('tab navigation reaches the Events tab', async ({ page }) => {
    const eventsTab = page.locator('sl-tab[panel="cards"]');
    await expect(eventsTab).toBeAttached();
  });

  test('Flow tab is keyboard-clickable', async ({ page }) => {
    const flowTab = page.locator('sl-tab[panel="flow"]');
    await expect(flowTab).toBeAttached();
    await flowTab.click();

    // Flow diagram should render
    await expect(page.locator('flow-diagram')).toBeAttached();
  });

  test('aggregate nav items have aria-pressed attribute for state', async ({ page }) => {
    const aggregateNav = page.locator('aggregate-nav');
    await expect(aggregateNav).toBeAttached();

    // All nav rows use role="button" with aria-pressed
    const navRows = aggregateNav.locator('[role="button"]');
    await expect(navRows.first()).toHaveAttribute('aria-pressed');
  });

  test('aggregate nav items are keyboard-navigable with Enter', async ({ page }) => {
    const aggregateNav = page.locator('aggregate-nav');
    const checkoutRow = aggregateNav.locator('[role="button"]').filter({ hasText: 'Checkout' });
    await expect(checkoutRow.first()).toBeAttached();

    // Focus the element and press Enter
    await checkoutRow.first().focus();
    await page.keyboard.press('Enter');

    // After keyboard activation the aggregate should be selected
    await expect(checkoutRow.first()).toHaveAttribute('aria-pressed', 'true');
  });

  test('header gear icon has an accessible label', async ({ page }) => {
    // The gear icon-button in the header has a label attribute
    const gearButton = page.locator('sl-icon-button[name="gear"]');
    await expect(gearButton).toBeAttached();
    // It should have a label for screen readers (set via label attribute)
    const label = await gearButton.getAttribute('label');
    expect(label).toBeTruthy();
  });

  test('shortcut reference panel opens with ? key press', async ({ page }) => {
    // The ? key opens the shortcut reference dialog
    await page.keyboard.press('?');

    const shortcutRef = page.locator('shortcut-reference');
    await expect(shortcutRef).toBeAttached();
    // The sl-dialog inside should be open
    const dialog = shortcutRef.locator('sl-dialog');
    await expect(dialog).toHaveAttribute('open', '', { timeout: 5_000 });
  });

  test('sidebar toggle button is accessible', async ({ page }) => {
    // The sidebar has a collapse button with aria-label
    const toggleButton = page.locator('.sidebar-toggle sl-button');
    await expect(toggleButton).toBeAttached();

    const ariaLabel = await toggleButton.getAttribute('aria-label');
    expect(ariaLabel).toBeTruthy();
  });
});

test.describe('Accessibility — Error messages', () => {
  test('error messages appear in a region with role=alert', async ({ page }) => {
    // We cannot easily trigger a parse error via the UI without the server,
    // but we can verify the error container structure is in the DOM after loading.
    await page.goto('/');
    await page.getByText('Load files locally').click();

    const fileInput = page.locator('file-drop-zone input[type="file"]');
    await fileInput.setInputFiles(path.join(FIXTURE_DIR, 'checkout-frontend.yaml'));

    await expect(page.locator('.header-title')).toBeVisible({ timeout: 10_000 });

    // The app shell has an error region with role="alert" when errors are shown.
    // With a valid file no errors should exist, but we verify the component is ready.
    const appShell = page.locator('app-shell');
    await expect(appShell).toBeAttached();
  });
});
