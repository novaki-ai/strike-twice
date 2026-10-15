// Stage clear + death sequence screenshots.
import { chromium } from 'playwright';
const URL = process.env.URL || 'http://localhost:4317/games/novaki/';
const OUT = process.env.OUT;
const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(URL);
await page.waitForFunction(() => window.NOVAKI_QA, null, { timeout: 30000 });
await page.evaluate(() => { window.NOVAKI_QA.skipTo(1, 'boss'); window.NOVAKI_QA.setInvincible(true); });
await page.waitForTimeout(2500);
await page.screenshot({ path: OUT + '/f_boss1.png' });
await page.evaluate(() => window.NOVAKI_QA.killBoss());
for (let i = 0; i < 60; i++) { const s = await page.evaluate(() => window.NOVAKI_QA.state().screen); if (s === 'stageclear') break; if (s === 'levelup') await page.evaluate(() => window.NOVAKI_QA.chooseUpgrade(0)); await page.waitForTimeout(300); }
await page.waitForTimeout(600);
await page.screenshot({ path: OUT + '/f_stageclear.png' });
for (let i = 0; i < 60; i++) { const s = await page.evaluate(() => window.NOVAKI_QA.state()); if (s.screen === 'playing' && s.stage === 2) break; if (s.screen === 'levelup' || s.screen === 'stageclear') await page.evaluate(() => window.NOVAKI_QA.chooseUpgrade(0)); await page.waitForTimeout(300); }
console.log('auto-advanced to stage 2:', JSON.stringify((await page.evaluate(() => window.NOVAKI_QA.state())).stage));
await page.evaluate(() => { const g = window.__novaki.game; window.NOVAKI_QA.setInvincible(false); g.player.iframes = 0; g.player.revives = 0; g.hurtPlayer(9999, null); });
await page.waitForFunction(() => !window.__novaki.game.running, null, { timeout: 20000 });
await page.waitForTimeout(900);
await page.screenshot({ path: OUT + '/f_death.png' });
await page.waitForFunction(() => window.NOVAKI_QA.state().screen === 'gameover', null, { timeout: 20000 });
console.log('ERRORS:', errors.join('\n'));
await browser.close();
