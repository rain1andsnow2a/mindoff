// 历史会话功能截图验证（临时脚本，用完删）
const { chromium } = await import('playwright');
const EXE = 'C:/Users/HUAWEI/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe';
const TOKENS = {
  access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyNiIsInR5cGUiOiJhY2Nlc3MiLCJpYXQiOjE3ODQ5NjI4NjIsImV4cCI6MTc4NTU2NzY2Mn0.vcmWG9zqJ3mHLLuZzwk5xWlzWC-CLMs9pG3noOg5FX8',
  refresh_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyNiIsInR5cGUiOiJyZWZyZXNoIiwiaWF0IjoxNzg0OTYyODYyLCJleHAiOjE3ODc1NTQ4NjJ9.8gMv6wxu9es1C_qK3ngd5F7gNcOzo95zIqEQ3TFSKtk',
  token_type: 'bearer',
};
const BASE = 'http://localhost:8081';
const OUT = 'd:/bigproject/AdventureX/frontend-demo/design-demos/verify';

const b = await chromium.launch({ executablePath: EXE });

async function shoot(name, width, height) {
  const ctx = await b.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
  const pg = await ctx.newPage();
  await pg.addInitScript((t) => localStorage.setItem('mindoff.tokens', JSON.stringify(t)), TOKENS);
  pg.on('pageerror', (e) => console.log(`[${name}] pageerror:`, String(e).slice(0, 300)));
  await pg.goto(BASE, { waitUntil: 'domcontentloaded' });
  await pg.waitForSelector('text=米露', { timeout: 240000 });
  await pg.waitForTimeout(6000); // 等 home/会话接口回来
  await pg.screenshot({ path: `${OUT}/${name}-1-home.png` });
  console.log(`[${name}] home ok`);
  await pg.getByText('往日', { exact: false }).first().click({ timeout: 15000 });
  await pg.waitForTimeout(2000);
  await pg.screenshot({ path: `${OUT}/${name}-2-journal.png` });
  console.log(`[${name}] journal ok`);
  await pg.getByText('搬完家的第一晚', { exact: false }).first().click({ timeout: 15000 });
  await pg.waitForTimeout(3000);
  await pg.screenshot({ path: `${OUT}/${name}-3-chat.png` });
  console.log(`[${name}] chat ok`);
  await ctx.close();
}

await shoot('mobile', 390, 844);
await shoot('desktop', 1440, 900);
await b.close();
console.log('all done');
