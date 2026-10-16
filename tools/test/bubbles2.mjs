import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(process.env.URL || 'http://localhost:4317/games/novaki/');
await page.waitForFunction(() => window.NOVAKI_QA, null, { timeout: 30000 });
await page.evaluate(() => { window.NOVAKI_QA.start({ seed: 9 }); window.__novaki.game.player.invincible = true; });
const said = new Set();
for (let i = 0; i < 16; i++) {
  await page.waitForTimeout(1000);
  const t = await page.evaluate(() => { const b = document.querySelector('.bubble'); return b.classList.contains('show') ? b.textContent : ''; });
  if (t) said.add(t);
  if ((await page.evaluate(() => window.NOVAKI_QA.state().screen)) === 'levelup') await page.evaluate(() => window.NOVAKI_QA.chooseUpgrade(0));
}
console.log('bubbles seen in the first 16 s:', [...said]);
await page.evaluate(() => { const g = window.__novaki.game; g.director.runEvent({ t: 0, kind: 'gilded' }); });
await page.waitForTimeout(400);
console.log('after gilded event:', await page.evaluate(() => document.querySelector('.bubble').textContent));
console.log('ERRORS', errors.join('\n'));
await browser.close();
