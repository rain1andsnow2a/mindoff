/* 滚动到每个区块逐屏截图 + 收集控制台错误。仅本地验证用,不参与部署。 */
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://localhost:4173/';
const OUT = process.argv[3] || 'shots';
const SECTIONS = ['hero', 'dump', 'memory', 'desk', 'theater', 'download'];

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  for (const [name, vp] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
    const page = await browser.newPage({ viewport: vp });
    page.on('pageerror', (e) => errors.push(`[${name}] pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${name}] console: ${m.text()}`); });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    for (const id of SECTIONS) {
      await page.evaluate((sid) => {
        document.getElementById(sid)?.scrollIntoView({ block: sid === 'hero' ? 'start' : 'center' });
      }, id);
      await page.waitForTimeout(1300);
      await page.screenshot({ path: `${OUT}/${name}-${id}.png` });
    }
    await page.close();
  }
  await browser.close();
  console.log(errors.length ? errors.join('\n') : 'NO_CONSOLE_ERRORS');
})();
