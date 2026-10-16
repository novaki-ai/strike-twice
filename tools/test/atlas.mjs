import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan'] });
const page = await browser.newPage();
await page.goto(process.env.URL || 'http://localhost:4317/games/novaki/');
await page.waitForFunction(() => window.NOVAKI_QA, null, { timeout: 30000 });
const r = await page.evaluate(() => {
  const g = window.__novaki.game;
  const srcs = new Map();
  const add = (t, kind) => { const s = t.source; if (!srcs.has(s.uid)) srcs.set(s.uid, { w: s.width, h: s.height, kind, n: 0 }); srcs.get(s.uid).n++; };
  for (const t of Object.values(g.T.tex)) add(t, 'tex');
  for (const t of Object.values(g.T.flash)) add(t, 'flash');
  for (const t of Object.values(g.icons)) add(t, 'icons');
  for (const t of Object.values(g.tiles)) add(t, 'tiles');
  let bytes = 0;
  const list = [...srcs.values()].map((s) => { const b = s.w * s.h * 4 * 1.33; bytes += b; return `${s.kind} ${s.w}x${s.h} (${s.n} frames) ~${(b / 1048576).toFixed(0)}MB`; });
  return { list, totalMB: (bytes / 1048576).toFixed(0) };
});
console.log(r.list.join('\n')); console.log('total ~' + r.totalMB + ' MB (incl. mipmaps)');
await browser.close();
