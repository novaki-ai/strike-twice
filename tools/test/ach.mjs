import fs from 'node:fs';
import { chromium } from 'playwright';
const OUT = process.env.OUT || 'test-results';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.addInitScript(() => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', '1'); localStorage.setItem('novaki-strike-twice-save-v1', JSON.stringify({ seenIntro: true })); } });
await page.goto(process.env.URL || 'http://localhost:4317/games/novaki/');
await page.waitForFunction(() => window.NOVAKI_QA, null, { timeout: 30000 });
// fair run: fast-forward the sim with an invincible player, then die
await page.evaluate(() => {
  const A = window.__novaki, g = A.game, Q = window.NOVAKI_QA;
  Q.start({ seed: 4 }); g.player.invincible = true;
  for (let i = 0; i < 60 * 200; i++) {
    if (A.screen === 'levelup') { A.pickChoice(0); continue; }
    if (A.screen === 'chest') { A.navLockUntil = 0; A.closeChest(); continue; }
    if (A.screen !== 'playing') break;
    g.input.x = Math.cos(i / 120); g.input.y = Math.sin(i / 170); g.update(1 / 60);
  }
  g.player.invincible = false; g.player.iframes = 0; g.player.revives = 0; g.hurtPlayer(99999, null);
});
await page.waitForFunction(() => window.NOVAKI_QA.state().screen === 'gameover', null, { timeout: 20000 });
await page.waitForTimeout(800);
await page.screenshot({ path: OUT + '/ach_gameover.png' });
console.log('kills', await page.evaluate(() => window.NOVAKI_QA.state().kills), 'unlocks', JSON.stringify((await page.evaluate(() => window.NOVAKI_QA.state())).meta.unlocks));
await page.waitForTimeout(400);
await page.locator('.screen.show button:visible', { hasText: 'Main Menu' }).first().click();
await page.waitForTimeout(500);
await page.locator('.screen.show button:visible', { hasText: 'Records' }).first().click();
await page.waitForTimeout(600);
await page.locator('.ach-wrap').scrollIntoViewIfNeeded();
await page.screenshot({ path: OUT + '/ach_records.png' });
console.log('ERRORS', errors.join('\n'));
await browser.close();
