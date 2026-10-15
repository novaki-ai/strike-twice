// Equip each weapon (base L8, then evolved) alone against a crowd; screenshot + error check.
import { chromium } from 'playwright';
import fs from 'node:fs';
const URL = process.env.URL || 'http://localhost:4317/games/novaki/';
const OUT = process.env.OUT || '/tmp/shots';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + ' ' + e.stack));
await page.goto(URL);
await page.waitForFunction(() => window.NOVAKI_QA, null, { timeout: 30000 });
const ids = (process.env.IDS || 'ember,whip,ring,halo,volley,cracker,trail,aura,spark,glare,cinders,breath,boomerang,sentry').split(',');
const results = [];
for (const id of ids) {
  for (const evo of [false, true]) {
    await page.evaluate(([id, evo]) => {
      const Q = window.NOVAKI_QA; Q.start({ seed: 5 }); Q.setInvincible(true); window.__novaki.clearBanners(); window.__novaki.interruptBarks();
      const g = window.__novaki.game;
      g.director.update = () => {}; g.player.xpNext = 1e12;
      g.player.weapons.length = 0;
      const w = g.addWeapon(id); w.level = 8; w.evo = evo;
      for (let i = 0; i < 70; i++) { const a = Math.random() * 6.28, r = 90 + Math.random() * 300; g.spawnEnemy(['mold', 'moth', 'stump', 'toadstool'][i % 4], Math.cos(a) * r, Math.sin(a) * r, { hpMul: 4 }); }
    }, [id, evo]);
    await page.waitForTimeout(300);
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(1400);
    await page.keyboard.up('KeyD');
    await page.keyboard.down('KeyS');
    await page.waitForTimeout(1200);
    await page.keyboard.up('KeyS');
    await page.screenshot({ path: `${OUT}/w_${id}${evo ? '_evo' : ''}.png` });
    const r = await page.evaluate(() => { const g = window.__novaki.game; return { dmg: Math.round(g.player.weapons[0].dmg), kills: g.stats.kills, fps: window.NOVAKI_QA.state().fps }; });
    results.push(`${id}${evo ? '*' : ' '} dmg=${r.dmg} kills=${r.kills} fps=${r.fps}`);
  }
}
console.log(results.join('\n'));
console.log('ERRORS:', errors.join('\n'));
await browser.close();
