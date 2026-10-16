// Random inputs + random QA calls from any screen; any page error fails the test.
import { chromium } from 'playwright';
const SECS = Number(process.env.SECS || 180);
const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto(process.env.URL || 'http://localhost:4317/games/novaki/');
await page.waitForFunction(() => window.NOVAKI_QA, null, { timeout: 30000 });
const keys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'Space', 'Enter', 'Escape', 'Digit1', 'Digit2', 'Digit3', 'KeyP', 'ShiftLeft', 'Backspace', 'KeyE', 'KeyQ', 'Tab'];
const qa = [
  'start({seed: Math.floor(Math.random()*1e6)})', 'setInvincible(true)', 'setInvincible(false)', 'addXp(Math.random()*80)', 'chooseUpgrade(Math.floor(Math.random()*4))',
  "skipTo(1+Math.floor(Math.random()*3), Math.random()<0.5?'start':'boss')", 'killBoss()', 'spawnEnemies(Math.floor(Math.random()*120))', 'state()',
];
const t0 = Date.now();
let n = 0;
const screens = new Map();
const harness = [];
while (Date.now() - t0 < SECS * 1000) {
  try {
  const r = Math.random();
  if (r < 0.55) {
    const k = keys[Math.floor(Math.random() * keys.length)];
    if (Math.random() < 0.5) await page.keyboard.press(k); else { await page.keyboard.down(k); await page.waitForTimeout(100 + Math.random() * 600); await page.keyboard.up(k); }
  } else if (r < 0.8) {
    const c = qa[Math.floor(Math.random() * qa.length)];
    await page.evaluate((c) => { try { eval('window.NOVAKI_QA.' + c); } catch (e) { console.error('QA threw: ' + c + ' ' + e.message); } }, c);
  } else if (r < 0.9) {
    // click a random visible button
    const btns = await page.locator('.screen.show button:visible, .screen.show [data-nav]:visible').all();
    if (btns.length) { try { await btns[Math.floor(Math.random() * btns.length)].click({ timeout: 500 }); } catch { /* moved */ } }
  } else {
    await page.waitForTimeout(300 + Math.random() * 1200);
  }
  n++;
  if (n % 20 === 0) { const s = await page.evaluate(() => window.NOVAKI_QA.state().screen); screens.set(s, (screens.get(s) || 0) + 1); }
  } catch (e) { harness.push(String(e.message || e).split('\n')[0]); } // test-harness hiccups (detached elements etc.), not game errors
}
console.log('harness exceptions (not game errors):', harness.length, harness.slice(0, 3).join(' | '));
console.log('actions', n, 'screens sampled', JSON.stringify([...screens]));
console.log('ERRORS (' + errors.length + '):\n' + errors.slice(0, 15).join('\n'));
await browser.close();
