import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const msgs = [];
page.on('console', (m) => { if (m.type() !== 'log' && m.type() !== 'debug') msgs.push(m.type() + ': ' + m.text().slice(0, 160)); });
page.on('pageerror', (e) => msgs.push('pageerror: ' + e.message));
await page.goto(process.env.URL || 'http://localhost:4317/games/novaki/');
await page.waitForFunction(() => window.NOVAKI_QA, null, { timeout: 30000 });
await page.keyboard.press('Enter'); await page.waitForTimeout(500);
await page.keyboard.press('Enter'); await page.waitForTimeout(3000);
await page.keyboard.press('Escape'); await page.waitForTimeout(500);
await page.keyboard.press('Enter'); await page.waitForTimeout(300); await page.keyboard.press('Enter');
for (let i = 0; i < 8; i++) { await page.keyboard.down(['KeyD', 'KeyS', 'KeyA', 'KeyW'][i % 4]); await page.waitForTimeout(1500); await page.keyboard.up(['KeyD', 'KeyS', 'KeyA', 'KeyW'][i % 4]); if ((await page.evaluate(() => window.NOVAKI_QA.state().screen)) === 'levelup') await page.keyboard.press('Digit1'); }
for (const st of [2, 3]) { await page.evaluate((s) => window.NOVAKI_QA.skipTo(s, 'boss'), st); await page.waitForTimeout(3000); }
console.log([...new Set(msgs)].join('\n') || 'no warnings or errors');
await browser.close();
