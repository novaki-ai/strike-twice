// Visual tour: screenshots of each stage, boss fights and key screens.
import { chromium } from 'playwright';
import fs from 'node:fs';
const URL = process.env.URL || 'http://localhost:4317/games/novaki/';
const OUT = process.env.OUT || '/tmp/shots';
const VW = Number(process.env.VW || 1280), VH = Number(process.env.VH || 720);
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan'] });
const page = await browser.newPage({ viewport: { width: VW, height: VH }, hasTouch: process.env.TOUCH === '1', isMobile: process.env.TOUCH === '1' });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto(URL);
await page.waitForFunction(() => window.NOVAKI_QA, null, { timeout: 30000 });
const shot = async (n) => { await page.screenshot({ path: `${OUT}/${n}.png` }); };
const tour = (process.env.TOUR || 'title,stages,bosses').split(',');
const wander = async (ms) => {
  const keys = ['KeyD', 'KeyS', 'KeyA', 'KeyW'];
  const t0 = Date.now(); let i = 0;
  while (Date.now() - t0 < ms) {
    await page.keyboard.down(keys[i % 4]); await page.waitForTimeout(700); await page.keyboard.up(keys[i % 4]); i++;
    const s = await page.evaluate(() => window.NOVAKI_QA.state());
    if (s.screen === 'levelup') await page.evaluate(() => window.NOVAKI_QA.chooseUpgrade(0));
    if (s.screen === 'chest') await page.keyboard.press('Enter');
  }
};
if (tour.includes('title')) {
  await page.waitForTimeout(500); await shot('t1_title');
  await page.keyboard.press('Enter'); await page.waitForTimeout(700); await shot('t2_menu');
}
if (tour.includes('stages')) {
  for (const st of [1, 2, 3]) {
    await page.evaluate((s) => { window.NOVAKI_QA.skipTo(s, 'start'); window.NOVAKI_QA.setInvincible(true); }, st);
    await page.waitForTimeout(1200); await shot(`s${st}_a`);
    await page.evaluate(() => { const g = window.__novaki.game; g.stageTime = 150; });
    await wander(9000); await shot(`s${st}_b`);
  }
}
if (tour.includes('bosses')) {
  for (const st of [1, 2, 3]) {
    await page.evaluate((s) => { window.NOVAKI_QA.skipTo(s, 'boss'); window.NOVAKI_QA.setInvincible(true); }, st);
    await page.waitForTimeout(1800); await shot(`b${st}_intro`);
    await wander(7000); await shot(`b${st}_fight`);
    await wander(5000); await shot(`b${st}_fight2`);
  }
}
console.log(JSON.stringify(await page.evaluate(() => window.NOVAKI_QA.state().perf)));
console.log('ERRORS:', errors.join('\n'));
await browser.close();
