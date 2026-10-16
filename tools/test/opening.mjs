import { chromium } from 'playwright';
const OUT = process.env.OUT;
const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.addInitScript(() => localStorage.setItem('novaki-strike-twice-save-v1', JSON.stringify({ seenIntro: true })));
await page.goto(process.env.URL || 'http://localhost:4317/games/novaki/');
await page.waitForFunction(() => window.NOVAKI_QA, null, { timeout: 30000 });
await page.keyboard.press('Enter'); await page.waitForTimeout(600);
await page.keyboard.press('Enter'); await page.waitForTimeout(600); // Play -> loadout
await page.keyboard.press('Enter'); await page.waitForTimeout(200); // select ember
await page.keyboard.press('Enter'); // strike
const keys = ['KeyD', 'KeyS', 'KeyA', 'KeyW'];
for (let i = 0; i < 6; i++) {
  await page.keyboard.down(keys[i % 4]); await page.waitForTimeout(1600); await page.keyboard.up(keys[i % 4]);
  if ((await page.evaluate(() => window.NOVAKI_QA.state().screen)) === 'levelup') { await page.screenshot({ path: `${OUT}/open_lu.png` }); await page.keyboard.press('Digit1'); }
  await page.screenshot({ path: `${OUT}/open_${i}.png` });
}
await browser.close();
