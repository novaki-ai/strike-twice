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
await page.evaluate(() => { window.NOVAKI_QA.skipTo(2, 'start'); window.NOVAKI_QA.setInvincible(true); window.__novaki.clearBanners(); window.__novaki.interruptBarks(); const g = window.__novaki.game; g.director.update = () => {}; g.player.xpNext = 1e12; window.NOVAKI_QA.spawnEnemies(120); });
await page.waitForTimeout(800);
// elite
await page.evaluate(() => { const g = window.__novaki.game; g.spawnEnemy('frog', g.player.x + 160, g.player.y - 40, { elite: true }); g.spawnEnemy('raindrop', g.player.x - 180, g.player.y + 20, { elite: true }); });
await page.waitForTimeout(900);
await page.screenshot({ path: OUT + '/pk_elite.png' });
// golden match
await page.evaluate(() => { const g = window.__novaki.game; g.dropPickup('goldmatch', g.player.x, g.player.y - 20); });
await page.waitForTimeout(1200);
await page.screenshot({ path: OUT + '/pk_gold.png' });
// freeze
await page.evaluate(() => { const g = window.__novaki.game; g.dropPickup('freeze', g.player.x, g.player.y - 20); window.NOVAKI_QA.spawnEnemies(80); });
await page.waitForTimeout(1200);
await page.screenshot({ path: OUT + '/pk_freeze.png' });
// chest
await page.evaluate(() => { const g = window.__novaki.game; g.dropPickup('chest', g.player.x, g.player.y - 10); });
await page.waitForTimeout(1500);
await page.screenshot({ path: OUT + '/pk_chest.png' });
console.log('screen', await page.evaluate(() => window.NOVAKI_QA.state().screen));
console.log('ERRORS', errors.join('\n'));
await browser.close();
