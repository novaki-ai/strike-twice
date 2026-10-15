/** Procedurally synthesized sound effects, rendered once into sample arrays. */
type Gen = (sr: number) => Float32Array;

const TAU = Math.PI * 2;

function env(t: number, a: number, d: number, sustain = 0, rel = 0, len = a + d): number {
  if (t < a) return t / a;
  if (t < a + d) return 1 - (1 - sustain) * ((t - a) / d);
  if (rel > 0 && t < len + rel) return sustain * (1 - (t - len) / rel);
  return sustain;
}

class Noise {
  s = 12345;
  next() {
    this.s = (this.s * 1103515245 + 12345) & 0x7fffffff;
    return (this.s / 0x7fffffff) * 2 - 1;
  }
}

/** one-pole lowpass helper */
class LP {
  y = 0;
  step(x: number, a: number) {
    this.y += a * (x - this.y);
    return this.y;
  }
}

function make(dur: number, sr: number, fn: (t: number, i: number) => number): Float32Array {
  const n = Math.floor(dur * sr);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = fn(i / sr, i);
  // tiny fade out to avoid clicks
  const f = Math.min(n, Math.floor(0.004 * sr));
  for (let i = 0; i < f; i++) out[n - 1 - i] *= i / f;
  return out;
}

const sq = (p: number) => (Math.sin(p) >= 0 ? 1 : -1);
const saw = (p: number) => ((p / TAU) % 1) * 2 - 1;
const tri = (p: number) => 1 - 4 * Math.abs(Math.round(p / TAU - 0.25) - (p / TAU - 0.25));

export const SFX: Record<string, Gen> = {
  shoot: (sr) => {
    const nz = new Noise(); const lp = new LP(); let ph = 0;
    return make(0.12, sr, (t) => {
      const f = 900 - 5000 * t;
      ph += (TAU * Math.max(120, f)) / sr;
      const e = env(t, 0.003, 0.11);
      return (Math.sin(ph) * 0.35 + lp.step(nz.next(), 0.3) * 0.5) * e * 0.5;
    });
  },
  hit: (sr) => {
    const nz = new Noise(); const lp = new LP(); let ph = 0;
    return make(0.09, sr, (t) => {
      ph += (TAU * (260 - 1600 * t)) / sr;
      const e = env(t, 0.002, 0.085);
      return (Math.sin(ph) * 0.6 + lp.step(nz.next(), 0.5) * 0.4) * e * 0.55;
    });
  },
  kill: (sr) => {
    const nz = new Noise(); const lp = new LP(); let ph = 0;
    return make(0.22, sr, (t) => {
      ph += (TAU * (520 * Math.exp(-t * 14) + 70)) / sr;
      const e = env(t, 0.002, 0.2);
      return (Math.sin(ph) * 0.55 + lp.step(nz.next(), 0.22) * 0.6 * Math.exp(-t * 18)) * e * 0.6;
    });
  },
  xp: (sr) => {
    let ph = 0;
    return make(0.09, sr, (t) => {
      ph += (TAU * (1300 + t * 4000)) / sr;
      return Math.sin(ph) * env(t, 0.002, 0.085) * 0.28;
    });
  },
  coin: (sr) => {
    let ph = 0;
    return make(0.3, sr, (t) => {
      const f = t < 0.07 ? 1568 : 2093;
      ph += (TAU * f) / sr;
      return (sq(ph) * 0.15 + Math.sin(ph) * 0.3) * env(t < 0.07 ? t : t - 0.07, 0.002, t < 0.07 ? 0.07 : 0.22) * 0.5;
    });
  },
  levelup: (sr) => {
    const notes = [523, 659, 784, 1047, 1319];
    return make(0.9, sr, (t) => {
      let v = 0;
      for (let k = 0; k < notes.length; k++) {
        const st = k * 0.075;
        if (t >= st) {
          const tt = t - st;
          v += (Math.sin(TAU * notes[k] * tt) * 0.6 + tri(TAU * notes[k] * 2 * tt) * 0.15) * Math.exp(-tt * 4.5);
        }
      }
      return v * 0.22;
    });
  },
  hurt: (sr) => {
    const nz = new Noise(); let ph = 0;
    return make(0.28, sr, (t) => {
      ph += (TAU * (300 - 600 * t)) / sr;
      const e = env(t, 0.004, 0.27);
      return (sq(ph) * 0.3 + nz.next() * 0.25 * Math.exp(-t * 20)) * e * 0.55;
    });
  },
  dash: (sr) => {
    const nz = new Noise(); const lp = new LP();
    return make(0.25, sr, (t) => {
      const a = 0.05 + 0.5 * Math.sin(Math.PI * Math.min(1, t / 0.25));
      return lp.step(nz.next(), a * 0.5) * env(t, 0.03, 0.22) * 0.7;
    });
  },
  explode: (sr) => {
    const nz = new Noise(); const lp = new LP(); const lp2 = new LP(); let ph = 0;
    return make(0.7, sr, (t) => {
      ph += (TAU * (90 * Math.exp(-t * 6) + 35)) / sr;
      const n = lp.step(nz.next(), 0.12 * Math.exp(-t * 3) + 0.02);
      return (lp2.step(n, 0.5) * 1.3 + Math.sin(ph) * 0.7 * Math.exp(-t * 7)) * env(t, 0.003, 0.69) * 0.75;
    });
  },
  zap: (sr) => {
    let ph = 0; const nz = new Noise();
    return make(0.16, sr, (t, i) => {
      const f = 800 + (i % 97 < 40 ? 900 : -200) + nz.next() * 300;
      ph += (TAU * f) / sr;
      return saw(ph) * env(t, 0.002, 0.15) * 0.22;
    });
  },
  whip: (sr) => {
    const nz = new Noise(); const lp = new LP();
    return make(0.22, sr, (t) => {
      const a = t < 0.12 ? 0.05 + t * 5 : 0.9;
      const crack = t > 0.12 && t < 0.16 ? nz.next() * 0.9 : 0;
      return (lp.step(nz.next(), Math.min(0.95, a)) * 0.5 * env(t, 0.06, 0.16) + crack * Math.exp(-(t - 0.12) * 60));
    });
  },
  ring: (sr) => {
    const nz = new Noise(); const lp = new LP();
    return make(0.4, sr, (t) => lp.step(nz.next(), 0.06) * env(t, 0.05, 0.35) * 1.4);
  },
  chest: (sr) => {
    const notes = [392, 523, 659, 784, 1047];
    return make(1.3, sr, (t) => {
      let v = 0;
      for (let k = 0; k < notes.length; k++) {
        const st = k * 0.12;
        if (t >= st) {
          const tt = t - st;
          v += (sq(TAU * notes[k] * tt) * 0.12 + Math.sin(TAU * notes[k] * tt) * 0.5) * Math.exp(-tt * 3);
        }
      }
      return v * 0.2;
    });
  },
  warning: (sr) => {
    let ph = 0;
    return make(1.2, sr, (t) => {
      const f = Math.floor(t / 0.15) % 2 ? 440 : 330;
      ph += (TAU * f) / sr;
      return sq(ph) * 0.18 * (t % 0.15 < 0.12 ? 1 : 0) * env(t, 0.01, 1.19, 0.4);
    });
  },
  heal: (sr) => {
    let ph = 0;
    return make(0.5, sr, (t) => {
      ph += (TAU * (600 + 900 * t)) / sr;
      return (Math.sin(ph) * 0.4 + Math.sin(ph * 2) * 0.1) * env(t, 0.02, 0.48) * 0.4;
    });
  },
  click: (sr) => {
    let ph = 0;
    return make(0.05, sr, (t) => {
      ph += (TAU * 1800) / sr;
      return Math.sin(ph) * Math.exp(-t * 90) * 0.35;
    });
  },
  hover: (sr) => {
    let ph = 0;
    return make(0.04, sr, (t) => {
      ph += (TAU * 1200) / sr;
      return Math.sin(ph) * Math.exp(-t * 110) * 0.18;
    });
  },
  back: (sr) => {
    let ph = 0;
    return make(0.1, sr, (t) => {
      ph += (TAU * (900 - 4000 * t)) / sr;
      return tri(ph) * env(t, 0.002, 0.095) * 0.3;
    });
  },
  eshoot: (sr) => {
    let ph = 0;
    return make(0.14, sr, (t) => {
      ph += (TAU * (700 - 3000 * t)) / sr;
      return sq(ph) * env(t, 0.002, 0.13) * 0.12;
    });
  },
  splash: (sr) => {
    const nz = new Noise(); const lp = new LP(); const hp = new LP();
    return make(0.45, sr, (t) => {
      const n = nz.next();
      const b = lp.step(n, 0.35) - hp.step(n, 0.05);
      return b * env(t, 0.004, 0.44) * 0.9 * (1 + 0.5 * Math.sin(t * 90));
    });
  },
  thunder: (sr) => {
    const nz = new Noise(); const lp = new LP(); const lp2 = new LP();
    return make(1.4, sr, (t) => {
      const crack = t < 0.08 ? nz.next() * (1 - t / 0.08) : 0;
      return (lp2.step(lp.step(nz.next(), 0.05), 0.3) * 2.6 * (0.6 + 0.4 * Math.sin(t * 23)) + crack * 0.6) * env(t, 0.005, 1.39);
    });
  },
  strike: (sr) => {
    // match strike: scratch then whoomp
    const nz = new Noise(); const lp = new LP(); let ph = 0;
    return make(0.9, sr, (t) => {
      let v = 0;
      if (t < 0.22) v += nz.next() * 0.35 * (0.5 + 0.5 * Math.sin(t * 300)) * env(t, 0.01, 0.21);
      if (t > 0.18) {
        const tt = t - 0.18;
        ph += (TAU * (120 + 200 * Math.exp(-tt * 8))) / sr;
        v += (lp.step(nz.next(), 0.08) * 1.2 + Math.sin(ph) * 0.3) * env(tt, 0.03, 0.6);
      }
      return v * 0.7;
    });
  },
  stageclear: (sr) => {
    const seq = [[523, 0], [659, 0.12], [784, 0.24], [1047, 0.36], [784, 0.54], [1047, 0.66]];
    return make(1.6, sr, (t) => {
      let v = 0;
      for (const [f, st] of seq) {
        if (t >= st) {
          const tt = t - st;
          v += (Math.sin(TAU * f * tt) * 0.5 + sq(TAU * f * tt) * 0.08) * Math.exp(-tt * 3.2);
        }
      }
      return v * 0.25;
    });
  },
  roar: (sr) => {
    const nz = new Noise(); const lp = new LP(); let p1 = 0, p2 = 0;
    return make(1.2, sr, (t) => {
      const f = 70 + 30 * Math.sin(t * 9);
      p1 += (TAU * f) / sr;
      p2 += (TAU * f * 1.51) / sr;
      return (saw(p1) * 0.35 + saw(p2) * 0.25 + lp.step(nz.next(), 0.1) * 0.6) * env(t, 0.08, 1.1) * 0.6;
    });
  },
  bossdie: (sr) => {
    const nz = new Noise(); const lp = new LP(); let ph = 0;
    return make(2.2, sr, (t) => {
      ph += (TAU * (200 * Math.exp(-t * 1.5) + 30)) / sr;
      return (lp.step(nz.next(), 0.06 + 0.1 * Math.exp(-t)) * 1.6 + saw(ph) * 0.25) * env(t, 0.01, 2.19);
    });
  },
  flame: (sr) => {
    const nz = new Noise(); const lp = new LP(); const lp2 = new LP();
    return make(0.3, sr, (t) => lp2.step(lp.step(nz.next(), 0.2), 0.4) * env(t, 0.03, 0.27) * 1.3);
  },
  pop: (sr) => {
    let ph = 0;
    return make(0.08, sr, (t) => {
      ph += (TAU * (400 + 2200 * t)) / sr;
      return Math.sin(ph) * env(t, 0.002, 0.075) * 0.4;
    });
  },
  tick: (sr) => {
    let ph = 0;
    return make(0.03, sr, (t) => {
      ph += (TAU * 2400) / sr;
      return sq(ph) * Math.exp(-t * 150) * 0.12;
    });
  },
  revive: (sr) => {
    let ph = 0;
    return make(1.4, sr, (t) => {
      ph += (TAU * (200 + 800 * t)) / sr;
      return (Math.sin(ph) * 0.4 + Math.sin(ph * 1.5) * 0.2) * env(t, 0.1, 1.3) * 0.5;
    });
  },
  slam: (sr) => {
    const nz = new Noise(); const lp = new LP(); let ph = 0;
    return make(0.6, sr, (t) => {
      ph += (TAU * (60 + 80 * Math.exp(-t * 10))) / sr;
      return (Math.sin(ph) * 0.9 * Math.exp(-t * 5) + lp.step(nz.next(), 0.15) * Math.exp(-t * 8)) * 0.8;
    });
  },
  buzz: (sr) => {
    let ph = 0;
    return make(0.5, sr, (t) => {
      ph += (TAU * (180 + 20 * Math.sin(t * 60))) / sr;
      return saw(ph) * env(t, 0.05, 0.45) * 0.15;
    });
  },
};

/** Seamless ambience loops (rendered once). The tail is crossfaded into the head so the loop has no seam. */
function loopify(data: Float32Array, sr: number, xf = 0.5): Float32Array {
  const n = data.length, x = Math.floor(xf * sr);
  const out = new Float32Array(n - x);
  for (let i = 0; i < out.length; i++) out[i] = data[i];
  for (let i = 0; i < x; i++) {
    const t = i / x;
    out[i] = data[i] * t + data[n - x + i] * (1 - t);
  }
  return out;
}

export const AMBIENCE: Record<string, Gen> = {
  // dusk forest: soft wind bed + cricket trills
  forest: (sr) => {
    const nz = new Noise(); const lp = new LP(); const lp2 = new LP();
    const dur = 8;
    const crickets: [number, number, number][] = [];
    let ct = 0.2;
    while (ct < dur) { crickets.push([ct, 4200 + (nz.next() + 1) * 600, 0.25 + (nz.next() + 1) * 0.25]); ct += 0.35 + (nz.next() + 1) * 0.9; }
    let ci = 0;
    const d = make(dur + 0.5, sr, (t) => {
      let v = lp2.step(lp.step(nz.next(), 0.02), 0.2) * 0.6 * (0.7 + 0.3 * Math.sin(t * 0.7));
      while (ci < crickets.length && crickets[ci][0] + crickets[ci][2] < t) ci++;
      for (let k = ci; k < crickets.length && crickets[k][0] <= t; k++) {
        const [st, f, len] = crickets[k];
        if (t < st + len) {
          const tt = t - st;
          const chirp = Math.sin(TAU * f * tt) * (Math.sin(TAU * 28 * tt) > 0 ? 1 : 0) * Math.sin(Math.PI * tt / len);
          v += chirp * 0.05;
        }
      }
      return v;
    });
    return loopify(d, sr);
  },
  // rain: dense filtered noise + random drips
  rain: (sr) => {
    const nz = new Noise(); const lp = new LP(); const hp = new LP();
    const dur = 6;
    const drips: [number, number][] = [];
    let dt = 0.05;
    while (dt < dur) { drips.push([dt, 900 + (nz.next() + 1) * 900]); dt += 0.05 + (nz.next() + 1) * 0.18; }
    let di = 0;
    const d = make(dur + 0.5, sr, (t) => {
      const n = nz.next();
      let v = (lp.step(n, 0.35) - hp.step(n, 0.04)) * 0.5;
      while (di < drips.length && drips[di][0] + 0.04 < t) di++;
      for (let k = di; k < drips.length && drips[k][0] <= t; k++) {
        const [st, f] = drips[k];
        const tt = t - st; v += Math.sin(TAU * f * tt * (1 + tt * 8)) * Math.exp(-tt * 90) * 0.12;
      }
      return v;
    });
    return loopify(d, sr);
  },
  // tower: moaning wind with a slow sweep and a far-off bell toll
  tower: (sr) => {
    const nz = new Noise(); const bp1 = new LP(); const bp2 = new LP();
    const dur = 10;
    const d = make(dur + 0.5, sr, (t) => {
      const sweep = 0.015 + 0.012 * Math.sin(t * 0.6) + 0.006 * Math.sin(t * 1.7);
      const n = nz.next();
      let v = (bp1.step(n, sweep * 3) - bp2.step(n, sweep)) * 3.2 * (0.6 + 0.4 * Math.sin(t * 0.45));
      const bt = t - 3.2;
      if (bt > 0 && bt < 5) v += (Math.sin(TAU * 196 * bt) * 0.6 + Math.sin(TAU * 293 * bt) * 0.25 + Math.sin(TAU * 523 * bt) * 0.12) * Math.exp(-bt * 0.9) * 0.08;
      return v;
    });
    return loopify(d, sr);
  },
};
