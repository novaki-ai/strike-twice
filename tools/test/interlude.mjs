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
await page.evaluate(() => { window.NOVAKI_QA.skipTo(1, 'boss'); window.NOVAKI_QA.setInvincible(true); });
await page.waitForTimeout(2500);
await page.evaluate(() => window.NOVAKI_QA.killBoss());
for (let i = 0; i < 80; i++) { const s = await page.evaluate(() => window.NOVAKI_QA.state().screen); if (s === 'stageclear') break; if (s === 'levelup') await page.evaluate(() => window.NOVAKI_QA.chooseUpgrade(0)); await page.waitForTimeout(250); }
await page.waitForTimeout(900);
await page.screenshot({ path: OUT + '/inter_a.png' });
// a click during the reveal must not pick a relic
await page.mouse.click(640, 500);
await page.waitForTimeout(2600);
await page.screenshot({ path: OUT + '/inter_b.png' });
console.log('still on stageclear after early click:', await page.evaluate(() => window.NOVAKI_QA.state().screen));
console.log('ERRORS', errors.join('\n'));
await browser.close();
