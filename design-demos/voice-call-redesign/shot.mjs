/** 三方案原型截图：默认态全景 + 四个状态各截一次（只截手机区域）。 */
import { chromium } from 'playwright';

const URL = 'file:///D:/bigproject/AdventureX/design-demos/voice-call-redesign/index.html';
const b = await chromium.launch();
const pg = await b.newPage({
  viewport: { width: 1320, height: 1240 },
  deviceScaleFactor: 2,
});

const errors = [];
pg.on('pageerror', (e) => errors.push(String(e)));
pg.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await pg.goto(URL);
await pg.waitForTimeout(2200);
await pg.screenshot({ path: 'overview.png', fullPage: true });
console.log('shot overview.png');

// 逐个状态切换后截手机区域：验证交互真的能点
const states = ['接通中', '在听', '你在说', '在想'];
for (const label of states) {
  for (let col = 0; col < 3; col++) {
    const btns = pg.locator('.col').nth(col).locator('.states button', { hasText: label });
    await btns.first().click();
  }
  await pg.waitForTimeout(900);
  const file = `state-${states.indexOf(label)}-${label}.png`;
  await pg.locator('.grid').screenshot({ path: file });
  console.log('shot', file);
}

console.log(errors.length ? 'PAGE ERRORS:\n' + errors.join('\n') : 'no page errors');
await b.close();
