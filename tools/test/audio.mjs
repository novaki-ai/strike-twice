// Verify the audio engine runs: context state, music track switching, voice decoding.
import { chromium } from 'playwright';
const URL = process.env.URL || 'http://localhost:4317/games/novaki/';
const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
await page.goto(URL);
await page.waitForFunction(() => window.NOVAKI_QA, null, { timeout: 30000 });
await page.keyboard.press('Enter');
await page.waitForTimeout(2500);
const probe = () => page.evaluate(() => {
  const a = window.__novaki && window.__novakiAudio;
  return null;
});
const st = async (label) => console.log(label, JSON.stringify(await page.evaluate(() => {
  const au = window.__audio;
  return { ctx: au.ctx?.state, music: au.currentMusic(), decoded: [...au['musicBuf'].keys()], voices: [...au['voiceBuf'].keys()], sfx: Object.keys(au['sfxBuf']).length };
})));
await st('menu:');
await page.evaluate(() => { window.NOVAKI_QA.start({ seed: 2 }); });
await page.waitForTimeout(4000);
await st('stage1:');
await page.evaluate(() => { window.NOVAKI_QA.skipTo(1, 'boss'); window.NOVAKI_QA.setInvincible(true); });
await page.waitForTimeout(5000);
await st('boss1:');
console.log('ERRORS:', errors.join('\n'));
await browser.close();
