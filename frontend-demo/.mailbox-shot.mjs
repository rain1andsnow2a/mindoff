// 信箱/回执改动验收截图（临时脚本）：DAY-232/233/234/235
// 视口：390x844（手机）、1440x900（桌面）。dev bypass 下接口 401，区块为空态。
const { chromium } = await import('playwright');
const EXE = 'C:/Users/HUAWEI/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe';
const BASE = 'http://localhost:8094';
const OUT = 'd:/bigproject/AdventureX/design-demos/scene-create/shots';

const b = await chromium.launch({ executablePath: EXE });

async function shot(name, { width, height }, url, actions) {
  const pg = await b.newPage({ viewport: { width, height } });
  pg.on('pageerror', (e) => console.log(`[pageerror ${name}]`, String(e).slice(0, 200)));
  await pg.goto(url, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await pg.waitForTimeout(3500);
  if (actions) await actions(pg);
  await pg.screenshot({ path: `${OUT}/${name}.png` });
  console.log('shot', name);
  await pg.close();
}

const MB = `${BASE}/?screen=mailbox`;
const RC = `${BASE}/?screen=receipt`;

// 手机 390x844
await shot('impl-mailbox-mobile-tabs', { width: 390, height: 844 }, MB);
await shot('impl-mailbox-mobile-ideas', { width: 390, height: 844 }, MB, async (pg) => {
  await pg.click('text=灵感收藏', { timeout: 8000 }).catch((e) => console.log('click 灵感收藏 fail', String(e).slice(0, 120)));
  await pg.waitForTimeout(1200);
});
await shot('impl-mailbox-mobile-today', { width: 390, height: 844 }, MB, async (pg) => {
  await pg.click('text=今日待启', { timeout: 8000 }).catch((e) => console.log('click 今日待启 fail', String(e).slice(0, 120)));
  await pg.waitForTimeout(1200);
});
await shot('impl-receipt-mobile', { width: 390, height: 844 }, RC);

// 桌面 1440x900
await shot('impl-mailbox-desktop-tabs', { width: 1440, height: 900 }, MB);
await shot('impl-mailbox-desktop-ideas', { width: 1440, height: 900 }, MB, async (pg) => {
  await pg.click('text=灵感收藏', { timeout: 8000 }).catch((e) => console.log('click 灵感收藏 fail', String(e).slice(0, 120)));
  await pg.waitForTimeout(1200);
});
await shot('impl-receipt-desktop', { width: 1440, height: 900 }, RC);

await b.close();
console.log('all done');
