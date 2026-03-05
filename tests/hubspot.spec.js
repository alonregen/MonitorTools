/**
 * HubSpot Statistics page E2E test.
 */
import { test, expect } from '@playwright/test';

test.describe('Statistics - Hubspot', function () {
  test.beforeEach(async function ({ page }) {
    await page.goto('/#/statistics-hubspot', { waitUntil: 'networkidle' });
  });

  test('Load Demo populates textarea, Analyze shows dashboard', async function ({ page }) {
    await expect(page.locator('#hubspotEmpty')).toBeVisible({ timeout: 5000 });
    await page.locator('#hubspotDemoBtn').click({ force: true });
    await page.waitForTimeout(200);
    const textareaValue = await page.locator('#hubspotInput').inputValue();
    expect(textareaValue.length).toBeGreaterThan(100);
    await page.locator('#hubspotAnalyzeBtn').click({ force: true });
    await page.waitForTimeout(500);
    const dashboard = page.locator('#hubspotDashboard');
    await expect(dashboard).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#hubspotKpiTotal')).toContainText(/\d+/);
  });
});
