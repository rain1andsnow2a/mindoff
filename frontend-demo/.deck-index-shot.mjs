// deck 聚合页验证截图（临时脚本）：概览 + 演示模式翻两页
const { chromium } = await import('playwright');
const EXE = 'C:/Users/HUAWEI/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe';
const ROOT = 'd:/bigproject/AdventureX/design-demos/morning-deck';
const b = await chromium.launch({ executablePath: EXE });
const pg = await b.newPage({ viewport: { width: 1920, height: 1080 } });
await pg.goto(`file:///${ROOT}/index.html?ov=grid`);
await pg.waitForTimeout(2500);
await pg.screenshot({ path: `${ROOT}/shots/_index-overview.png` });
console.log('shot _index-overview');
await pg.goto(`file:///${ROOT}/index.html#6`);
await pg.waitForTimeout(2000);
await pg.screenshot({ path: `${ROOT}/shots/_index-present.png` });
console.log('shot _index-present');
await b.close();
