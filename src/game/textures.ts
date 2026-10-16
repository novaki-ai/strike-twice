/** Texture management: runtime atlas of generated sprites (+ white flash variants) and procedural FX textures. */
import { CanvasSource, Rectangle, Texture } from 'pixi.js';
import { FRAME_B } from './frames';

export const SPRITES = [
  'novaki_torso', 'novaki_torso_angry', 'novaki_torso_ouch',
  'e_moth', 'e_mold', 'e_toadstool', 'e_beetle', 'e_stump', 'e_raindrop', 'e_slime', 'e_frog',
  'e_cloud', 'e_balloon', 'e_wateringcan', 'e_waxghost', 'e_snufflet', 'e_wisp', 'e_knight', 'e_wraith',
  'p1_tree', 'p1_shrooms', 'p1_boulder', 'p1_log', 'p1_fern', 'p1_lantern',
  'p2_lamp', 'p2_barrel', 'p2_crates', 'p2_anchor', 'p2_hydrant', 'p2_bollard',
  'p3_candelabra', 'p3_pillar', 'p3_candles', 'p3_gargoyle', 'p3_brazier', 'p3_books',
  'd1_moss', 'd1_leaves', 'd1_ring', 'd2_puddle', 'd2_manhole', 'd2_net', 'd3_wax', 'd3_rug', 'd3_bones',
  ...Object.keys(FRAME_B).map((n) => n + '_b'),
];
export const BIG_SPRITES = ['b_duchess', 'b_baron', 'b_snuffer', 'novaki_ko', 'b_duchess_atk', 'b_duchess_ko', 'b_baron_atk', 'b_baron_ko', 'b_snuffer_atk', 'b_snuffer_ko'];
export const ICONS = [
  'marshmallow', 'magnet', 'coin', 'chest', 'ember', 'goldmatch', 'firecracker', 'watch', 'heartcandle',
];
export const TILES = ['tile_forest', 'tile_docks', 'tile_spire'];

function loadImg(url: string): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => { console.warn('image failed', url); res(null); };
    im.src = url;
  });
}

function mkCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

class Atlas {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  x = 2; y = 2; rowH = 0;
  frames: Record<string, Rectangle> = {};
  constructor(public size: number) {
    this.canvas = mkCanvas(size, size);
    this.ctx = this.canvas.getContext('2d')!;
  }
  /** shrink the canvas to the used height (power of two, so mipmaps work everywhere) */
  finalize() {
    const used = this.y + this.rowH + 8;
    let h = 256;
    while (h < used) h *= 2;
    if (h >= this.size) return;
    const c = mkCanvas(this.size, h);
    c.getContext('2d')!.drawImage(this.canvas, 0, 0);
    this.canvas = c;
    this.ctx = c.getContext('2d')!;
  }
  add(name: string, img: CanvasImageSource, w: number, h: number): boolean {
    const pad = 6;
    if (this.x + w + pad > this.size) { this.x = 2; this.y += this.rowH + pad; this.rowH = 0; }
    if (this.y + h + pad > this.size) return false;
    this.ctx.drawImage(img, this.x, this.y, w, h);
    this.frames[name] = new Rectangle(this.x, this.y, w, h);
    this.x += w + pad;
    this.rowH = Math.max(this.rowH, h);
    return true;
  }
}

export interface TexSet {
  tex: Record<string, Texture>;
  flash: Record<string, Texture>;
}

function sourceFrom(canvas: HTMLCanvasElement) {
  return new CanvasSource({ resource: canvas, autoGenerateMipmaps: true, scaleMode: 'linear' });
}

/** Load generated sprites into atlases; returns normal and white-silhouette textures. */
export async function loadSpriteAtlas(base: string, onProgress: (p: number) => void): Promise<TexSet> {
  const names = [...SPRITES, ...BIG_SPRITES];
  const imgs: Record<string, HTMLImageElement | null> = {};
  let done = 0;
  await Promise.all(
    names.map(async (n) => {
      imgs[n] = await loadImg(base + 'img/' + n + '.webp');
      onProgress(++done / names.length);
    }),
  );
  const out: TexSet = { tex: {}, flash: {} };
  const atlases: Atlas[] = [];
  let cur = new Atlas(2048);
  atlases.push(cur);
  // big ones first in their own atlas
  const bigAtlases = new Set<Atlas>();
  let big = new Atlas(2048);
  atlases.push(big);
  bigAtlases.add(big);
  for (const n of BIG_SPRITES) {
    const im = imgs[n];
    if (!im) continue;
    if (!big.add(n, im, im.width, im.height)) {
      big = new Atlas(2048);
      atlases.push(big);
      bigAtlases.add(big);
      big.add(n, im, im.width, im.height);
    }
  }
  for (const n of SPRITES) {
    const im = imgs[n];
    if (!im) continue;
    if (!cur.add(n, im, im.width, im.height)) {
      cur = new Atlas(2048);
      atlases.push(cur);
      cur.add(n, im, im.width, im.height);
    }
  }
  for (const a of atlases) {
    if (Object.keys(a.frames).length === 0) continue;
    a.finalize();
    const src = sourceFrom(a.canvas);
    // flash: white silhouette copy (bosses flash by tint, so their atlases skip it)
    let fsrc: CanvasSource | null = null;
    if (!bigAtlases.has(a)) {
      const fc = mkCanvas(a.canvas.width, a.canvas.height);
      const fx = fc.getContext('2d')!;
      fx.drawImage(a.canvas, 0, 0);
      fx.globalCompositeOperation = 'source-in';
      fx.fillStyle = '#fff';
      fx.fillRect(0, 0, fc.width, fc.height);
      fsrc = sourceFrom(fc);
    }
    for (const [n, fr] of Object.entries(a.frames)) {
      out.tex[n] = new Texture({ source: src, frame: fr });
      out.flash[n] = fsrc ? new Texture({ source: fsrc, frame: fr }) : out.tex[n];
    }
  }
  return out;
}

export async function loadTiles(base: string): Promise<Record<string, Texture>> {
  const out: Record<string, Texture> = {};
  await Promise.all(
    TILES.map(async (n) => {
      const im = await loadImg(base + 'img/' + n + '.webp');
      if (!im) return;
      const c = mkCanvas(im.width, im.height);
      c.getContext('2d')!.drawImage(im, 0, 0);
      const src = new CanvasSource({ resource: c, autoGenerateMipmaps: true, scaleMode: 'linear', addressMode: 'repeat' });
      out[n] = new Texture({ source: src });
    }),
  );
  return out;
}

export async function loadIcons(base: string, names: string[]): Promise<Record<string, Texture>> {
  const out: Record<string, Texture> = {};
  const a = new Atlas(1024);
  const imgs = await Promise.all(names.map((n) => loadImg(base + 'img/icons/' + n + '.webp')));
  names.forEach((n, i) => {
    const im = imgs[i];
    if (im) a.add(n, im, im.width, im.height);
  });
  a.finalize();
  const src = sourceFrom(a.canvas);
  for (const [n, fr] of Object.entries(a.frames)) out[n] = new Texture({ source: src, frame: fr });
  return out;
}

/* ---------------- procedural FX textures ---------------- */

function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, mip = true): Texture {
  const cv = mkCanvas(w, h);
  draw(cv.getContext('2d')!);
  return new Texture({ source: new CanvasSource({ resource: cv, autoGenerateMipmaps: mip, scaleMode: 'linear' }) });
}

export interface FxTex {
  [k: string]: Texture;
}

export function makeFxTextures(): FxTex {
  const t: FxTex = {};
  t.circle = canvasTex(64, 64, (c) => {
    c.fillStyle = '#fff';
    c.beginPath(); c.arc(32, 32, 30, 0, Math.PI * 2); c.fill();
  });
  t.glow = canvasTex(128, 128, (c) => {
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.6)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.15)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 128, 128);
  });
  t.light = canvasTex(128, 128, (c) => {
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    for (let i = 0; i <= 10; i++) {
      const f = i / 10;
      const v = Math.pow(1 - f, 1.6);
      g.addColorStop(f, `rgba(255,255,255,${v.toFixed(3)})`);
    }
    c.fillStyle = g; c.fillRect(0, 0, 128, 128);
  });
  t.shadow = canvasTex(64, 32, (c) => {
    const g = c.createRadialGradient(32, 16, 2, 32, 16, 32);
    g.addColorStop(0, 'rgba(0,0,0,0.55)');
    g.addColorStop(0.7, 'rgba(0,0,0,0.3)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.scale(1, 0.5);
    c.beginPath(); c.arc(32, 32, 32, 0, Math.PI * 2); c.fill();
  });
  // inked ember projectile: orange core with black outline (cartoon)
  t.ember = canvasTex(64, 64, (c) => {
    c.lineWidth = 5; c.strokeStyle = '#1b1612';
    const g = c.createRadialGradient(28, 26, 2, 32, 32, 26);
    g.addColorStop(0, '#fff6c8'); g.addColorStop(0.35, '#ffc23a'); g.addColorStop(1, '#e8501c');
    c.fillStyle = g;
    c.beginPath(); c.arc(32, 32, 24, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.85)';
    c.beginPath(); c.ellipse(24, 23, 6, 4, -0.6, 0, Math.PI * 2); c.fill();
  });
  // flame teardrop (points up)
  t.flame = canvasTex(64, 96, (c) => {
    c.lineWidth = 4; c.strokeStyle = '#1b1612';
    const g = c.createLinearGradient(0, 10, 0, 90);
    g.addColorStop(0, '#ffe680'); g.addColorStop(0.5, '#ff9a2e'); g.addColorStop(1, '#d9381e');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(32, 6);
    c.bezierCurveTo(44, 30, 58, 46, 56, 64);
    c.bezierCurveTo(54, 82, 42, 92, 32, 92);
    c.bezierCurveTo(22, 92, 10, 82, 8, 64);
    c.bezierCurveTo(6, 46, 22, 32, 32, 6);
    c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#fff4b8';
    c.beginPath(); c.ellipse(32, 66, 11, 16, 0, 0, Math.PI * 2); c.fill();
  });
  // smoke puff (soft cartoon cloud)
  t.puff = canvasTex(64, 64, (c) => {
    c.fillStyle = '#fff';
    const blobs = [[32, 36, 18], [20, 30, 12], [44, 28, 13], [30, 22, 12], [44, 42, 11], [18, 42, 10]];
    for (const [x, y, r] of blobs) { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); }
  });
  t.puffOutline = canvasTex(72, 72, (c) => {
    const blobs = [[36, 40, 18], [24, 34, 12], [48, 32, 13], [34, 26, 12], [48, 46, 11], [22, 46, 10]];
    c.fillStyle = '#1b1612';
    for (const [x, y, r] of blobs) { c.beginPath(); c.arc(x, y, r + 3, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = '#fff';
    for (const [x, y, r] of blobs) { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); }
  });
  // cartoon explosion cloud: inked puffs with a yellow core
  t.boom = canvasTex(128, 128, (c) => {
    const blobs: [number, number, number][] = [[64, 64, 34], [38, 52, 22], [90, 50, 24], [50, 88, 22], [84, 88, 24], [64, 32, 20], [28, 76, 16], [100, 72, 17]];
    c.fillStyle = '#1b1612';
    for (const [x, y, r] of blobs) { c.beginPath(); c.arc(x, y, r + 4, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = '#e8501c';
    for (const [x, y, r] of blobs) { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = '#ffa53a';
    for (const [x, y, r] of blobs) { c.beginPath(); c.arc(x - r * 0.15, y - r * 0.15, r * 0.72, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = '#fff1a8';
    c.beginPath(); c.arc(60, 60, 20, 0, Math.PI * 2); c.fill();
  });
  t.ring = canvasTex(128, 128, (c) => {
    c.strokeStyle = '#fff'; c.lineWidth = 10;
    c.beginPath(); c.arc(64, 64, 56, 0, Math.PI * 2); c.stroke();
  });
  // cartoon smoke ring: a chain of inked puffs around a circle
  t.smokering = canvasTex(256, 256, (c) => {
    const n = 26, R = 108;
    const pts: [number, number, number][] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = 11 + ((i * 7) % 5);
      pts.push([128 + Math.cos(a) * R, 128 + Math.sin(a) * R, r]);
    }
    c.fillStyle = 'rgba(27,22,18,0.85)';
    for (const [x, y, r] of pts) { c.beginPath(); c.arc(x, y, r + 3, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = '#f4ede0';
    for (const [x, y, r] of pts) { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = 'rgba(200,190,175,0.9)';
    for (const [x, y, r] of pts) { c.beginPath(); c.arc(x + 2, y + 3, r * 0.45, 0, Math.PI * 2); c.fill(); }
  });
  t.softring = canvasTex(256, 256, (c) => {
    const g = c.createRadialGradient(128, 128, 60, 128, 128, 128);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.85, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 256, 256);
  });
  t.spark = canvasTex(32, 32, (c) => {
    c.fillStyle = '#fff';
    c.beginPath();
    c.moveTo(16, 0); c.lineTo(19, 13); c.lineTo(32, 16); c.lineTo(19, 19);
    c.lineTo(16, 32); c.lineTo(13, 19); c.lineTo(0, 16); c.lineTo(13, 13);
    c.closePath(); c.fill();
  });
  t.square = canvasTex(8, 8, (c) => { c.fillStyle = '#fff'; c.fillRect(0, 0, 8, 8); }, false);
  t.streak = canvasTex(8, 64, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,1)');
    c.fillStyle = g; c.fillRect(2, 0, 4, 64);
  });
  // xp gem: little faceted ember crystal (white so it can be tinted)
  t.gem = canvasTex(48, 48, (c) => {
    c.lineWidth = 4; c.strokeStyle = '#1b1612'; c.lineJoin = 'round';
    c.fillStyle = '#fff';
    c.beginPath(); c.moveTo(24, 4); c.lineTo(42, 22); c.lineTo(24, 44); c.lineTo(6, 22); c.closePath();
    c.fill(); c.stroke();
    c.fillStyle = 'rgba(0,0,0,0.18)';
    c.beginPath(); c.moveTo(24, 22); c.lineTo(42, 22); c.lineTo(24, 44); c.closePath(); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.9)';
    c.beginPath(); c.moveTo(24, 8); c.lineTo(15, 20); c.lineTo(22, 20); c.closePath(); c.fill();
  });
  // enemy bullet: inked orb with white core (tinted per attack)
  t.bullet = canvasTex(48, 48, (c) => {
    c.fillStyle = '#1b1612';
    c.beginPath(); c.arc(24, 24, 22, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#fff';
    c.beginPath(); c.arc(24, 24, 16, 0, Math.PI * 2); c.fill();
  });
  t.bulletCore = canvasTex(48, 48, (c) => {
    c.fillStyle = 'rgba(255,255,255,0.95)';
    c.beginPath(); c.arc(21, 20, 7, 0, Math.PI * 2); c.fill();
  });
  // matchstick projectile (pointing right)
  t.match = canvasTex(80, 20, (c) => {
    c.fillStyle = '#1b1612'; c.fillRect(2, 5, 62, 10);
    c.fillStyle = '#e9c88f'; c.fillRect(5, 7, 58, 6);
    c.fillStyle = '#1b1612';
    c.beginPath(); c.ellipse(66, 10, 12, 9, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#c8361d';
    c.beginPath(); c.ellipse(66, 10, 9, 6.5, 0, 0, Math.PI * 2); c.fill();
  });
  // boomerang (wooden, inked)
  t.boomerang = canvasTex(64, 64, (c) => {
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.strokeStyle = '#1b1612'; c.lineWidth = 16;
    c.beginPath(); c.moveTo(10, 50); c.quadraticCurveTo(14, 14, 50, 10); c.stroke();
    c.strokeStyle = '#d9a35a'; c.lineWidth = 9;
    c.beginPath(); c.moveTo(10, 50); c.quadraticCurveTo(14, 14, 50, 10); c.stroke();
    c.strokeStyle = '#f07a2a'; c.lineWidth = 4;
    c.beginPath(); c.moveTo(14, 44); c.quadraticCurveTo(17, 17, 44, 14); c.stroke();
  });
  // firecracker
  t.cracker = canvasTex(40, 64, (c) => {
    c.fillStyle = '#1b1612'; c.fillRect(8, 14, 24, 46);
    c.fillStyle = '#c8361d'; c.fillRect(11, 17, 18, 40);
    c.fillStyle = '#f3e6c4'; c.fillRect(11, 30, 18, 6);
    c.strokeStyle = '#1b1612'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(20, 14); c.quadraticCurveTo(26, 6, 22, 2); c.stroke();
  });
  // candle sentry
  t.candle = canvasTex(48, 80, (c) => {
    c.fillStyle = '#1b1612'; c.fillRect(10, 24, 28, 52); c.fillRect(4, 68, 40, 10);
    c.fillStyle = '#f3e6c4'; c.fillRect(13, 27, 22, 46);
    c.fillStyle = '#b8a27c'; c.fillRect(7, 70, 34, 6);
    c.fillStyle = '#1b1612'; c.fillRect(22, 14, 4, 12);
  });
  // stars for KO / confetti
  t.star = canvasTex(32, 32, (c) => {
    c.fillStyle = '#fff'; c.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 ? 6 : 15;
      c.lineTo(16 + Math.cos(a) * r, 16 + Math.sin(a) * r);
    }
    c.closePath(); c.fill();
  });
  // chest pickup fallback (if icon missing)
  t.drop = canvasTex(32, 48, (c) => {
    c.fillStyle = '#fff';
    c.beginPath(); c.moveTo(16, 2); c.bezierCurveTo(24, 16, 30, 24, 30, 32);
    c.arc(16, 32, 14, 0, Math.PI); c.bezierCurveTo(2, 24, 8, 16, 16, 2); c.fill();
  });
  // ground scorch decal
  t.scorch = canvasTex(64, 64, (c) => {
    const g = c.createRadialGradient(32, 32, 4, 32, 32, 32);
    g.addColorStop(0, 'rgba(20,14,10,0.6)'); g.addColorStop(1, 'rgba(20,14,10,0)');
    c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  });
  // film grain
  t.grain = canvasTex(256, 256, (c) => {
    const id = c.createImageData(256, 256);
    for (let i = 0; i < id.data.length; i += 4) {
      const r = Math.random();
      const v = r < 0.5 ? 0 : 255;
      id.data[i] = id.data[i + 1] = id.data[i + 2] = v;
      id.data[i + 3] = Math.random() < 0.5 ? Math.floor(Math.random() * 90) : 0;
    }
    c.putImageData(id, 0, 0);
  }, false);
  // flame-whip crescent (pointing right)
  t.slash = canvasTex(256, 64, (c) => {
    c.lineCap = 'round';
    const grad = c.createLinearGradient(0, 0, 256, 0);
    grad.addColorStop(0, 'rgba(255,120,40,0)'); grad.addColorStop(0.3, '#ff7a2a'); grad.addColorStop(0.75, '#ffd060'); grad.addColorStop(1, '#fff3c0');
    c.strokeStyle = '#1b1612'; c.lineWidth = 22;
    c.beginPath(); c.moveTo(10, 44); c.quadraticCurveTo(128, -6, 246, 36); c.stroke();
    c.strokeStyle = grad; c.lineWidth = 14;
    c.beginPath(); c.moveTo(10, 44); c.quadraticCurveTo(128, -6, 246, 36); c.stroke();
    c.strokeStyle = 'rgba(255,255,220,0.9)'; c.lineWidth = 4;
    c.beginPath(); c.moveTo(60, 30); c.quadraticCurveTo(140, 6, 236, 34); c.stroke();
  });
  t.beam = canvasTex(256, 32, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 32);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.35, 'rgba(255,255,255,0.7)'); g.addColorStop(0.5, 'rgba(255,255,255,1)');
    g.addColorStop(0.65, 'rgba(255,255,255,0.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 256, 32);
  });
  t.vignette = canvasTex(256, 256, (c) => {
    const g = c.createRadialGradient(128, 128, 60, 128, 128, 182);
    g.addColorStop(0, 'rgba(10,6,4,0)');
    g.addColorStop(0.6, 'rgba(10,6,4,0.18)');
    g.addColorStop(1, 'rgba(10,6,4,0.75)');
    c.fillStyle = g; c.fillRect(0, 0, 256, 256);
  });
  return t;
}

/** Digit textures for damage numbers, drawn with the cartoon font. */
export function makeDigitTextures(): { digits: Texture[]; w: number[] } {
  const chars = '0123456789';
  const size = 44;
  const cv = mkCanvas(chars.length * 40, 56);
  const c = cv.getContext('2d')!;
  c.font = `${size}px "Luckiest Guy", "Arial Black", sans-serif`;
  c.textBaseline = 'middle';
  c.textAlign = 'center';
  c.lineJoin = 'round';
  const widths: number[] = [];
  for (let i = 0; i < chars.length; i++) {
    const x = i * 40 + 20;
    c.lineWidth = 9; c.strokeStyle = '#1b1612';
    c.strokeText(chars[i], x, 30);
    c.fillStyle = '#fff';
    c.fillText(chars[i], x, 30);
    widths.push(Math.min(38, c.measureText(chars[i]).width + 6));
  }
  const src = new CanvasSource({ resource: cv, autoGenerateMipmaps: true, scaleMode: 'linear' });
  const digits = [];
  for (let i = 0; i < chars.length; i++) digits.push(new Texture({ source: src, frame: new Rectangle(i * 40, 0, 40, 56) }));
  return { digits, w: widths };
}
