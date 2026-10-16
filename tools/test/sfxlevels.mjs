import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
await page.goto(process.env.URL || 'http://localhost:4317/games/novaki/');
await page.waitForFunction(() => window.__audio, null, { timeout: 30000 });
const r = await page.evaluate(() => {
  const au = window.__audio; au.unlock();
  const out = [];
  for (const [name, b] of Object.entries(au.sfxBuf)) {
    const d = b.getChannelData(0); let pk = 0, sum = 0;
    for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > pk) pk = v; sum += d[i] * d[i]; }
    out.push([name, pk.toFixed(2), (20 * Math.log10(Math.sqrt(sum / d.length) + 1e-9)).toFixed(1), b.duration.toFixed(2)]);
  }
  return out;
});
console.log(r.map((x) => x.join('\t')).join('\n'));
await browser.close();
