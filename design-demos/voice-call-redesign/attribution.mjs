/** 归因：那个横向溢出层是否在别的屏也存在？若存在＝原有背景层，与本次改动无关。 */
import { chromium } from 'playwright';

const b = await chromium.launch();
for (const screen of ['voice-call', 'companion']) {
  const pg = await b.newPage({ viewport: { width: 390, height: 844 } });
  await pg.goto(`http://localhost:8093/?screen=${screen}`, {
    waitUntil: 'load', timeout: 120000,
  });
  await pg.waitForTimeout(screen === 'voice-call' ? 14000 : 6000);
  const n = await pg.evaluate(() =>
    [...document.querySelectorAll('div,span')].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1);
    }).length,
  );
  console.log(`${screen}: 横向溢出元素 ${n} 个`);
  await pg.close();
}
await b.close();
