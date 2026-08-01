/** 信箱重构三方案截图：全景 + 每个方案的交互状态。 */
import { chromium } from 'playwright';

const URL = 'file:///D:/bigproject/AdventureX/design-demos/mailbox-redesign/index.html';
const b = await chromium.launch();
const pg = await b.newPage({ viewport: { width: 1280, height: 1200 }, deviceScaleFactor: 2 });
const errors = [];
pg.on('pageerror', (e) => errors.push(String(e)));
pg.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await pg.goto(URL);
await pg.waitForTimeout(2200);
await pg.screenshot({ path: '../mailbox-redesign/overview.png', fullPage: true });
console.log('shot overview');

// 方案 A：切到思绪
await pg.locator('.col').nth(0).getByText('我的思绪').first().click();
await pg.waitForTimeout(600);
await pg.locator('.grid').screenshot({ path: '../mailbox-redesign/state-a-thought.png' });
console.log('shot a-thought');

// 方案 B：切到思绪
await pg.locator('.col').nth(1).getByText('思绪').first().click();
await pg.waitForTimeout(600);
await pg.locator('.grid').screenshot({ path: '../mailbox-redesign/state-b-thought.png' });
console.log('shot b-thought');

// 方案 C：展开思绪抽屉
await pg.locator('.col').nth(2).getByText('昨夜收进 3 条').first().click();
await pg.waitForTimeout(700);
await pg.locator('.grid').screenshot({ path: '../mailbox-redesign/state-c-drawer.png' });
console.log('shot c-drawer');

console.log(errors.length ? 'PAGE ERRORS:\n' + errors.join('\n') : 'no page errors');
await b.close();
