import { webkit } from 'playwright';
const browser = await webkit.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + e.stack));
await page.goto(process.env.URL || 'http://localhost:4317/games/novaki/');
await page.waitForFunction(() => window.NOVAKI_QA, null, { timeout: 60000 });
await page.evaluate(() => { window.NOVAKI_QA.start({ seed: 42 }); window.NOVAKI_QA.setInvincible(true); window.__novaki.game.player.xpNext = 1e12; });
for (let i = 0; i < 8; i++) {
  await page.waitForTimeout(500);
  console.log(JSON.stringify(await page.evaluate(() => { const A = window.__novaki; return { scr: A.screen, t: A.game.time.toFixed(2), fps: Math.round(A.fps), acc: A.acc.toFixed(3), err: A.tickErrors }; })));
}
await page.evaluate(() => { window.NOVAKI_QA.skipTo(3, 'boss'); });
await page.waitForTimeout(3000);
await page.evaluate(() => window.NOVAKI_QA.killBoss());
for (let i = 0; i < 12; i++) {
  await page.waitForTimeout(1000);
  console.log(JSON.stringify(await page.evaluate(() => { const A = window.__novaki; const g = A.game; return { scr: A.screen, t: g.time.toFixed(2), fps: Math.round(A.fps), upd: A.perfUpdate.toFixed(1), rnd: A.perfRender.toFixed(1), parts: g.particles.filter((p) => p.alive).length, lights: g.lights.length, deathT: g.boss?.boss?.deathT?.toFixed(2) }; })));
}
console.log(errors.slice(0, 10).join('\n'));
await browser.close();
