// Stress test: many enemies + evolved weapons + boss bullets; report FPS and frame costs.
import { chromium } from 'playwright';
const URL = process.env.URL || 'http://localhost:4317/games/novaki/';
const N = Number(process.env.N || 600);
const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan'] });
const page = await browser.newPage({ viewport: { width: Number(process.env.VW || 1920), height: Number(process.env.VH || 1080) } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(URL);
await page.waitForFunction(() => window.NOVAKI_QA, null, { timeout: 30000 });
await page.evaluate((boss) => {
  const Q = window.NOVAKI_QA;
  Q.skipTo(3, boss ? 'boss' : 'start'); Q.setInvincible(true);
  const g = window.__novaki.game;
  g.player.weapons.length = 0;
  for (const id of ['ember', 'ring', 'cracker', 'spark', 'trail', 'volley']) { const w = g.addWeapon(id); w.level = 8; w.evo = true; }
  g.player.xpNext = 1e12;
}, process.env.BOSS === '1');
await page.waitForTimeout(500);
await page.evaluate((n) => window.NOVAKI_QA.spawnEnemies(n), N);
// keep the horde topped up and measure frame times via rAF
const res = await page.evaluate(async (n) => {
  const times = [];
  let last = performance.now();
  const end = last + 10000;
  let refill = 0;
  await new Promise((resolve) => {
    const f = (t) => {
      times.push(t - last); last = t;
      if (++refill % 30 === 0) { const c = window.NOVAKI_QA.state().enemies; if (c < n) window.NOVAKI_QA.spawnEnemies(n - c); }
      if (t < end) requestAnimationFrame(f); else resolve();
    };
    requestAnimationFrame(f);
  });
  times.sort((a, b) => a - b);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const st = window.NOVAKI_QA.state();
  return { frames: times.length, avgMs: avg.toFixed(2), p95: times[Math.floor(times.length * 0.95)].toFixed(2), p99: times[Math.floor(times.length * 0.99)].toFixed(2), fps: (1000 / avg).toFixed(1), enemies: st.enemies, perf: st.perf, screen: st.screen };
}, N);
console.log(JSON.stringify(res));
console.log('ERRORS:', errors.join('\n'));
await browser.close();
