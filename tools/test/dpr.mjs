// Verify the world fills the screen on high-DPI displays (desktop retina + phone).
import { chromium } from 'playwright';
const URL = process.env.URL || 'http://localhost:4317/games/novaki/';
const OUT = process.env.OUT;
const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan'] });
for (const [w, h, dpr, mobile] of [[1440, 900, 2, false], [844, 390, 3, true], [390, 844, 3, true]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  await page.goto(URL);
  await page.waitForFunction(() => window.NOVAKI_QA, null, { timeout: 30000 });
  await page.evaluate(() => { window.NOVAKI_QA.start({ seed: 1 }); window.NOVAKI_QA.setInvincible(true); });
  await page.waitForTimeout(1500);
  const info = await page.evaluate(() => { const A = window.__novaki; const g = A.game; return { screen: [A.app.screen.width, A.app.screen.height], ground: [g.ground.width, g.ground.height], res: A.app.renderer.resolution, canvas: [A.app.canvas.width, A.app.canvas.height] }; });
  console.log(w, h, dpr, JSON.stringify(info));
  await page.screenshot({ path: `${OUT}/dpr_${w}x${h}.png` });
  await ctx.close();
}
await browser.close();
