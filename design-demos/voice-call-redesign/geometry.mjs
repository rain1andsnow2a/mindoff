/**
 * 几何验收：确认字幕通话版在 390×844 / 1440×900 下没有溢出、没有裁切、
 * 挂断键触达尺寸达标、底部工具条落在安全区内。
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:8093/?screen=voice-call';
const b = await chromium.launch();

for (const vp of [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
]) {
  const pg = await b.newPage({ viewport: { width: vp.width, height: vp.height } });
  await pg.goto(BASE, { waitUntil: 'load', timeout: 120000 });
  await pg.waitForTimeout(vp.name === 'phone' ? 15000 : 5000);

  const report = await pg.evaluate((vpHeight) => {
    const out = {};
    // 纵向溢出：documentElement 是否比视口高（字幕页应当整屏收口，不出现整页滚动）
    out.docScrollHeight = document.documentElement.scrollHeight;
    out.overflowsViewport = document.documentElement.scrollHeight > vpHeight + 1;

    const byLabel = (label) =>
      document.querySelector(`[aria-label="${label}"]`) ||
      [...document.querySelectorAll('*')].find(
        (el) => el.getAttribute && el.getAttribute('aria-label') === label,
      );

    const hang = byLabel('挂断通话');
    if (hang) {
      const r = hang.getBoundingClientRect();
      out.hangup = {
        w: Math.round(r.width), h: Math.round(r.height),
        bottomGap: Math.round(vpHeight - r.bottom),
        insideViewport: r.bottom <= vpHeight + 1 && r.top >= 0,
        meetsTouchTarget: r.width >= 44 && r.height >= 44,
      };
    }

    const toggle = [...document.querySelectorAll('*')].find(
      (el) => el.getAttribute && (el.getAttribute('aria-label') || '').startsWith('桌宠语音回复'),
    );
    if (toggle) {
      const r = toggle.getBoundingClientRect();
      out.voiceToggle = {
        w: Math.round(r.width), h: Math.round(r.height),
        label: toggle.getAttribute('aria-label'),
        meetsTouchTarget: r.height >= 40,
      };
    }

    // 横向溢出：任何元素右边界超出视口宽度即为裁切
    out.horizontalOverflow = [...document.querySelectorAll('div,span')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1);
      }).length;

    return out;
  }, vp.height);

  console.log(`\n=== ${vp.name} ${vp.width}x${vp.height} ===`);
  console.log(JSON.stringify(report, null, 2));
  await pg.close();
}

await b.close();
