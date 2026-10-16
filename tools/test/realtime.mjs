// Real-time full playthrough driven only by synthetic keyboard events (WASD, Space, E, digits, Enter).
// No QA helpers: the run is a normal player run from the title screen to the ending.
import fs from 'node:fs';
import { chromium } from 'playwright';
const URL = process.env.URL || 'http://localhost:4317/games/novaki/';
const OUT = process.env.OUT || 'test-results';
fs.mkdirSync(OUT, { recursive: true });
const MAXMIN = Number(process.env.MAXMIN || 26);
const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.addInitScript(() => localStorage.setItem('novaki-strike-twice-save-v1', JSON.stringify({ seenIntro: true })));
await page.goto(URL);
await page.waitForFunction(() => window.NOVAKI_QA, null, { timeout: 30000 });
await page.waitForTimeout(800);
await page.keyboard.press('Enter'); await page.waitForTimeout(700);   // title -> menu
await page.keyboard.press('Enter'); await page.waitForTimeout(700);   // Play -> loadout
await page.keyboard.press('Enter'); await page.waitForTimeout(300);   // select Ember Toss
await page.keyboard.press('Enter'); await page.waitForTimeout(500);   // Strike!
// in-page driver: every frame decide a direction (same heuristic as bot.mjs) and press keys via KeyboardEvent
await page.evaluate(() => {
  const A = window.__novaki;
  const held = new Set();
  const key = (code, down) => {
    if (down === held.has(code)) return;
    if (down) held.add(code); else held.delete(code);
    window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, bubbles: true }));
  };
  const tap = (code) => { window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true })); window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true })); };
  let lastTap = 0;
  window.__rt = { frames: 0, flares: 0, dashes: 0 };
  const step = () => {
    const g = A.game; const now = performance.now();
    window.__rt.frames++;
    if (A.screen === 'levelup' || A.screen === 'stageclear') {
      for (const c of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) key(c, false);
      if (now - lastTap > 900) { lastTap = now; tap('Digit1'); }
    } else if (A.screen === 'chest') {
      if (now - lastTap > 900) { lastTap = now; tap('Enter'); }
    } else if (A.screen === 'playing' && g.running) {
      const p = g.player;
      let bestDir = -1, bestScore = 1e9, look = 0.35, spd = p.stats.speed;
      for (let k = -1; k < 16; k++) {
        const ax = k < 0 ? 0 : Math.cos(k / 16 * Math.PI * 2), ay = k < 0 ? 0 : Math.sin(k / 16 * Math.PI * 2);
        const fx = p.x + ax * spd * look, fy = p.y + ay * spd * look; let s = 0;
        for (const e of g.enemies) { if (!e.alive || e.prop || e.intangible) continue; const dx = e.x - p.x, dy = e.y - p.y; const d0 = Math.hypot(dx, dy) || 1; if (d0 > 220) continue;
          const ex = e.x - dx / d0 * Math.min(d0, e.speed * look), ey = e.y - dy / d0 * Math.min(d0, e.speed * look); const d = Math.hypot(ex - fx, ey - fy);
          s += (e.boss ? 4 : e.elite ? 2 : 1) * (d < e.r + 16 ? 50 : 1) * 2000 / (d * d + 100); }
        for (const b of g.bullets) { if (!b.alive) continue; const bx = b.x + b.vx * look, by = b.y + b.vy * look; const d = Math.hypot(bx - fx, by - (fy - 26)); if (d > 200) continue; s += (d < b.r + 14 ? 60 : 1) * 1800 / (d * d + 60); }
        for (const t of g.teles) { if (!t.alive) continue; if (t.kind === 'circle') { if (Math.hypot(t.x - fx, t.y - fy) < t.r + 18) s += 80; } else if (t.kind === 'line') { const cx = Math.cos(t.ang), cy = Math.sin(t.ang); const rx = fx - t.x, ry = fy - t.y; const al = rx * cx + ry * cy, pe = Math.abs(-rx * cy + ry * cx); if (al > 0 && al < t.len && pe < t.w / 2 + 16) s += 80; } }
        if (g.arena) { const d = Math.hypot(fx - g.arena.x, fy - g.arena.y); if (d > g.arena.r * 0.75) s += (d - g.arena.r * 0.75) * 0.5; }
        for (const q of g.pickups) { if (!q.alive) continue; const d = Math.hypot(q.x - fx, q.y - fy); if (d < 320) s -= (q.kind === 'heal' && p.hp < p.stats.maxHp * 0.6 ? 6 : q.kind === 'chest' ? 5 : 1.2) * 30 / (d + 30); }
        if (s < bestScore) { bestScore = s; bestDir = k; }
      }
      const ax = bestDir < 0 ? 0 : Math.cos(bestDir / 16 * Math.PI * 2), ay = bestDir < 0 ? 0 : Math.sin(bestDir / 16 * Math.PI * 2);
      key('KeyD', ax > 0.38); key('KeyA', ax < -0.38); key('KeyS', ay > 0.38); key('KeyW', ay < -0.38);
      if (bestScore > 40 && p.dashCd <= 0) { tap('Space'); window.__rt.dashes++; }
      let nb = 0; for (const b of g.bullets) if (b.alive) nb++;
      if (g.flare >= 1 && (bestScore > 30 || nb > 40 || p.hp < p.stats.maxHp * 0.35)) { tap('KeyE'); window.__rt.flares++; }
    } else {
      for (const c of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) key(c, false);
    }
    if (A.screen !== 'victory' && A.screen !== 'gameover' && A.screen !== 'ending') requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
});
const t0 = Date.now(); let lastShot = 0, n = 0;
while (Date.now() - t0 < MAXMIN * 60000) {
  await page.waitForTimeout(15000);
  const s = await page.evaluate(() => { const st = window.NOVAKI_QA.state(); const A = window.__novaki; return { screen: st.screen, stage: st.stage, t: Math.round(st.time), lvl: st.player.level, hp: Math.round(st.player.hp), boss: st.boss ? st.boss.hp : null, fps: st.fps, music: window.__audio.currentMusic(), rt: window.__rt, assisted: A.game.stats.assisted }; });
  console.log(((Date.now() - t0) / 60000).toFixed(1) + 'min', JSON.stringify(s));
  if (Date.now() - lastShot > 120000) { lastShot = Date.now(); await page.screenshot({ path: `${OUT}/rt_${n++}.png` }); }
  if (s.screen === 'victory' || s.screen === 'gameover') { await page.waitForTimeout(16000); await page.screenshot({ path: `${OUT}/rt_end.png` }); break; }
}
const fin = await page.evaluate(() => window.NOVAKI_QA.state());
console.log('FINAL', JSON.stringify({ screen: fin.screen, stage: fin.stage, time: fin.time, level: fin.player.level, kills: fin.kills, meta: { coins: fin.meta.currency, unlocks: fin.meta.unlocks, wins: fin.meta.stats.wins } }));
console.log('ERRORS (' + errors.length + '):\n' + errors.slice(0, 10).join('\n'));
await browser.close();
