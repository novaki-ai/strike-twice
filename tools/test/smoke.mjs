// Smoke test: load, start a run, play a bit via QA, screenshot.
import { chromium } from 'playwright';
const URL = process.env.URL || 'http://localhost:4317/games/novaki/';
const OUT = process.env.OUT || '/tmp/shots';
import fs from 'node:fs';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('requestfailed', (r) => errors.push('requestfailed: ' + r.url()));
await page.goto(URL);
await page.waitForFunction(() => window.NOVAKI_QA, null, { timeout: 30000 });
await page.waitForTimeout(800);
await page.screenshot({ path: OUT + '/01_title.png' });
await page.keyboard.press('Enter');
await page.waitForTimeout(800);
await page.screenshot({ path: OUT + '/02_menu.png' });
const steps = JSON.parse(process.env.STEPS || '[]');
await page.evaluate(() => window.NOVAKI_QA.start({ seed: 42 }));
await page.waitForTimeout(1500);
await page.screenshot({ path: OUT + '/03_start.png' });
// walk around in a circle for a while
const keys = ['KeyD', 'KeyS', 'KeyA', 'KeyW'];
for (let i = 0; i < 8; i++) {
  await page.keyboard.down(keys[i % 4]);
  await page.waitForTimeout(1500);
  await page.keyboard.up(keys[i % 4]);
  const st = await page.evaluate(() => window.NOVAKI_QA.state());
  if (st.screen === 'levelup') await page.evaluate(() => window.NOVAKI_QA.chooseUpgrade(0));
}
await page.screenshot({ path: OUT + '/04_play.png' });
console.log(JSON.stringify(await page.evaluate(() => window.NOVAKI_QA.state())));
await page.evaluate(() => { window.NOVAKI_QA.setInvincible(true); window.NOVAKI_QA.addXp(50); });
await page.waitForTimeout(500);
await page.screenshot({ path: OUT + '/05_levelup.png' });
await page.evaluate(() => window.NOVAKI_QA.chooseUpgrade(0));
await page.evaluate(() => window.NOVAKI_QA.spawnEnemies(250));
await page.waitForTimeout(2500);
await page.screenshot({ path: OUT + '/06_horde.png' });
const st2 = await page.evaluate(() => window.NOVAKI_QA.state());
console.log('after spawn: enemies', st2.enemies, 'fps', st2.fps, 'screen', st2.screen);
console.log('ERRORS:\n' + errors.join('\n'));
await browser.close();
