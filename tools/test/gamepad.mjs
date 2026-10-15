// Simulate a standard gamepad: navigate menus and move/dash in game.
import { chromium } from 'playwright';
const URL = process.env.URL || 'http://localhost:4317/games/novaki/';
const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.addInitScript(() => {
  const pad = { id: 'Fake Pad (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', timestamp: 0,
    axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  window.__pad = pad;
  navigator.getGamepads = () => [pad, null, null, null];
  localStorage.setItem('novaki-strike-twice-save-v1', JSON.stringify({ seenIntro: true }));
});
await page.goto(URL);
await page.waitForFunction(() => window.NOVAKI_QA, null, { timeout: 30000 });
const press = async (i, ms = 120) => { await page.evaluate((i) => { window.__pad.buttons[i].pressed = true; window.__pad.buttons[i].value = 1; }, i); await page.waitForTimeout(ms); await page.evaluate((i) => { window.__pad.buttons[i].pressed = false; window.__pad.buttons[i].value = 0; }, i); await page.waitForTimeout(350); };
const scr = () => page.evaluate(() => window.NOVAKI_QA.state().screen);
await page.waitForTimeout(500);
await press(0); console.log('after A on title:', await scr());
await press(13); await press(12); // dpad down/up
await press(0); console.log('after A on Play:', await scr());
await press(0); console.log('after A on loadout (select):', await scr());
await press(0); console.log('after A again (strike):', await scr());
const p0 = await page.evaluate(() => window.NOVAKI_QA.state().player);
await page.evaluate(() => { window.__pad.axes[0] = 1; });
await page.waitForTimeout(1000);
await page.evaluate(() => { window.__pad.axes[0] = 0; });
const p1 = await page.evaluate(() => window.NOVAKI_QA.state().player);
console.log('stick moved x from', p0.x, 'to', p1.x);
await press(9); console.log('after Start:', await scr());
await press(1); console.log('after B (resume):', await scr());
console.log('ERRORS:', errors.join('\n'));
await browser.close();
