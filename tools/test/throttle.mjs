// Performance under CPU throttling (approximates a slower laptop / phone).
import { chromium } from 'playwright';
const RATE = Number(process.env.RATE || 4), N = Number(process.env.N || 300);
const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan'] });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
await page.goto(process.env.URL || 'http://localhost:4317/games/novaki/');
await page.waitForFunction(() => window.NOVAKI_QA, null, { timeout: 30000 });
const cdp = await page.context().newCDPSession(page);
await page.evaluate(() => { window.NOVAKI_QA.skipTo(2, 'start'); window.NOVAKI_QA.setInvincible(true); const g = window.__novaki.game; for (const w of g.player.weapons) w.level = 6; g.player.xpNext = 1e12; });
await cdp.send('Emulation.setCPUThrottlingRate', { rate: RATE });
await page.evaluate((n) => window.NOVAKI_QA.spawnEnemies(n), N);
const res = await page.evaluate(async (n) => {
  const times = []; let last = performance.now(); const end = last + 8000; let k = 0;
  await new Promise((r) => { const f = (t) => { times.push(t - last); last = t; if (++k % 30 === 0) { const c = window.NOVAKI_QA.state().enemies; if (c < n) window.NOVAKI_QA.spawnEnemies(n - c); } if (t < end) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); });
  times.sort((a, b) => a - b);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const st = window.NOVAKI_QA.state();
  return { fps: (1000 / avg).toFixed(1), p95ms: times[Math.floor(times.length * 0.95)].toFixed(1), enemies: st.enemies, perf: st.perf };
}, N);
console.log(`throttle x${RATE}, ${N} enemies:`, JSON.stringify(res));
await browser.close();
