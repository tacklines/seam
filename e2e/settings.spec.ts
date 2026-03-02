import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(__dirname, '..', 'src', 'fixtures');

/**
 * The settings-dialog is opened via the gear icon in the app header.
 * It is only present once files are loaded (the app layout is rendered).
 */
test.describe('Settings Dialog', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByText('Load files locally').click();

    const fileInput = page.locator('file-drop-zone input[type="file"]');
    await fileInput.setInputFiles(path.join(FIXTURE_DIR, 'checkout-frontend.yaml'));

    await expect(page.locator('.header-title')).toBeVisible({ timeout: 10_000 });
  });

  test('settings-dialog component is present in the DOM', async ({ page }) => {
    const settingsDialog = page.locator('settings-dialog');
    await expect(settingsDialog).toBeAttached();
  });

  test('gear icon button opens the settings dialog', async ({ page }) => {
    // Click the gear icon in the header
    await page.locator('sl-icon-button[name="gear"]').click();

    const settingsDialog = page.locator('settings-dialog');
    // The sl-dialog inside should become open
    const dialog = settingsDialog.locator('sl-dialog');
    await expect(dialog).toHaveAttribute('open', '', { timeout: 5_000 });
  });

  test('settings dialog shows all expected tabs', async ({ page }) => {
    await page.locator('sl-icon-button[name="gear"]').click();

    const settingsDialog = page.locator('settings-dialog');
    await expect(settingsDialog.locator('sl-dialog')).toHaveAttribute('open', '', { timeout: 5_000 });

    // Verify all 7 tabs are present
    await expect(settingsDialog.locator('sl-tab[panel="session"]')).toBeAttached();
    await expect(settingsDialog.locator('sl-tab[panel="artifacts"]')).toBeAttached();
    await expect(settingsDialog.locator('sl-tab[panel="comparison"]')).toBeAttached();
    await expect(settingsDialog.locator('sl-tab[panel="contracts"]')).toBeAttached();
    await expect(settingsDialog.locator('sl-tab[panel="notifications"]')).toBeAttached();
    await expect(settingsDialog.locator('sl-tab[panel="delegation"]')).toBeAttached();
    await expect(settingsDialog.locator('sl-tab[panel="shortcuts"]')).toBeAttached();
  });

  test('settings dialog Session tab shows session settings controls', async ({ page }) => {
    await page.locator('sl-icon-button[name="gear"]').click();

    const settingsDialog = page.locator('settings-dialog');
    await expect(settingsDialog.locator('sl-dialog')).toHaveAttribute('open', '', { timeout: 5_000 });

    // The session tab panel should contain setting rows
    const sessionPanel = settingsDialog.locator('sl-tab-panel[name="session"]');
    await expect(sessionPanel).toBeAttached();

    // There should be at least one setting row
    const settingRows = sessionPanel.locator('.setting-row');
    await expect(settingRows.first()).toBeAttached({ timeout: 5_000 });
  });

  test('settings dialog can switch to Artifacts tab', async ({ page }) => {
    await page.locator('sl-icon-button[name="gear"]').click();

    const settingsDialog = page.locator('settings-dialog');
    await expect(settingsDialog.locator('sl-dialog')).toHaveAttribute('open', '', { timeout: 5_000 });

    // Click on the Artifacts tab
    await settingsDialog.locator('sl-tab[panel="artifacts"]').click();

    // The artifacts panel should now be active / visible
    const artifactsPanel = settingsDialog.locator('sl-tab-panel[name="artifacts"]');
    await expect(artifactsPanel).toBeAttached();
  });

  test('settings dialog can switch to Shortcuts tab', async ({ page }) => {
    await page.locator('sl-icon-button[name="gear"]').click();

    const settingsDialog = page.locator('settings-dialog');
    await expect(settingsDialog.locator('sl-dialog')).toHaveAttribute('open', '', { timeout: 5_000 });

    await settingsDialog.locator('sl-tab[panel="shortcuts"]').click();

    // The shortcuts tab panel should contain a shortcuts table
    const shortcutsPanel = settingsDialog.locator('sl-tab-panel[name="shortcuts"]');
    await expect(shortcutsPanel).toBeAttached();
    const table = shortcutsPanel.locator('table.shortcuts-table');
    await expect(table).toBeAttached({ timeout: 5_000 });
  });

  test('settings dialog can be closed with the close button', async ({ page }) => {
    await page.locator('sl-icon-button[name="gear"]').click();

    const settingsDialog = page.locator('settings-dialog');
    const dialog = settingsDialog.locator('sl-dialog');
    await expect(dialog).toHaveAttribute('open', '', { timeout: 5_000 });

    // Close using the Shoelace dialog header close button ([part="close-button"])
    await dialog.locator('[part="close-button"]').click();

    // Wait for the sl-dialog `open` attribute to be removed
    await expect(dialog).not.toHaveAttribute('open', { timeout: 8_000 });
  });

  test('modified setting shows a blue dot indicator', async ({ page }) => {
    await page.locator('sl-icon-button[name="gear"]').click();

    const settingsDialog = page.locator('settings-dialog');
    await expect(settingsDialog.locator('sl-dialog')).toHaveAttribute('open', '', { timeout: 5_000 });

    // Find an sl-switch in the session or artifacts panel and toggle it
    // Then a .modified-dot should appear next to the changed setting
    const sessionPanel = settingsDialog.locator('sl-tab-panel[name="session"]');
    await expect(sessionPanel).toBeAttached();

    // Navigate to artifacts tab which has a switch (autoValidate)
    await settingsDialog.locator('sl-tab[panel="artifacts"]').click();

    // Wait for the artifacts panel content
    const artifactsPanel = settingsDialog.locator('sl-tab-panel[name="artifacts"]');
    const autoValidateSwitch = artifactsPanel.locator('sl-switch');
    await expect(autoValidateSwitch.first()).toBeAttached({ timeout: 5_000 });

    // Click the switch to toggle it from its default value
    await autoValidateSwitch.first().click();

    // A blue dot (modified-dot) should now appear for the changed setting
    const modifiedDot = artifactsPanel.locator('.modified-dot');
    await expect(modifiedDot.first()).toBeVisible({ timeout: 3_000 });
  });
});

test.describe('Shortcut Reference Panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByText('Load files locally').click();

    const fileInput = page.locator('file-drop-zone input[type="file"]');
    await fileInput.setInputFiles(path.join(FIXTURE_DIR, 'checkout-frontend.yaml'));

    await expect(page.locator('.header-title')).toBeVisible({ timeout: 10_000 });
  });

  test('? key opens the shortcut reference dialog', async ({ page }) => {
    await page.keyboard.press('?');

    const shortcutRef = page.locator('shortcut-reference');
    const dialog = shortcutRef.locator('sl-dialog');
    await expect(dialog).toHaveAttribute('open', '', { timeout: 5_000 });
  });

  test('shortcut reference dialog lists keyboard shortcuts', async ({ page }) => {
    await page.keyboard.press('?');

    const shortcutRef = page.locator('shortcut-reference');
    await expect(shortcutRef.locator('sl-dialog')).toHaveAttribute('open', '', { timeout: 5_000 });

    // Shortcuts are rendered as kbd elements
    const kbdElements = shortcutRef.locator('kbd');
    await expect(kbdElements.first()).toBeVisible({ timeout: 5_000 });
  });

  test('shortcut reference dialog has a Reset Defaults button', async ({ page }) => {
    await page.keyboard.press('?');

    const shortcutRef = page.locator('shortcut-reference');
    await expect(shortcutRef.locator('sl-dialog')).toHaveAttribute('open', '', { timeout: 5_000 });

    // Footer contains a "Reset defaults" button
    const resetButton = shortcutRef.locator('.footer sl-button');
    await expect(resetButton).toBeAttached({ timeout: 5_000 });
  });
});
