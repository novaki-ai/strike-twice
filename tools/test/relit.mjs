import fs from 'node:fs';
import { chromium } from 'playwright';
const OUT = process.env.OUT || 'test-results';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(process.env.URL || 'http://localhost:4317/games/novaki/');
await page.waitForFunction(() => window.NOVAKI_QA, null, { timeout: 30000 });
await page.evaluate(() => { window.NOVAKI_QA.skipTo(3, 'start'); window.NOVAKI_QA.setInvincible(true); window.__novaki.clearBanners(); window.__novaki.game.director.update = () => {}; });
const clip = { x: 570, y: 250, width: 140, height: 150 };
for (const lv of [1, 12, 24, 38]) {
  await page.evaluate((lv) => { const g = window.__novaki.game; g.player.level = lv; g.player.ignite = 0; g.player.goldT = 0; }, lv);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/relit_${lv}.png`, clip });
}
await browser.close();
