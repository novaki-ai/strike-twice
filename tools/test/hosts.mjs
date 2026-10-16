// Every request during a session must go to the game's own origin (no CDNs, fonts or analytics).
import { chromium } from 'playwright';
const URL = process.env.URL || 'http://localhost:4317/games/novaki/';
const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const origin = new globalThis.URL(URL).origin;
const foreign = [], all = [];
page.on('request', (r) => { const u = r.url(); all.push(u); if (!u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:')) foreign.push(u); });
await page.goto(URL);
await page.waitForFunction(() => window.NOVAKI_QA, null, { timeout: 30000 });
await page.keyboard.press('Enter'); await page.waitForTimeout(500);
await page.keyboard.press('Enter'); await page.waitForTimeout(3000); // intro cutscene with voice
await page.evaluate(() => { window.NOVAKI_QA.start({ seed: 1 }); window.NOVAKI_QA.setInvincible(true); });
for (const st of [1, 2, 3]) { await page.evaluate((s) => window.NOVAKI_QA.skipTo(s, 'boss'), st); await page.waitForTimeout(2500); }
await page.evaluate(() => window.NOVAKI_QA.killBoss());
await page.waitForFunction(() => window.NOVAKI_QA.state().screen === 'victory', null, { timeout: 30000 });
await page.waitForTimeout(3000);
const prefix = new globalThis.URL(URL).pathname;
const outside = all.filter((u) => u.startsWith(origin) && !new globalThis.URL(u).pathname.startsWith(prefix));
console.log('requests:', all.length, 'foreign hosts:', foreign.length, 'same host but outside the sub-path:', outside.length);
for (const u of [...foreign, ...outside].slice(0, 10)) console.log('  ', u);
await browser.close();
