/** 验证明文 bundle 是否含新代码。Metro minify 会把中文转成 \uXXXX，两种形式都搜。 */
import fs from 'fs';

const path = process.argv[2];
if (!path) { console.error('usage: node verify-bundle.mjs <bundle.js>'); process.exit(1); }
const data = fs.readFileSync(path, 'utf8');

const checks = ['定妆，准备开演', '幕间 · 候场', '想重演的', '整理成了这一幕', '切到后台等待', '第一幕 · 讲述', '开演前', '内置场景', '进入场景', '我的场景'];
// 单字/短词探测：定位「幕间 · 候场」「第一幕 · 讲述」为何搜不到
const probes = ['幕间', '候场', '第一幕', '讲述', '定妆', '开演前', '整理成了这一幕'];

console.log('bundle length:', data.length);
for (const s of checks) {
  const escaped = [...s].map(c => '\\u' + c.codePointAt(0).toString(16).padStart(4, '0')).join('');
  const plain = data.includes(s);
  const hex = data.includes(escaped);
  // 空格不转义：Metro 保留 ASCII 空格，补一个「空格保留」的搜索
  const spaced = s.replace(/ /g, '');
  const hexSpaced = data.includes([...spaced].map(c => '\\u' + c.codePointAt(0).toString(16).padStart(4, '0')).join(''));
  console.log(JSON.stringify({ text: s, plain, hex, hexSpaced }));
}
console.log('--- 单字探测 ---');
for (const s of probes) {
  const e = [...s].map(c => '\\u' + c.codePointAt(0).toString(16).padStart(4, '0')).join('');
  console.log(JSON.stringify({ s, found: data.includes(e) }));
}
console.log('--- 幕间/第一幕 上下文 ---');
for (const [word, escSeq] of [['幕间', '\\u5e55\\u95f4'], ['第一幕', '\\u7b2c\\u4e00\\u5e55']]) {
  const idx = data.indexOf(escSeq);
  console.log(JSON.stringify({ word, idx, ctx: idx >= 0 ? data.slice(idx, idx + 70) : 'NOT FOUND' }));
}
