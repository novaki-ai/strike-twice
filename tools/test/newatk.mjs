import { chromium } from 'playwright';
const OUT = process.env.OUT;
const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message + ' ' + e.stack));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(process.env.URL || 'http://localhost:4317/games/novaki/');
await page.waitForFunction(() => window.NOVAKI_QA, null, { timeout: 30000 });
for (const [st, atk] of [[1, 'lamplure'], [2, 'splash'], [3, 'collapse']]) {
  await page.evaluate((st) => { window.NOVAKI_QA.skipTo(st, 'boss'); window.NOVAKI_QA.setInvincible(true); window.__novaki.clearBanners(); }, st);
  await page.waitForTimeout(2600);
  await page.evaluate((atk) => { const g = window.__novaki.game; const B = g.boss.boss; g.boss.hp = g.boss.maxHp * 0.45; B.phase = atk === 'collapse' ? 3 : 2; B.attack = atk; B.at = 0; B.count = 0; B.data = {}; }, atk);
  await page.waitForTimeout(1900);
  await page.screenshot({ path: `${OUT}/atk_${atk}.png` });
  await page.waitForTimeout(2500);
  console.log(atk, 'after', await page.evaluate(() => window.__novaki.game.boss?.boss?.attack));
}
console.log('ERRORS', errors.join('\n'));
await browser.close();
