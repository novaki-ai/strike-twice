import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.addInitScript(() => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', '1'); localStorage.setItem('novaki-strike-twice-save-v1', JSON.stringify({ seenIntro: true })); } });
await page.goto(process.env.URL || 'http://localhost:4317/games/novaki/');
await page.waitForFunction(() => window.NOVAKI_QA, null, { timeout: 30000 });
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
// 1. Fireproof on a fair run (no QA helpers except start)
await page.evaluate(() => {
  const A = window.__novaki, g = A.game;
  window.NOVAKI_QA.start({ seed: 3 });
  g.stats.dmgTaken = 10;
  g.stageTime = 999; // director starts the boss on the next update (fair path)
});
await page.waitForFunction(() => window.__novaki.game.boss, null, { timeout: 10000 });
await page.evaluate(() => { const b = window.__novaki.game.boss; b.boss.entry = 99; b.boss.invuln = false; window.__novaki.game.damageEnemy(b, 1e9, null, {}); });
for (let i = 0; i < 80; i++) { const s = await page.evaluate(() => window.__novaki.screen); if (s === 'stageclear') break; if (s === 'levelup') await page.evaluate(() => window.__novaki.pickChoice(0)); await page.waitForTimeout(250); }
await page.waitForTimeout(2800);
await page.evaluate(() => window.__novaki.pickRelic(0));
await page.waitForFunction(() => window.__novaki.screen === 'playing' && window.__novaki.game.stage === 2, null, { timeout: 10000 });
await page.evaluate(() => { const g = window.__novaki.game; g.player.iframes = 0; g.player.revives = 0; g.hurtPlayer(99999, null); });
await page.waitForFunction(() => window.NOVAKI_QA.state().screen === 'gameover', null, { timeout: 10000 });
const un = (await page.evaluate(() => window.NOVAKI_QA.state())).meta.unlocks;
ok(un.includes('ach_untouched'), 'Fireproof awarded after clearing stage 1 with 10 damage (unlocks: ' + un.filter((u) => u.startsWith('ach_')).join(',') + ')');
// 3. QA helpers mark runs assisted
await page.evaluate(() => { window.NOVAKI_QA.start({ seed: 4 }); });
ok(!(await page.evaluate(() => window.__novaki.game.stats.assisted)), 'fresh run not assisted');
await page.evaluate(() => window.NOVAKI_QA.setInvincible(true));
ok(await page.evaluate(() => window.__novaki.game.stats.assisted), 'setInvincible(true) marks assisted');
await page.evaluate(() => { window.NOVAKI_QA.setInvincible(false); window.NOVAKI_QA.start({ seed: 5 }); window.NOVAKI_QA.addXp(1); });
ok(await page.evaluate(() => window.__novaki.game.stats.assisted), 'addXp marks assisted');
// 4. flare not wasted during boss death
await page.evaluate(() => { window.NOVAKI_QA.skipTo(1, 'boss'); });
await page.waitForTimeout(2200);
await page.evaluate(() => { const g = window.__novaki.game; g.flare = 1; window.NOVAKI_QA.killBoss(); });
await page.waitForTimeout(300);
await page.keyboard.press('KeyE');
await page.waitForTimeout(300);
ok((await page.evaluate(() => window.__novaki.game.flare)) === 1, 'flare kept during boss death');
// 2. reduced effects toggle reflects the automatic fallback and can be turned off
await page.evaluate(() => { const A = window.__novaki; A.autoLowFx = true; A.applySettings(); });
await page.keyboard.press('Escape'); await page.waitForTimeout(400);
let scr = await page.evaluate(() => window.__novaki.screen);
if (scr !== 'paused') { await page.evaluate(() => { window.__novaki.show('playing'); window.__novaki.pause(); }); }
await page.evaluate(() => { window.__novaki.settingsBack = 'paused'; window.__novaki.show('settings'); });
await page.waitForTimeout(400);
const lowToggle = page.locator('.toggle[aria-label="Reduced effects"]');
ok(await lowToggle.evaluate((e) => e.classList.contains('on')), 'toggle shows ON while the automatic fallback is active');
await page.waitForTimeout(300);
await lowToggle.click();
await page.waitForTimeout(200);
const st = await page.evaluate(() => ({ on: document.querySelector('.toggle[aria-label="Reduced effects"]').classList.contains('on'), auto: window.__novaki.autoLowFx, user: window.__novaki.lowFxUserSet, game: window.__novaki.game.settings.lowFx, saved: window.__novaki.save.settings.lowFx }));
ok(!st.on && !st.auto && st.user && !st.game && !st.saved, 'one click turns reduced effects fully off: ' + JSON.stringify(st));
console.log('ERRORS', errors.join('\n'));
await browser.close();
