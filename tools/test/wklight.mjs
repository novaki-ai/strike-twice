import { webkit } from 'playwright';
const browser = await webkit.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(process.env.URL || 'http://localhost:4317/games/novaki/');
await page.waitForFunction(() => window.NOVAKI_QA, null, { timeout: 60000 });
await page.evaluate(() => { window.NOVAKI_QA.skipTo(3, 'start'); window.NOVAKI_QA.setInvincible(true); window.__novaki.game.director.update = () => {}; });
await page.waitForTimeout(2000);
const r = await page.evaluate(async () => {
  const g = window.__novaki.game;
  const R = g.app.renderer;
  const out = {};
  for (const n of [0, 5, 20, 60, 150]) {
    // configure n light sprites of moderate size
    for (let i = 0; i < g.lightPool.length; i++) g.lightPool[i].visible = i < n;
    while (g.lightPool.length < n) { g.lightUsed = g.lightPool.length; g.pushLight(g.camX, g.camY, 200, 0xffffff, 0.5); }
    for (let i = 0; i < n; i++) { const s = g.lightPool[i]; s.visible = true; s.scale.set(1.5); s.x = 160 + (i % 10) * 10; s.y = 90; }
    const t0 = performance.now();
    for (let k = 0; k < 5; k++) R.render({ container: g.lightScene, target: g.lightRT, clear: true });
    // force completion
    R.gl?.finish?.();
    out[n] = ((performance.now() - t0) / 5).toFixed(1) + 'ms';
  }
  const t1 = performance.now();
  for (let k = 0; k < 5; k++) R.render(g.app.stage);
  R.gl?.finish?.();
  out.fullFrame = ((performance.now() - t1) / 5).toFixed(1) + 'ms';
  out.renderer = R.name + ' ' + R.type;
  const gl = R.gl; const d = gl && gl.getExtension('WEBGL_debug_renderer_info');
  out.gpu = d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : (gl ? gl.getParameter(gl.RENDERER) : 'n/a');
  return out;
});
console.log(JSON.stringify(r, null, 1));
await browser.close();
