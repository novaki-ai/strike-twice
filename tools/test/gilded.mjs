import fs from 'node:fs';
import { chromium } from 'playwright';
const OUT = process.env.OUT || 'test-results';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(process.env.URL || 'http://localhost:4317/games/novaki/');
await page.waitForFunction(() => window.NOVAKI_QA, null, { timeout: 30000 });
await page.evaluate(() => { window.NOVAKI_QA.start({ seed: 5 }); window.NOVAKI_QA.setInvincible(true); window.__novaki.clearBanners(); window.__novaki.interruptBarks(); const g = window.__novaki.game; g.player.xpNext = 1e12; g.director.runEvent({ t: 0, kind: 'gilded' }); });
await page.waitForTimeout(700);
await page.screenshot({ path: OUT + '/gilded.png' });
// escape case: wait 14s without chasing
const before = await page.evaluate(() => window.__novaki.game.enemies.filter((e) => e.alive && e.type === 'goldmoth').length);
await page.waitForTimeout(14500);
const after = await page.evaluate(() => ({ alive: window.__novaki.game.enemies.filter((e) => e.alive && e.type === 'goldmoth').length, toasts: Array.from(document.querySelectorAll('.toast')).map((t) => t.textContent) }));
console.log('gilded alive before', before, 'after 14.5s', JSON.stringify(after));
// catch case: kill it directly
await page.evaluate(() => { const g = window.__novaki.game; g.director.runEvent({ t: 0, kind: 'gilded' }); const m = g.enemies.find((e) => e.alive && e.type === 'goldmoth'); g.damageEnemy(m, 9999, null, {}); });
await page.waitForTimeout(400);
console.log('chests on ground', await page.evaluate(() => window.__novaki.game.pickups.filter((p) => p.alive && p.kind === 'chest').length));
console.log('ERRORS', errors.join('\n'));
await browser.close();
