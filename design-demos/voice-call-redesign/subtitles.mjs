/**
 * 字幕层级验收：注入模拟字幕后，量出每一行的字号 / 透明度 / 位置，
 * 确认「最新一句最大最清晰、历史句逐级淡去」真的成立，而不是靠肉眼猜。
 */
import { chromium } from 'playwright';

const b = await chromium.launch();
const pg = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
pg.on('pageerror', (e) => errors.push(String(e)));
pg.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await pg.goto('http://localhost:8093/?screen=voice-call&mock=1', {
  waitUntil: 'load', timeout: 120000,
});
await pg.waitForTimeout(16000);

await pg.screenshot({ path: 'verify-subtitles.png' });
console.log('shot verify-subtitles.png');

const report = await pg.evaluate(() => {
  const texts = ['今天刚做完实习。', '结束了就好', '是不是该给自己放半天假'];
  const rows = texts.map((needle) => {
    const el = [...document.querySelectorAll('div')].find(
      (d) => d.children.length === 0 && (d.innerText || '').includes(needle),
    );
    if (!el) return { needle, found: false };
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    // 透明度要沿祖先链累乘，字幕的淡出是加在父容器上的
    let opacity = 1, node = el;
    while (node && node !== document.body) {
      opacity *= parseFloat(getComputedStyle(node).opacity || '1');
      node = node.parentElement;
    }
    return {
      needle, found: true,
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      fontStyle: cs.fontStyle,
      color: cs.color,
      effectiveOpacity: Number(opacity.toFixed(2)),
      top: Math.round(r.top),
      right: Math.round(r.right),
      withinWidth: r.right <= window.innerWidth + 1,
    };
  });

  // 说话人标签
  const labels = [...document.querySelectorAll('div')]
    .filter((d) => d.children.length === 0 && ['你', '米露'].includes((d.innerText || '').trim()))
    .map((d) => ({ text: d.innerText.trim(), color: getComputedStyle(d).color,
                    fontSize: getComputedStyle(d).fontSize }));

  return { rows, labels, docHeight: document.documentElement.scrollHeight };
});

console.log(JSON.stringify(report, null, 2));
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await b.close();
