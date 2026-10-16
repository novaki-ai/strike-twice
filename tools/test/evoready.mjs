import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(process.env.URL || 'http://localhost:4317/games/novaki/');
await page.waitForFunction(() => window.NOVAKI_QA, null, { timeout: 30000 });
await page.evaluate(() => { window.NOVAKI_QA.start({ seed: 1 }); const g = window.__novaki.game; g.player.weapons[0].level = 7; g.player.passives.push({ id: 'sulfur', level: 1 }); g.recalcStats(); });
// level up and pick the Ember Toss upgrade to reach level 8
await page.evaluate(() => window.NOVAKI_QA.addXp(20));
await page.waitForTimeout(400);
const idx = await page.evaluate(() => window.__novaki.choices.findIndex((c) => c.id === 'ember'));
console.log('ember offered at index', idx);
if (idx >= 0) await page.evaluate((i) => window.NOVAKI_QA.chooseUpgrade(i), idx);
await page.waitForTimeout(300);
console.log('toasts:', await page.evaluate(() => Array.from(document.querySelectorAll('.toast')).map((t) => t.textContent)));
console.log('ERRORS', errors.join('\n'));
await browser.close();
