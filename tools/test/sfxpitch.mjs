// Estimate the pitch over time of a synthesized sound (zero-crossing rate), to check a glide without listening.
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
await page.goto(process.env.URL || 'http://localhost:4317/games/novaki/');
await page.waitForFunction(() => window.__audio, null, { timeout: 30000 });
const r = await page.evaluate((name) => {
  const au = window.__audio; au.unlock();
  const b = au.sfxBuf[name]; const d = b.getChannelData(0); const sr = b.sampleRate;
  const out = []; const win = Math.floor(sr * 0.04);
  for (let i = 0; i + win < d.length; i += win) {
    let zc = 0, e = 0;
    for (let j = i + 1; j < i + win; j++) { if ((d[j - 1] < 0) !== (d[j] < 0)) zc++; e += d[j] * d[j]; }
    out.push(`${(i / sr).toFixed(2)}s ~${Math.round((zc / 2) / (win / sr))}Hz rms ${(Math.sqrt(e / win)).toFixed(3)}`);
  }
  let pk = 0; for (const v of d) pk = Math.max(pk, Math.abs(v));
  return { peak: pk.toFixed(2), frames: out.slice(0, 14) };
}, process.env.SFX || 'levelup');
console.log('peak', r.peak); console.log(r.frames.join('\n'));
await browser.close();
