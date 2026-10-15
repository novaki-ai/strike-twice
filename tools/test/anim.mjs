import { chromium } from 'playwright';
const OUT = process.env.OUT;
const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(process.env.URL || 'http://localhost:4317/games/novaki/');
await page.waitForFunction(() => window.NOVAKI_QA, null, { timeout: 30000 });
await page.evaluate(() => {
  window.NOVAKI_QA.start({ seed: 3 }); window.NOVAKI_QA.setInvincible(true); window.__novaki.clearBanners(); window.__novaki.interruptBarks();
  const g = window.__novaki.game; g.director.update = () => {}; g.player.weapons.length = 0; g.freezeT = 0;
  const types = ['toadstool','raindrop','wateringcan','snufflet','beetle','stump','knight','frog','moth','mold','wisp','waxghost'];
  types.forEach((t, i) => { const e = g.spawnEnemy(t, -330 + (i % 6) * 130, -150 + Math.floor(i / 6) * 190); e.speed = 0; });
  for (const e of g.enemies) { e.def = { ...e.def, ai: e.def.ai === 'hop' ? 'hop' : 'prop' }; }
});
for (let k = 0; k < 3; k++) { await page.waitForTimeout(260); await page.screenshot({ path: `${OUT}/anim_${k}.png` }); }
console.log('ERRORS', errors.join('\n'));
await browser.close();
