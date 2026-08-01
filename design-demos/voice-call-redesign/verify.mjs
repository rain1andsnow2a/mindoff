/**
 * 验收 VoiceCall 字幕通话版：390×844 手机视口 + 1440×900 桌面视口，日/夜各一张。
 * web 下 isPcmAvailable=false，会走「实时通话需在真机上使用」分支——
 * 正好能验静默态、空字幕态与底部工具条的排版。
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:8093/?screen=voice-call';
const b = await chromium.launch();

const shots = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
];

const errors = [];
for (const s of shots) {
  const pg = await b.newPage({
    viewport: { width: s.width, height: s.height },
    deviceScaleFactor: 2,
  });
  pg.on('pageerror', (e) => errors.push(`[${s.name}] ${e}`));
  pg.on('console', (m) => {
    if (m.type() === 'error') errors.push(`[${s.name}] console: ${m.text()}`);
  });

  await pg.goto(BASE, { waitUntil: 'load', timeout: 120000 });
  // 首次 Metro 打包较慢，等到界面真的出字再截
  await pg.waitForTimeout(s.name === 'phone' ? 20000 : 6000);
  await pg.screenshot({ path: `verify-${s.name}.png` });
  console.log('shot', `verify-${s.name}.png`);

  const text = await pg.locator('body').innerText();
  console.log(`--- [${s.name}] 页面文字 ---\n${text.slice(0, 400)}\n`);
  await pg.close();
}

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await b.close();
