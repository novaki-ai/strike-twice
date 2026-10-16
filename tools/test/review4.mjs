import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan'] });
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
const base = 'http://localhost:4317/games/novaki';
// 1. a notice raised while a menu is open is shown when play resumes
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(base + '/');
  await page.waitForFunction(() => window.NOVAKI_QA, null, { timeout: 30000 });
  await page.evaluate(() => { window.NOVAKI_QA.start({ seed: 1 }); });
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  ok((await page.evaluate(() => window.__novaki.screen)) === 'paused', 'paused');
  await page.evaluate(() => { const A = window.__novaki, g = A.game; g.player.weapons[0].level = 8; g.player.passives.push({ id: 'sulfur', level: 1 }); g.recalcStats(); A.checkEvolutionReady(); });
  await page.waitForTimeout(300);
  const during = await page.evaluate(() => Array.from(document.querySelectorAll('.toast')).map((t) => t.textContent));
  ok(!during.some((t) => t.includes('ready to evolve')), 'not shown behind the pause menu');
  await page.keyboard.press('Escape'); await page.waitForTimeout(900);
  const after = await page.evaluate(() => Array.from(document.querySelectorAll('.toast')).map((t) => t.textContent));
  ok(after.some((t) => t.includes('ready to evolve')), 'shown after resuming: ' + JSON.stringify(after));
  await page.close();
}
// 2. redirect forms
for (const [path, expect] of [['/games/novaki', '/games/novaki/'], ['/games/novaki/', '/games/novaki/'], ['/games/novaki/index.html', '/games/novaki/index.html']]) {
  const page = await browser.newPage();
  await page.goto('http://localhost:4317' + path);
  await page.waitForFunction(() => window.NOVAKI_QA, null, { timeout: 30000 }).catch(() => {});
  const p = new URL(page.url()).pathname;
  ok(p === expect && (await page.evaluate(() => !!window.NOVAKI_QA)), `open ${path} -> ${p}`);
  await page.close();
}
// 3. level-up uses the slide whistle; halo/magnet/watch use the chime
{
  const page = await browser.newPage();
  await page.goto(base + '/');
  await page.waitForFunction(() => window.__audio, null, { timeout: 30000 });
  const r = await page.evaluate(() => { const au = window.__audio; au.unlock(); return { chime: !!au.sfxBuf.chime, levelup: !!au.sfxBuf.levelup }; });
  ok(r.chime && r.levelup, 'both chime and level-up sounds exist');
  await page.close();
}
await browser.close();
