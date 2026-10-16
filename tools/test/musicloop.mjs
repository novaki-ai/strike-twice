// Real-time check that music playlists keep advancing (crossfade scheduler) over > 1 minute.
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
await page.goto(process.env.URL || 'http://localhost:4317/games/novaki/');
await page.waitForFunction(() => window.NOVAKI_QA, null, { timeout: 30000 });
await page.keyboard.press('Enter');
await page.evaluate(() => { window.NOVAKI_QA.start({ seed: 3 }); window.NOVAKI_QA.setInvincible(true); });
for (let i = 0; i < 8; i++) {
  await page.waitForTimeout(10000);
  const s = await page.evaluate(() => { const au = window.__audio; const tr = au.track; return { music: au.currentMusic(), clip: tr ? tr.clips[tr.idx] : null, at: au.ctx.currentTime.toFixed(1), screen: window.NOVAKI_QA.state().screen }; });
  if (s.screen === 'levelup') await page.evaluate(() => window.NOVAKI_QA.chooseUpgrade(0));
  console.log(JSON.stringify(s));
}
console.log('ERRORS', errors.join('\n'));
await browser.close();
