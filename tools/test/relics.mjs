import { chromium } from 'playwright';
const URL = process.env.URL || 'http://localhost:4317/games/novaki/';
const OUT = process.env.OUT;
const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(URL);
await page.waitForFunction(() => window.NOVAKI_QA, null, { timeout: 30000 });
const Q = (f, a) => page.evaluate(f, a);
await Q(() => { window.NOVAKI_QA.skipTo(2, 'boss'); window.NOVAKI_QA.setInvincible(true); });
// wait for an attack pose
for (let i = 0; i < 40; i++) { const a = await Q(() => window.__novaki.game.boss?.boss?.attack); if (a === 'umbrella' || a === 'lightning' || a === 'downpour') break; await page.waitForTimeout(250); }
await page.screenshot({ path: OUT + '/rel_bossatk.png' });
await Q(() => window.NOVAKI_QA.killBoss());
await page.waitForTimeout(1200);
await page.screenshot({ path: OUT + '/rel_bossko.png' });
for (let i = 0; i < 80; i++) { const s = await Q(() => window.NOVAKI_QA.state().screen); if (s === 'stageclear') break; if (s === 'levelup') await Q(() => window.NOVAKI_QA.chooseUpgrade(0)); await page.waitForTimeout(250); }
await page.waitForTimeout(800);
await page.screenshot({ path: OUT + '/rel_choice.png' });
const st = await Q(() => window.NOVAKI_QA.state());
console.log('relic choices', st.relicChoices);
const picked = await Q(() => window.NOVAKI_QA.chooseUpgrade(1));
console.log('picked', picked);
for (let i = 0; i < 40; i++) { const s = await Q(() => window.NOVAKI_QA.state()); if (s.screen === 'playing' && s.stage === 3) break; if (s.screen === 'levelup') await Q(() => window.NOVAKI_QA.chooseUpgrade(0)); await page.waitForTimeout(250); }
const st2 = await Q(() => window.NOVAKI_QA.state());
console.log('now', st2.screen, st2.stage, st2.relics, st2.upgrades.filter((u) => u.startsWith('relic')));
console.log('ERRORS', errors.join('\n'));
await browser.close();
