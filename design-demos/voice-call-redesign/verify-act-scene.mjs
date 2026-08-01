/**
 * 片场剧场化改造验收：
 *  - 片场主屏（入口剧场化）
 *  - 点「点一下，开始讲」→ 第一幕 · 讲述
 *  - 点「讲完了」→ 第二幕 · 回顾
 *  - 返回主屏 → 点内置场景卡 → 第三幕 · 定妆
 *  手机 390×844 + 桌面 1440×900；捕获页面错误。
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:8094/?screen=scene';
const b = await chromium.launch();

async function shot(pg, name) {
  await pg.screenshot({ path: `${name}.png`, fullPage: true });
  console.log('shot', `${name}.png`);
}

for (const vp of [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
]) {
  const pg = await b.newPage({ viewport: vp, deviceScaleFactor: 2 });
  const errors = [];
  pg.on('pageerror', (e) => errors.push(`[${vp.name}] ${e}`));
  pg.on('console', (m) => { if (m.type() === 'error') errors.push(`[${vp.name}] console: ${m.text()}`); });

  await pg.goto(BASE, { waitUntil: 'load', timeout: 120000 });
  await pg.waitForTimeout(vp.name === 'phone' ? 18000 : 6000);
  await shot(pg, `scene-${vp.name}-1-main`);

  // 第一幕 · 讲述：点「点一下，开始讲」（CreateSceneEntry 的麦克风/输入卡）
  const start = pg.getByText("点一下，开始讲").first();
  await start.scrollIntoViewIfNeeded();
  await pg.waitForTimeout(300);
  await start.click({ force: true });
  await pg.waitForTimeout(2500);
  await shot(pg, `scene-${vp.name}-2-act1`);

  // 第二幕 · 回顾：点「讲完了」→ 真实调后端整理（可能 loading / 失败 / 成功）
  const done = pg.getByText("讲完了").first();
  await done.scrollIntoViewIfNeeded();
  await done.click({ force: true });
  await pg.waitForTimeout(4000);
  await shot(pg, `scene-${vp.name}-3-act2`);

  // 返回主屏，再进第三幕 · 定妆
  const back = pg.getByLabel('返回').first();
  await back.click({ force: true });  // reviewing -> capturing
  await pg.waitForTimeout(600);
  await back.click({ force: true });  // capturing -> browsing
  await pg.waitForTimeout(800);

  const enter = pg.getByText('进入场景').first();
  if (await enter.isVisible().catch(() => false)) {
    await enter.click({ force: true });
    await pg.waitForTimeout(2500);
    await shot(pg, `scene-${vp.name}-4-act3`);
  } else {
    console.log(`[${vp.name}] 没找到「进入场景」按钮`);
  }

  console.log(`[${vp.name}] ${errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors'}`);
  await pg.close();
}

await b.close();
