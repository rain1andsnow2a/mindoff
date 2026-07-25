// deck 单页截图（临时脚本）
const { chromium } = await import('playwright');
const EXE = 'C:/Users/HUAWEI/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe';
const ROOT = 'd:/bigproject/AdventureX/design-demos/morning-deck';
const pages = process.argv[2] ? process.argv[2].split(',') : ['01-cover', '04-companion'];
const b = await chromium.launch({ executablePath: EXE });
const pg = await b.newPage({ viewport: { width: 1920, height: 1080 } });
for (const name of pages) {
  await pg.goto(`file:///${ROOT}/slides/${name}.html`);
  await pg.waitForTimeout(1200);
  await pg.screenshot({ path: `${ROOT}/shots/${name}.png` });
  console.log('shot', name);
}
await b.close();
