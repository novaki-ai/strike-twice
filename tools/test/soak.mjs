// Real-time soak test: FPS + heap over several minutes of heavy play.
import { chromium } from 'playwright';
const URL = process.env.URL || 'http://localhost:4317/games/novaki/';
const MIN = Number(process.env.MIN || 4);
const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan', '--enable-precise-memory-info'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(URL);
await page.waitForFunction(() => window.NOVAKI_QA, null, { timeout: 30000 });
await page.evaluate(() => {
  const Q = window.NOVAKI_QA; Q.skipTo(3, 'start'); Q.setInvincible(true);
  const A = window.__novaki, g = A.game;
  for (const w of g.player.weapons) { w.level = 8; }
  // autopilot: circle + auto-pick upgrades, keep horde topped up
  let t = 0;
  const step = () => {
    t += 1 / 60;
    if (A.screen === 'levelup') A.pickChoice(0);
    if (A.screen === 'chest') A.closeChest();
    if (A.screen === 'stageclear') A.pickRelic(0);
    g.input.x = Math.cos(t * 0.5); g.input.y = Math.sin(t * 0.5);
    if (Math.floor(t * 60) % 60 === 0) { const c = Q.state().enemies; if (c < 450) Q.spawnEnemies(450 - c); }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  // fps sampler
  window.__fps = []; let last = performance.now(), frames = 0;
  const f = (now) => { frames++; if (now - last >= 1000) { window.__fps.push(frames * 1000 / (now - last)); frames = 0; last = now; } requestAnimationFrame(f); };
  requestAnimationFrame(f);
});
for (let i = 0; i < MIN * 3; i++) {
  await page.waitForTimeout(20000);
  const r = await page.evaluate(() => {
    const f = window.__fps.splice(0);
    const st = window.NOVAKI_QA.state();
    return { minFps: Math.min(...f).toFixed(0), avgFps: (f.reduce((a, b) => a + b, 0) / f.length).toFixed(1), heapMB: performance.memory ? (performance.memory.usedJSHeapSize / 1048576).toFixed(1) : 'n/a', enemies: st.enemies, level: st.player.level, screen: st.screen, stage: st.stage, perf: st.perf };
  });
  console.log(`t=${(i + 1) * 20}s`, JSON.stringify(r));
}
console.log('ERRORS', errors.join('\n'));
await browser.close();
