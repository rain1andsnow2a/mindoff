/** 接通中态验收：确认未接通时呼吸印记居中、提示文案在位、挂断仍可达。 */
import { chromium } from 'playwright';

const b = await chromium.launch();
const pg = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
pg.on('pageerror', (e) => errors.push(String(e)));
pg.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await pg.goto('http://localhost:8093/?screen=voice-call&mock=connecting', {
  waitUntil: 'load', timeout: 120000,
});
await pg.waitForTimeout(16000);
await pg.screenshot({ path: 'verify-connecting.png' });
console.log('shot verify-connecting.png');

const report = await pg.evaluate(() => {
  const body = document.body.innerText;
  // 波纹应当静默（muted），条高统一为基线
  const bars = [...document.querySelectorAll('div')]
    .filter((d) => {
      const r = d.getBoundingClientRect();
      return Math.round(r.width) === 3 || (r.width > 2 && r.width < 3.5 && r.height <= 20);
    })
    .map((d) => Math.round(d.getBoundingClientRect().height));
  const hang = document.querySelector('[aria-label="挂断通话"]');
  const hr = hang && hang.getBoundingClientRect();
  return {
    hasConnectingCopy: body.includes('正在接通'),
    hasHintCopy: body.includes('我会在停顿时回应'),
    // 接通中不应显示计时
    showsTimer: /\d\d:\d\d/.test(body),
    waveBarHeights: bars,
    hangupInside: hr ? hr.bottom <= 844 && hr.top >= 0 : null,
    docHeight: document.documentElement.scrollHeight,
    bodyText: body.slice(0, 200),
  };
});
console.log(JSON.stringify(report, null, 2));
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await b.close();
