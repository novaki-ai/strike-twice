import { chromium } from 'playwright';
const OUT = process.env.OUT;
const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(process.env.URL || 'http://localhost:4317/games/novaki/');
await page.waitForFunction(() => window.NOVAKI_QA, null, { timeout: 30000 });
await page.evaluate(() => { window.NOVAKI_QA.skipTo(1, 'start'); window.NOVAKI_QA.setInvincible(true); window.__novaki.clearBanners(); window.__novaki.interruptBarks(); const g = window.__novaki.game; g.stageTime = 150; g.player.xpNext = 1e12; window.NOVAKI_QA.spawnEnemies(150); });
await page.keyboard.down('KeyD');
await page.waitForTimeout(1500);
for (let i = 0; i < 8; i++) { await page.screenshot({ path: `${OUT}/burst_${i}.png`, clip: { x: 390, y: 160, width: 500, height: 400 } }); }
await page.keyboard.up('KeyD');
await browser.close();
