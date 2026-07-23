import fs from 'fs';

const jobs = [
  ['d:/bigproject/AdventureX/MindOff原型/design-demos/01-calm-night.html',
   'd:/bigproject/AdventureX/mindoff-proto/01-calm-night.html'],
];
fs.mkdirSync('d:/bigproject/AdventureX/mindoff-proto', { recursive: true });
for (const [src, dst] of jobs) {
  if (fs.existsSync(src)) fs.renameSync(src, dst);
}

const { chromium } = await import('playwright');
const b = await chromium.launch();
const pg = await b.newPage({ viewport: { width: 1740, height: 1200 }, deviceScaleFactor: 2 });
for (const [, dst] of jobs) {
  const out = dst.replace(/\.html$/, '.png');
  await pg.goto('file:///' + dst);
  await pg.waitForTimeout(1800);
  await pg.screenshot({ path: out, fullPage: true });
  console.log('shot', out);
}
await b.close();
console.log('done');
