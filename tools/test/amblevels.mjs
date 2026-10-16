import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
await page.goto(process.env.URL || 'http://localhost:4317/games/novaki/');
await page.waitForFunction(() => window.__audio, null, { timeout: 30000 });
const r = await page.evaluate(() => {
  const au = window.__audio; au.unlock();
  const out = [];
  for (const id of ['forest', 'rain', 'tower']) {
    au.ambience(id, 0.4);
    const b = au.ambBuf[id]; const d = b.getChannelData(0);
    let pk = 0, sum = 0; for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > pk) pk = v; sum += d[i] * d[i]; }
    // seam check: compare last and first samples
    out.push([id, b.duration.toFixed(2) + 's', 'peak ' + pk.toFixed(2), 'rms ' + (20 * Math.log10(Math.sqrt(sum / d.length))).toFixed(1) + ' dB', 'seam jump ' + Math.abs(d[d.length - 1] - d[0]).toFixed(3)]);
  }
  au.ambience(null);
  return out;
});
console.log(r.map((x) => x.join('  ')).join('\n'));
await browser.close();
