/** 查明横向溢出的那个元素是谁；并注入模拟字幕验证字幕流真实排版。 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:8093/?screen=voice-call';
const b = await chromium.launch();
const pg = await b.newPage({ viewport: { width: 390, height: 844 } });
await pg.goto(BASE, { waitUntil: 'load', timeout: 120000 });
await pg.waitForTimeout(15000);

const culprit = await pg.evaluate(() =>
  [...document.querySelectorAll('div,span')]
    .filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1);
    })
    .map((el) => {
      const r = el.getBoundingClientRect();
      return {
        tag: el.tagName,
        cls: (el.className || '').toString().slice(0, 60),
        left: Math.round(r.left), right: Math.round(r.right),
        w: Math.round(r.width), h: Math.round(r.height),
        text: (el.innerText || '').slice(0, 40),
        parentTag: el.parentElement && el.parentElement.tagName,
      };
    }),
);
console.log('=== 横向溢出元素 ===');
console.log(JSON.stringify(culprit, null, 2));
await b.close();
