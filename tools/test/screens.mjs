// Visit every menu screen and the end-of-run flows; screenshot each and collect console errors.
import { chromium } from 'playwright';
import fs from 'node:fs';
const URL = process.env.URL || 'http://localhost:4317/games/novaki/';
const OUT = process.env.OUT || '/tmp/shots';
const VW = Number(process.env.VW || 1280), VH = Number(process.env.VH || 720);
const MOBILE = process.env.TOUCH === '1';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan'] });
const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, hasTouch: MOBILE, isMobile: MOBILE, deviceScaleFactor: MOBILE ? 3 : 1 });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.addInitScript(() => {
  if (!localStorage.getItem('novaki-strike-twice-save-v1')) localStorage.setItem('novaki-strike-twice-save-v1', JSON.stringify({ coins: 900, seenIntro: true }));
});
await page.goto(URL);
await page.waitForFunction(() => window.NOVAKI_QA, null, { timeout: 30000 });
const P = process.env.PREFIX || 'sc';
const shot = async (n) => { await page.waitForTimeout(450); await page.screenshot({ path: `${OUT}/${P}_${n}.png` }); };
const clickText = async (t) => { await page.waitForTimeout(320); await page.locator('.screen.show button:visible', { hasText: t }).first().click(); };
await shot('title');
if (MOBILE) await page.tap('#title'); else await page.keyboard.press('Enter');
await shot('menu');
await clickText('Workshop'); await shot('shop');
await page.locator('.shop-item').first().click(); await page.locator('.shop-item').nth(13).click(); await shot('shop_bought');
await clickText('Back');
await clickText('Settings'); await shot('settings'); await clickText('Back');
await clickText('How to Play'); await shot('howto');
await clickText('Arsenal'); await shot('howto_evo');
await clickText('Bestiary'); await shot('howto_best');
await clickText('Back');
await clickText('Records'); await shot('records'); await clickText('Back');
await clickText('Play'); await shot('loadout');
await clickText('Strike!');
await page.waitForTimeout(1500); await shot('run');
if (MOBILE) {
  // drag the virtual joystick
  const cx = VW * 0.3, cy = VH * 0.7;
  await page.touchscreen.tap(cx, cy);
  await page.evaluate(([x, y]) => {
    const el = document.getElementById('touch-layer');
    const ev = (type, px, py) => el.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'touch', clientX: px, clientY: py, bubbles: true }));
    ev('pointerdown', x, y); ev('pointermove', x + 40, y - 30);
  }, [cx, cy]);
  await page.waitForTimeout(800);
  await shot('touch_joy');
  const st = await page.evaluate(() => window.NOVAKI_QA.state());
  console.log('touch moved player to', st.player.x, st.player.y);
  await page.evaluate(([x, y]) => { const el = document.getElementById('touch-layer'); el.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, pointerType: 'touch', clientX: x, clientY: y, bubbles: true })); }, [cx, cy]);
}
await page.evaluate(() => window.NOVAKI_QA.addXp(30));
await shot('levelup');
for (let k = 0; k < 6; k++) { const s = await page.evaluate(() => window.NOVAKI_QA.state().screen); if (s !== 'levelup') break; await page.evaluate(() => window.NOVAKI_QA.chooseUpgrade(1)); }
if (MOBILE) await page.locator('.pause-btn').tap(); else await page.keyboard.press('Escape');
await shot('pause');
await clickText('Resume');
// die
await page.evaluate(() => { const g = window.__novaki.game; window.NOVAKI_QA.setInvincible(false); g.player.iframes = 0; g.player.revives = 0; g.hurtPlayer(9999, null); });
await page.waitForFunction(() => window.NOVAKI_QA.state().screen === 'gameover', null, { timeout: 30000 });
await shot('gameover');
// victory flow
await page.evaluate(() => { window.NOVAKI_QA.skipTo(3, 'boss'); window.NOVAKI_QA.setInvincible(true); });
await page.waitForTimeout(2500);
await page.evaluate(() => window.NOVAKI_QA.killBoss());
await page.waitForTimeout(3000); await shot('bossdeath');
await page.waitForFunction(() => window.NOVAKI_QA.state().screen === 'victory', null, { timeout: 30000 });
await page.waitForTimeout(1500); await shot('ending');
await clickText('Skip');
await page.waitForTimeout(800); await shot('victory');
console.log(JSON.stringify((await page.evaluate(() => window.NOVAKI_QA.state())).meta));
console.log('ERRORS:', errors.join('\n'));
await browser.close();
