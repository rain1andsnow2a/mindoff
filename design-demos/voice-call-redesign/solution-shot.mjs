/** 思绪中枢方案截图：全景 + 各屏交互。 */
import { chromium } from 'playwright';

const URL = 'file:///D:/bigproject/AdventureX/design-demos/mailbox-redesign/solution.html';
const b = await chromium.launch();
const pg = await b.newPage({ viewport: { width: 1360, height: 1250 }, deviceScaleFactor: 2 });
const errors = [];
pg.on('pageerror', (e) => errors.push(String(e)));
pg.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await pg.goto(URL);
await pg.waitForTimeout(2200);
await pg.screenshot({ path: '../mailbox-redesign/solution-overview.png', fullPage: true });
console.log('shot solution-overview');

// 屏2 切「场景」筛选
await pg.locator('.col').nth(1).getByText('场景').first().click();
await pg.waitForTimeout(500);
await pg.locator('.grid').screenshot({ path: '../mailbox-redesign/solution-thought-scene.png' });
console.log('shot thought-scene');

// 屏3 拆信
await pg.locator('.col').nth(2).locator('.envelope').first().click();
await pg.waitForTimeout(500);
await pg.locator('.grid').screenshot({ path: '../mailbox-redesign/solution-letter-open.png' });
console.log('shot letter-open');

// 屏4 撤销
await pg.locator('.col').nth(3).getByText('这条不要，撤销归档').first().click();
await pg.waitForTimeout(400);
await pg.locator('.grid').screenshot({ path: '../mailbox-redesign/solution-idea-undo.png' });
console.log('shot idea-undo');

console.log(errors.length ? 'PAGE ERRORS:\n' + errors.join('\n') : 'no page errors');
await b.close();
