// Geometry check of the scaled HUD / level-up UI on a large viewport in every engine.
import { chromium, webkit, firefox } from 'playwright';
const which = (process.env.BROWSERS || 'chromium,webkit,firefox').split(',');
for (const name of which) {
  const bt = { chromium, webkit, firefox }[name];
  const browser = await bt.launch(name === 'chromium' ? { args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan'] } : {});
  const page = await browser.newPage({ viewport: { width: 2560, height: 1440 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(process.env.URL || 'http://localhost:4317/games/novaki/');
  await page.waitForFunction(() => window.NOVAKI_QA, null, { timeout: 60000 });
  await page.evaluate(() => { window.NOVAKI_QA.start({ seed: 1 }); window.__novaki.game.player.invincible = true; });
  await page.waitForTimeout(800);
  const hud = await page.evaluate(() => {
    const r = (sel) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; };
    return { scale: getComputedStyle(document.documentElement).getPropertyValue('--ui-scale'), hp: r('.hpbar'), timer: r('.timer'), kills: r('.hud-right'), xp: r('.xpbar'), pause: r('.pause-btn') };
  });
  await page.evaluate(() => window.NOVAKI_QA.addXp(30));
  await page.waitForTimeout(700);
  const lu = await page.evaluate(() => { const b = (sel) => { const e = document.querySelector(sel); const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; }; return { cards: b('#levelup .cards'), h1: b('#levelup h1'), card0: b('#levelup .card') }; });
  await page.screenshot({ path: `test-results/uiscale_${name}.png` });
  // clicking a card must still work under zoom
  const c = lu.card0; await page.mouse.click(c[0] + c[2] / 2, c[1] + c[3] / 2); await page.waitForTimeout(500);
  const scr = await page.evaluate(() => window.NOVAKI_QA.state().screen);
  console.log(name, JSON.stringify(hud), JSON.stringify(lu), 'after card click:', scr, 'errors:', errors.length);
  await browser.close();
}
