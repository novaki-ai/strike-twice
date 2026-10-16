import fs from 'node:fs';
import { chromium } from 'playwright';
const URL = process.env.URL || 'http://localhost:4317/games/novaki/';
const OUT = process.env.OUT || 'test-results';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(URL);
await page.waitForFunction(() => window.NOVAKI_QA, null, { timeout: 30000 });
for (const st of [2, 3]) {
  await page.evaluate((s) => { window.NOVAKI_QA.skipTo(s, 'start'); window.NOVAKI_QA.setInvincible(true); const g = window.__novaki.game; g.director.update = () => {}; window.__novaki.clearBanners(); window.__novaki.interruptBarks(); }, st);
  // walk past several decor props
  for (const k of ['KeyD', 'KeyS', 'KeyA', 'KeyS', 'KeyD']) { await page.keyboard.down(k); await page.waitForTimeout(2200); await page.keyboard.up(k); }
  const n = await page.evaluate(() => window.__novaki.game.lightsRelit);
  console.log('stage', st, 'lamps relit', n);
  await page.screenshot({ path: `${OUT}/lamps_${st}.png` });
}
console.log('ERRORS', errors.join('\n'));
await browser.close();
