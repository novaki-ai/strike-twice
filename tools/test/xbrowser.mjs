// Cross-browser smoke: load, menus, a short run with QA calls, stage/boss skips, end screens. Reports console errors.
import { chromium, firefox, webkit } from 'playwright';
const URL = process.env.URL || 'http://localhost:4317/games/novaki/';
const OUT = process.env.OUT || '/tmp';
const which = process.env.BROWSER || 'firefox';
const bt = { chromium, firefox, webkit }[which];
const browser = await bt.launch(which === 'firefox' ? { firefoxUserPrefs: { 'media.autoplay.default': 0, 'webgl.force-enabled': true } } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [], warns = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); else if (m.type() === 'warning') warns.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto(URL);
await page.waitForFunction(() => window.NOVAKI_QA, null, { timeout: 60000 });
const S = () => page.evaluate(() => window.NOVAKI_QA.state());
await page.waitForTimeout(800);
await page.keyboard.press('Enter');
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/x_${which}_menu.png` });
const r = await page.evaluate(() => {
  const c = document.createElement('canvas'); const gl = c.getContext('webgl2') || c.getContext('webgl');
  return { gl: gl ? (gl instanceof WebGL2RenderingContext ? 'webgl2' : 'webgl1') : 'none', audio: window.__audio?.ctx?.state };
});
console.log(which, 'ctx', JSON.stringify(r));
await page.evaluate(() => { window.NOVAKI_QA.start({ seed: 42 }); window.NOVAKI_QA.setInvincible(true); });
const keys = ['KeyD', 'KeyS', 'KeyA', 'KeyW'];
for (let i = 0; i < 6; i++) {
  await page.keyboard.down(keys[i % 4]); await page.waitForTimeout(900); await page.keyboard.up(keys[i % 4]);
  const s = await S(); if (s.screen === 'levelup') await page.evaluate(() => window.NOVAKI_QA.chooseUpgrade(0));
}
await page.evaluate(() => window.NOVAKI_QA.spawnEnemies(250));
await page.waitForTimeout(2500);
let s = await S();
console.log(which, 'run:', s.screen, 'enemies', s.enemies, 'fps', s.fps, 'time', s.time);
await page.screenshot({ path: `${OUT}/x_${which}_run.png` });
for (const st of [2, 3]) { await page.evaluate((st) => window.NOVAKI_QA.skipTo(st, 'boss'), st); await page.waitForTimeout(2500); }
s = await S(); console.log(which, 'boss3:', s.bossActive, s.stage);
await page.screenshot({ path: `${OUT}/x_${which}_boss.png` });
await page.evaluate(() => window.NOVAKI_QA.killBoss());
await page.waitForFunction(() => window.NOVAKI_QA.state().screen === 'victory', null, { timeout: 30000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/x_${which}_end.png` });
console.log(which, 'final screen', (await S()).screen);
console.log('ERRORS (' + errors.length + '):\n' + errors.slice(0, 12).join('\n'));
console.log('WARNINGS (' + warns.length + '):\n' + [...new Set(warns)].slice(0, 8).join('\n'));
await browser.close();
