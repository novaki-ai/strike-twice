import { chromium } from 'playwright';
const OUT = process.env.OUT;
const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(process.env.URL || 'http://localhost:4317/games/novaki/');
await page.waitForFunction(() => window.NOVAKI_QA, null, { timeout: 30000 });
await page.evaluate(() => { window.NOVAKI_QA.start({ seed: 8 }); window.NOVAKI_QA.setInvincible(true); window.NOVAKI_QA.spawnEnemies(100); });
await page.waitForTimeout(800);
for (const [w, h] of [[390, 844], [844, 390], [390, 844]]) {
  await page.setViewportSize({ width: w, height: h });
  await page.waitForTimeout(700);
  const r = await page.evaluate(() => { const A = window.__novaki; return { screen: [A.app.screen.width, A.app.screen.height], ground: [A.game.ground.width, A.game.ground.height], light: [A.game.lightSprite.width, A.game.lightSprite.height] }; });
  console.log(w, h, JSON.stringify(r));
  await page.screenshot({ path: `${OUT}/rot_${w}x${h}.png` });
}
console.log('ERRORS', errors.join('\n'));
await browser.close();
