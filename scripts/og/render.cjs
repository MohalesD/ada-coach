// Renders scripts/og/og-image.html to public/og-image.png at 1200x630.
// Run: node scripts/og/render.cjs  (needs Playwright's Chromium, and `npm ci` for the fonts)
const { chromium } = require('playwright');
const path = require('node:path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.goto('file://' + path.join(__dirname, 'og-image.html'));
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(__dirname, '../../public/og-image.png') });
  await browser.close();
})();
