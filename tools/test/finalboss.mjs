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
await page.evaluate(() => { window.NOVAKI_QA.skipTo(3, 'boss'); window.NOVAKI_QA.setInvincible(true); window.__novaki.game.player.xpNext = 1e12; });
const keys = ['KeyD', 'KeyS', 'KeyA', 'KeyW'];
let i = 0;
for (const frac of [1, 1, 0.55, 0.55, 0.55, 0.2, 0.2, 0.2]) {
  await page.evaluate((f) => { const b = window.__novaki.game.boss; if (b && b.hp > b.maxHp * f) b.hp = b.maxHp * f; }, frac);
  await page.keyboard.down(keys[i % 4]); await page.waitForTimeout(2600); await page.keyboard.up(keys[i % 4]);
  const st = await page.evaluate(() => { const b = window.__novaki.game.boss; return b ? b.boss.phase + ':' + b.boss.attack : 'none'; });
  await page.screenshot({ path: `${OUT}/fb_${i}.png` });
  console.log(i, st);
  i++;
}
console.log('ERRORS', errors.join('\n'));
await browser.close();
