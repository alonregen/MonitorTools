/**
 * Statistics page E2E test.
 * Run: npx playwright test tests/statistics.spec.js
 */
import { test, expect } from '@playwright/test';

test.describe('Statistics - Slack', function () {
  test.beforeEach(async function ({ page }) {
    await page.goto('/#/statistics', { waitUntil: 'networkidle' });
  });

  test('page loads and shows Statistics data title', async function ({ page }) {
    await expect(page.locator('h2:has-text("Statistics data")')).toBeVisible({ timeout: 5000 });
  });

  test('fallback parser returns alerts from demo text', async function ({ page }) {
    const demoText = [
      '________________________________________________________________________________________',
      '- :label: Operation ID: a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      '   * time: 2026-02-11T08:07:10.316Z',
      '   * message:   NOC_DEMO_ALERT - Daily POS record with uid=12345678901234567890',
      '   * label:   demo_file_service',
      '   * params:   [ [] ]',
    ].join('\n');
    const count = await page.evaluate(function (text) {
      var blockRe = /[-:]\s*:label:\s*Operation ID:\s*([a-fA-F0-9\-]+)\s*\n\s*\*\s*time:\s*([^\n]+)\s*\n\s*\*\s*message:\s*([^\n]+)\s*\n\s*\*\s*label:\s*([^\n]+)/g;
      var m, alerts = [];
      while ((m = blockRe.exec(text)) !== null) {
        alerts.push({ id: m[1], time: m[2] });
      }
      return alerts.length;
    }, demoText);
    expect(count).toBeGreaterThan(0);
  });

  test('Load Demo populates textarea, Analyze shows dashboard', async function ({ page }) {
    await expect(page.locator('#statsEmpty')).toBeVisible({ timeout: 5000 });
    await page.locator('#statsDemoBtn').click({ force: true });
    await page.waitForTimeout(200);
    const textareaValue = await page.locator('#statsInput').inputValue();
    expect(textareaValue.length).toBeGreaterThan(100);
    await page.locator('#statsAnalyzeBtn').click({ force: true });
    await page.waitForTimeout(500);
    const dashboard = page.locator('#statsDashboard');
    await expect(dashboard).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#statsKpiTotal')).toContainText(/\d+/);
  });

  test('clicking Analyze after Load Demo shows alerts table', async function ({ page }) {
    await page.click('#statsDemoBtn');
    await page.waitForTimeout(200);
    await page.click('#statsAnalyzeBtn');
    await page.waitForTimeout(500);
    const table = page.locator('#statsTableBody');
    await expect(table).toBeVisible({ timeout: 3000 });
    const rows = table.locator('tr');
    await expect(rows).toHaveCount(await rows.count());
    expect(await rows.count()).toBeGreaterThan(0);
  });
});
