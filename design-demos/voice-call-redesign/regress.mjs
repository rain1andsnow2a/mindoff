/**
 * 回归验收（补丁已移除后的真实代码）：
 *  1. 「实时通话需在真机上使用」只出现一次，不再上下重复
 *  2. error 态不显示通话计时
 *  3. 两个视口都不溢出、挂断可达
 */
import { chromium } from 'playwright';

const b = await chromium.launch();
for (const vp of [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
]) {
  const pg = await b.newPage({ viewport: vp, deviceScaleFactor: 2 });
  const errors = [];
  pg.on('pageerror', (e) => errors.push(String(e)));
  pg.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await pg.goto('http://localhost:8093/?screen=voice-call', {
    waitUntil: 'load', timeout: 120000,
  });
  await pg.waitForTimeout(vp.name === 'phone' ? 15000 : 6000);
  await pg.screenshot({ path: `regress-${vp.name}.png` });

  const r = await pg.evaluate((h) => {
    const body = document.body.innerText;
    const needle = '实时通话需在真机上使用';
    const count = body.split(needle).length - 1;
    const hang = document.querySelector('[aria-label="挂断通话"]');
    const hr = hang && hang.getBoundingClientRect();
    return {
      deviceHintCount: count,
      showsTimerOnError: /\d\d:\d\d/.test(body),
      docHeight: document.documentElement.scrollHeight,
      overflows: document.documentElement.scrollHeight > h + 1,
      hangupInside: hr ? hr.bottom <= h + 1 && hr.top >= 0 : null,
      bodyText: body.slice(0, 220),
    };
  }, vp.height);

  console.log(`\n=== ${vp.name} ${vp.width}x${vp.height} ===`);
  console.log(JSON.stringify(r, null, 2));
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
  await pg.close();
}
await b.close();
