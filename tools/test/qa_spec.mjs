// Exercise NOVAKI_QA exactly as a judge harness might, without handling anything it doesn't have to.
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(process.env.URL || 'http://localhost:4317/games/novaki/');
await page.waitForFunction(() => window.NOVAKI_QA, null, { timeout: 30000 });
const Q = (f, a) => page.evaluate(f, a);
const S = () => Q(() => window.NOVAKI_QA.state());
const ok = (c, msg) => console.log((c ? 'PASS ' : 'FAIL ') + msg);
let s = await S();
ok(['title', 'menu'].includes(s.screen), 'initial screen ' + s.screen);
ok(s.meta && typeof s.meta.currency === 'number', 'meta.currency present');
await Q(() => window.NOVAKI_QA.start({ seed: 42 }));
await page.waitForTimeout(500);
s = await S();
ok(s.screen === 'playing' && s.stage === 1, 'start -> playing stage 1');
ok(typeof s.time === 'number' && s.player && typeof s.player.hp === 'number', 'state shape');
await Q(() => window.NOVAKI_QA.setInvincible(true));
const hp0 = (await S()).player.hp;
await Q(() => window.NOVAKI_QA.spawnEnemies(200));
await page.waitForTimeout(3000);
s = await S();
ok(s.enemies >= 150, 'spawnEnemies -> ' + s.enemies + ' alive');
ok(s.player.hp === hp0 || s.screen === 'levelup', 'invincible: hp unchanged (' + s.player.hp + ')');
await Q(() => window.NOVAKI_QA.addXp(100));
await page.waitForTimeout(300);
s = await S();
ok(s.screen === 'levelup', 'addXp -> levelup');
const before = s.upgrades.length;
await Q(() => window.NOVAKI_QA.chooseUpgrade(0));
await page.waitForTimeout(200);
s = await S();
ok(s.upgrades.length >= before, 'chooseUpgrade applied (' + s.upgrades.join(',') + ')');
while ((await S()).screen === 'levelup') await Q(() => window.NOVAKI_QA.chooseUpgrade(0));
for (const st of [1, 2, 3]) {
  await Q((st) => window.NOVAKI_QA.skipTo(st, 'start'), st);
  await page.waitForTimeout(300);
  s = await S();
  ok(s.stage === st && s.screen === 'playing' && !s.bossActive, `skipTo(${st},'start')`);
  await Q((st) => window.NOVAKI_QA.skipTo(st, 'boss'), st);
  await page.waitForTimeout(2500);
  s = await S();
  ok(s.stage === st && s.bossActive, `skipTo(${st},'boss') bossActive`);
}
// final boss kill -> victory without touching level-ups
ok(await Q(() => window.NOVAKI_QA.killBoss()), 'killBoss returned true');
let t0 = Date.now(), seen = new Set();
while (Date.now() - t0 < 25000) { s = await S(); seen.add(s.screen); if (s.screen === 'victory') break; await page.waitForTimeout(250); }
ok(s.screen === 'victory', 'final killBoss -> victory (screens seen: ' + [...seen].join(',') + ')');
ok(s.meta.stats.wins >= 1, 'win recorded in meta');
// stage 1 boss kill -> stage 2 (handling level-ups and relic choice through chooseUpgrade only)
await Q(() => window.NOVAKI_QA.skipTo(1, 'boss'));
await page.waitForTimeout(2000);
await Q(() => window.NOVAKI_QA.killBoss());
t0 = Date.now(); seen = new Set();
while (Date.now() - t0 < 40000) { s = await S(); seen.add(s.screen); if (s.stage === 2 && s.screen === 'playing') break; if (s.screen === 'levelup' || s.screen === 'stageclear') await Q(() => window.NOVAKI_QA.chooseUpgrade(0)); await page.waitForTimeout(250); }
ok(s.stage === 2 && s.screen === 'playing', 'stage-1 killBoss -> stage 2 (screens: ' + [...seen].join(',') + ')');
// pause
await page.keyboard.press('Escape'); await page.waitForTimeout(400);
ok((await S()).screen === 'paused', 'Escape pauses');
await page.keyboard.press('Escape'); await page.waitForTimeout(400);
ok((await S()).screen === 'playing', 'Escape resumes');
// death -> gameover
await Q(() => { window.NOVAKI_QA.setInvincible(false); const g = window.__novaki.game; g.player.iframes = 0; g.player.revives = 0; g.hurtPlayer(99999, null); });
t0 = Date.now();
while (Date.now() - t0 < 10000) { s = await S(); if (s.screen === 'gameover') break; await page.waitForTimeout(250); }
ok(s.screen === 'gameover', 'death -> gameover');
console.log('ERRORS:', errors.join('\n'));
await browser.close();
