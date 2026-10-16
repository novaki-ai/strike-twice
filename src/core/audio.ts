/** WebAudio engine: crossfaded music playlists, voice lines with ducking, synthesized SFX. */
import { SFX, AMBIENCE } from './sfx';

const XF = 2.0; // music crossfade seconds
const MAX_DECODED_MUSIC = 6;

interface Track {
  id: string;
  clips: string[];
  idx: number;
  src: AudioBufferSourceNode | null;
  gain: GainNode | null;
  startAt: number;
  dur: number;
  nextScheduled: boolean;
  dead: boolean;
}

export class AudioSys {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private duck!: GainNode;
  private sfxBus!: GainNode;
  private voiceBus!: GainNode;
  private sfxBuf: Record<string, AudioBuffer> = {};
  private musicBuf = new Map<string, AudioBuffer>();
  private musicLru: string[] = [];
  private voiceBuf = new Map<string, AudioBuffer>();
  private loading = new Map<string, Promise<AudioBuffer | null>>();
  private track: Track | null = null;
  private sfxLast: Record<string, number> = {};
  private sfxActive: Record<string, number> = {};
  private voiceSrc: AudioBufferSourceNode | null = null;
  private ambBuf: Record<string, AudioBuffer> = {};
  private amb: { id: string; src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private voiceToken = 0;
  private voiceDone: (() => void) | null = null;
  vol = { music: 0.7, sfx: 0.8, voice: 1 };
  muted = false;
  base = './assets/';

  constructor() {
    setInterval(() => this.schedule(), 200);
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend().catch(() => {});
      else this.ctx.resume().catch(() => {});
    });
  }

  /** Must be called from a user gesture. */
  unlock() {
    try {
      // Safari 17+: play through the ringer/silent switch like a media app
      const nav = navigator as any;
      if (nav.audioSession && nav.audioSession.type !== 'playback') nav.audioSession.type = 'playback';
    } catch { /* not supported */ }
    if (!this.ctx) {
      const AC: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC({ latencyHint: 'interactive' });
      const c = this.ctx;
      this.master = c.createGain();
      this.master.connect(c.destination);
      // gentle limiter so stacked SFX don't clip
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -10;
      comp.knee.value = 8;
      comp.ratio.value = 6;
      comp.attack.value = 0.003;
      comp.release.value = 0.15;
      comp.connect(this.master);
      this.musicBus = c.createGain();
      this.duck = c.createGain();
      this.musicBus.connect(this.duck);
      this.duck.connect(this.master);
      this.sfxBus = c.createGain();
      this.sfxBus.connect(comp);
      this.voiceBus = c.createGain();
      this.voiceBus.connect(this.master);
      this.applyVolumes();
      this.buildSfx();
    }
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
  }

  setVolumes(music: number, sfx: number, voice: number) {
    this.vol = { music, sfx, voice };
    this.applyVolumes();
  }

  private applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    // perceptual curve
    this.musicBus.gain.setTargetAtTime(Math.pow(this.vol.music, 1.6) * 0.8, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(Math.pow(this.vol.sfx, 1.6) * 0.9, t, 0.05);
    this.voiceBus.gain.setTargetAtTime(Math.pow(this.vol.voice, 1.4) * 1.0, t, 0.05);
  }

  private buildSfx() {
    const c = this.ctx!;
    const sr = c.sampleRate;
    for (const [name, gen] of Object.entries(SFX)) {
      try {
        const data = gen(sr);
        const b = c.createBuffer(1, data.length, sr);
        b.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
        this.sfxBuf[name] = b;
      } catch (e) {
        console.warn('sfx build failed', name, e);
      }
    }
  }

  /** Looping synthesized ambience (on the sound bus). Pass null to fade it out. */
  ambience(id: string | null, vol = 0.5) {
    const c = this.ctx;
    if (!c) return;
    if (this.amb && this.amb.id === id) return;
    const t = c.currentTime;
    if (this.amb) {
      const old = this.amb;
      old.gain.gain.cancelScheduledValues(t);
      old.gain.gain.setValueAtTime(old.gain.gain.value, t);
      old.gain.gain.linearRampToValueAtTime(0.0001, t + 1.5);
      try { old.src.stop(t + 1.6); } catch { /* ignore */ }
      this.amb = null;
    }
    if (!id || !AMBIENCE[id]) return;
    let b = this.ambBuf[id];
    if (!b) {
      const data = AMBIENCE[id](c.sampleRate);
      b = c.createBuffer(1, data.length, c.sampleRate);
      b.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
      this.ambBuf[id] = b;
    }
    const src = c.createBufferSource();
    src.buffer = b;
    src.loop = true;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 2);
    src.connect(g);
    g.connect(this.sfxBus);
    src.start();
    this.amb = { id, src, gain: g };
  }

  /** Play a synthesized sound. Throttled per sound so hordes don't explode the mixer. */
  sfx(name: string, vol = 1, pitch = 1, minGap = 0.035) {
    const c = this.ctx;
    if (!c || c.state !== 'running') return;
    const b = this.sfxBuf[name];
    if (!b) return;
    const now = c.currentTime;
    if (now - (this.sfxLast[name] || -1) < minGap) return;
    if ((this.sfxActive[name] || 0) >= 6) return;
    this.sfxLast[name] = now;
    const src = c.createBufferSource();
    src.buffer = b;
    src.playbackRate.value = pitch * (0.96 + Math.random() * 0.08);
    const g = c.createGain();
    g.gain.value = vol;
    src.connect(g);
    g.connect(this.sfxBus);
    this.sfxActive[name] = (this.sfxActive[name] || 0) + 1;
    src.onended = () => {
      this.sfxActive[name]--;
      g.disconnect();
    };
    src.start();
  }

  private fetchDecode(url: string): Promise<AudioBuffer | null> {
    const c = this.ctx;
    if (!c) return Promise.resolve(null);
    let p = this.loading.get(url);
    if (p) return p;
    p = fetch(this.base + url)
      .then((r) => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.arrayBuffer();
      })
      .then((ab) => new Promise<AudioBuffer>((res, rej) => c.decodeAudioData(ab, res, rej)))
      .catch((e) => {
        console.warn('audio load failed', url, e);
        return null;
      });
    this.loading.set(url, p);
    return p;
  }

  private async getMusic(clip: string): Promise<AudioBuffer | null> {
    const have = this.musicBuf.get(clip);
    if (have) {
      this.touchLru(clip);
      return have;
    }
    const b = await this.fetchDecode('music/' + clip + '.mp3');
    this.loading.delete('music/' + clip + '.mp3');
    if (b) {
      this.musicBuf.set(clip, b);
      this.touchLru(clip);
      this.evict();
    }
    return b;
  }

  private touchLru(clip: string) {
    const i = this.musicLru.indexOf(clip);
    if (i >= 0) this.musicLru.splice(i, 1);
    this.musicLru.push(clip);
  }

  private evict() {
    const inUse = new Set<string>();
    if (this.track) this.track.clips.forEach((c) => inUse.add(c));
    while (this.musicLru.length > MAX_DECODED_MUSIC) {
      const victim = this.musicLru.find((c) => !inUse.has(c));
      if (!victim) break;
      this.musicLru.splice(this.musicLru.indexOf(victim), 1);
      this.musicBuf.delete(victim);
    }
  }

  /** Warm the decode cache (e.g. upcoming boss music). */
  preloadMusic(clips: string[]) {
    if (!this.ctx) return;
    for (const c of clips) this.getMusic(c);
  }

  currentMusic(): string | null {
    return this.track ? this.track.id : null;
  }

  playMusic(id: string, clips: string[], fadeIn = 1.0) {
    if (!this.ctx) return;
    if (this.track && this.track.id === id && !this.track.dead) return;
    this.stopMusic(1.2);
    const tr: Track = { id, clips, idx: 0, src: null, gain: null, startAt: 0, dur: 0, nextScheduled: false, dead: false };
    this.track = tr;
    this.getMusic(clips[0]).then((b) => {
      if (!b || tr.dead || this.track !== tr) return;
      this.startClip(tr, b, this.ctx!.currentTime + 0.05, fadeIn);
      if (clips.length > 1) this.getMusic(clips[1]);
    });
  }

  private startClip(tr: Track, b: AudioBuffer, when: number, fadeIn: number) {
    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = b;
    const g = c.createGain();
    src.connect(g);
    g.connect(this.musicBus);
    if (fadeIn > 0) {
      g.gain.setValueAtTime(0.0001, when);
      g.gain.linearRampToValueAtTime(1, when + fadeIn);
    } else g.gain.setValueAtTime(1, when);
    src.start(when);
    tr.src = src;
    tr.gain = g;
    tr.startAt = when;
    tr.dur = b.duration;
    tr.nextScheduled = false;
  }

  stopMusic(fade = 1.0) {
    const tr = this.track;
    if (!tr || !this.ctx) return;
    tr.dead = true;
    this.track = null;
    const t = this.ctx.currentTime;
    if (tr.gain && tr.src) {
      tr.gain.gain.cancelScheduledValues(t);
      tr.gain.gain.setValueAtTime(tr.gain.gain.value, t);
      tr.gain.gain.linearRampToValueAtTime(0.0001, t + fade);
      try { tr.src.stop(t + fade + 0.05); } catch { /* already stopped */ }
    }
  }

  /** scheduler: crossfade into the next clip near the end of the current one */
  private schedule() {
    const c = this.ctx;
    const tr = this.track;
    if (!c || !tr || tr.dead || !tr.src || tr.nextScheduled) return;
    const now = c.currentTime;
    const xfStart = tr.startAt + tr.dur - XF;
    if (now < xfStart - 1.5) return;
    const nextIdx = (tr.idx + 1) % tr.clips.length;
    const nb = this.musicBuf.get(tr.clips[nextIdx]);
    if (!nb) {
      this.getMusic(tr.clips[nextIdx]);
      if (now < xfStart) return;
    }
    tr.nextScheduled = true;
    const startNext = (buf: AudioBuffer) => {
      if (tr.dead || this.track !== tr) return;
      const when = Math.max(c.currentTime + 0.03, xfStart);
      const oldSrc = tr.src!, oldGain = tr.gain!;
      oldGain.gain.setValueAtTime(1, when);
      oldGain.gain.linearRampToValueAtTime(0.0001, when + XF);
      try { oldSrc.stop(when + XF + 0.1); } catch { /* ignore */ }
      tr.idx = nextIdx;
      this.startClip(tr, buf, when, XF);
      const after = tr.clips[(nextIdx + 1) % tr.clips.length];
      this.getMusic(after);
    };
    if (nb) startNext(nb);
    else this.getMusic(tr.clips[nextIdx]).then((b) => b && startNext(b));
  }

  /** Play a voice line. Resolves when it ends (or immediately if unavailable). */
  playVoice(key: string, onStart?: (dur: number) => void): Promise<void> {
    const c = this.ctx;
    this.stopVoice();
    const token = ++this.voiceToken;
    if (!c) return Promise.resolve();
    return new Promise<void>((resolve0) => {
      let settled = false;
      const resolve = () => { if (settled) return; settled = true; if (this.voiceDone === resolve) this.voiceDone = null; resolve0(); };
      this.voiceDone = resolve;
      const go = (b: AudioBuffer | null) => {
        if (token !== this.voiceToken) return resolve();
        if (!b) { onStart?.(0); return resolve(); }
        this.voiceBuf.set(key, b);
        const src = c.createBufferSource();
        src.buffer = b;
        src.connect(this.voiceBus);
        const t = c.currentTime;
        this.duck.gain.cancelScheduledValues(t);
        this.duck.gain.setTargetAtTime(0.32, t, 0.08);
        src.onended = () => {
          if (this.voiceSrc === src) {
            this.voiceSrc = null;
            const t2 = c.currentTime;
            this.duck.gain.cancelScheduledValues(t2);
            this.duck.gain.setTargetAtTime(1, t2, 0.3);
          }
          resolve();
        };
        this.voiceSrc = src;
        src.start();
        onStart?.(b.duration);
      };
      const have = this.voiceBuf.get(key);
      if (have) go(have);
      else this.fetchDecode('voice/' + key + '.mp3').then(go);
    });
  }

  preloadVoice(keys: string[]) {
    if (!this.ctx) return;
    for (const k of keys) {
      if (this.voiceBuf.has(k)) continue;
      this.fetchDecode('voice/' + k + '.mp3').then((b) => { if (b) this.voiceBuf.set(k, b); });
    }
  }

  stopVoice() {
    this.voiceToken++;
    const done = this.voiceDone;
    this.voiceDone = null;
    done?.();
    if (this.voiceSrc) {
      const s = this.voiceSrc;
      this.voiceSrc = null;
      try { s.onended = null; s.stop(); } catch { /* ignore */ }
      if (this.ctx) {
        const t = this.ctx.currentTime;
        this.duck.gain.cancelScheduledValues(t);
        this.duck.gain.setTargetAtTime(1, t, 0.3);
      }
    }
  }

  voicePlaying() {
    return this.voiceSrc !== null;
  }
}

export const audio = new AudioSys();
(window as any).__audio = audio;
