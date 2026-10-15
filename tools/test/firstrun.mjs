import { chromium } from 'playwright';
const OUT = process.env.OUT;
const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(process.env.URL || 'http://localhost:4317/games/novaki/');
await page.waitForFunction(() => window.NOVAKI_QA, null, { timeout: 30000 });
const scr = () => page.evaluate(() => window.NOVAKI_QA.state().screen);
await page.waitForTimeout(600);
await page.keyboard.press('Space'); await page.waitForTimeout(500);
console.log('after key:', await scr());
await page.keyboard.press('Enter'); await page.waitForTimeout(2500);
console.log('after Play:', await scr());
await page.screenshot({ path: OUT + '/fr_intro.png' });
await page.keyboard.press('Enter'); await page.waitForTimeout(1500); // next line
await page.keyboard.press('Escape'); await page.waitForTimeout(800);
console.log('after skip:', await scr());
await page.keyboard.press('Enter'); await page.waitForTimeout(600);
console.log('after confirm on loadout:', await scr());
const keys = ['KeyD', 'KeyS', 'KeyA', 'KeyW'];
const hints = [];
for (let i = 0; i < 12; i++) {
  await page.keyboard.down(keys[i % 4]); await page.waitForTimeout(2500); await page.keyboard.up(keys[i % 4]);
  const t = await page.evaluate(() => Array.from(document.querySelectorAll('.toast')).map((x) => x.textContent));
  for (const h of t) if (!hints.includes(h)) hints.push(h);
  if (await scr() === 'levelup') await page.keyboard.press('Digit1');
}
await page.screenshot({ path: OUT + '/fr_play.png' });
console.log('hints seen:', hints);
console.log('state', JSON.stringify(await page.evaluate(() => { const s = window.NOVAKI_QA.state(); return { screen: s.screen, time: s.time, lvl: s.player.level, up: s.upgrades }; })));
console.log('ERRORS', errors.join('\n'));
await browser.close();
