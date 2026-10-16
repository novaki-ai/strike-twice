// Documentation screenshots (docs/screenshots), captured from the real game.
import { chromium } from 'playwright';
const URL = process.env.URL || 'http://localhost:4317/games/novaki/';
const OUT = process.env.OUT || 'docs/screenshots';
const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.addInitScript(() => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', '1'); localStorage.setItem('novaki-strike-twice-save-v1', JSON.stringify({ seenIntro: true, coins: 240, stats: { runs: 5 } })); } });
await page.goto(URL);
await page.waitForFunction(() => window.NOVAKI_QA, null, { timeout: 30000 });
const shot = async (n) => { await page.screenshot({ path: `${OUT}/${n}.png` }); };
const quiet = () => page.evaluate(() => { window.__novaki.clearBanners(); window.__novaki.interruptBarks(); document.querySelectorAll('.toast').forEach((t) => t.remove()); if (window.__novaki.screen === 'chest') { window.__novaki.navLockUntil = 0; window.__novaki.closeChest(); } });
await page.waitForTimeout(1200);
await page.keyboard.press('Enter'); await page.waitForTimeout(1500);
await shot('01_menu');
// stage 1 mid-run with a decent build, fast-forwarded
const ff = (secs, build) => page.evaluate(([secs, build]) => {
  const A = window.__novaki, g = A.game;
  if (build) { g.player.weapons.length = 0; for (const [id, lv, evo] of build) { const w = g.addWeapon(id); w.level = lv; w.evo = evo; } }
  for (let i = 0; i < 60 * secs; i++) {
    if (A.screen === 'levelup') { A.pickChoice(0); continue; }
    if (A.screen === 'chest') { A.navLockUntil = 0; A.closeChest(); continue; }
    if (A.screen !== 'playing') break;
    g.input.x = Math.cos(i / 140); g.input.y = Math.sin(i / 190); g.update(1 / 60);
  }
}, [secs, build]);
await page.evaluate(() => { window.NOVAKI_QA.start({ seed: 11 }); window.NOVAKI_QA.setInvincible(true); });
await ff(150, [['ember', 6, false], ['ring', 5, false], ['halo', 5, false], ['cracker', 4, false]]);
await quiet(); await page.keyboard.down('KeyD'); await page.waitForTimeout(1200); await page.keyboard.up('KeyD'); await quiet();
await shot('02_mothwood');
await page.evaluate(() => window.NOVAKI_QA.skipTo(2, 'start'));
await ff(170, [['ember', 8, true], ['whip', 6, false], ['spark', 6, false], ['boomerang', 5, false]]);
await quiet(); await page.evaluate(() => { window.__novaki.game.pickups.forEach((p) => { if (p.alive && p.kind === 'chest') window.__novaki.game.killPickup(p); }); }); await page.keyboard.down('KeyA'); await page.waitForTimeout(1200); await page.keyboard.up('KeyA'); await quiet();
await shot('03_drizzleport');
await page.evaluate(() => window.NOVAKI_QA.skipTo(3, 'boss'));
await page.evaluate(() => { const g = window.__novaki.game; g.player.weapons.length = 0; for (const [id, lv, evo] of [['ember', 8, false], ['spark', 7, false], ['halo', 6, false]]) { const w = g.addWeapon(id); w.level = lv; w.evo = evo; } });
await page.waitForTimeout(4500); await page.evaluate(() => { const g = window.__novaki.game; const b = g.boss; if (b) { g.player.x = g.player.px = b.x + 250; g.player.y = g.player.py = b.y + 30; } }); await page.waitForTimeout(900);
await shot('04_snuffer');
await page.evaluate(() => window.NOVAKI_QA.addXp(600)); await page.waitForTimeout(900);
await shot('05_levelup');
while ((await page.evaluate(() => window.NOVAKI_QA.state().screen)) === 'levelup') await page.evaluate(() => window.NOVAKI_QA.chooseUpgrade(0));
await page.evaluate(() => window.NOVAKI_QA.skipTo(1, 'boss')); await page.waitForTimeout(2500);
await page.evaluate(() => window.NOVAKI_QA.killBoss());
for (let i = 0; i < 80; i++) { const s = await page.evaluate(() => window.NOVAKI_QA.state().screen); if (s === 'stageclear') break; if (s === 'levelup') await page.evaluate(() => window.NOVAKI_QA.chooseUpgrade(0)); await page.waitForTimeout(250); }
await page.waitForTimeout(900); await shot('06_interlude');
await page.waitForTimeout(2600); await shot('07_relics');
await browser.close();
