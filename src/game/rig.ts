/** Novaki: generated torso sprite + code-drawn rubber-hose limbs. */
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { Game } from './game';
import type { FxTex } from './textures';
import { vrange } from '../core/rng';

const INK = 0x14100d;
const TORSO_H = 64;

export class NovakiRig {
  root = new Container();
  legs = new Graphics();
  backArm = new Graphics();
  frontArm = new Graphics();
  torso: Sprite;
  flames: Sprite[] = [];
  shadow: Sprite;
  x = 0;
  y = 0;
  phase = 0;
  smokeT = 0;
  private torsoTex: Texture;
  private lastShadowParent = false;

  constructor(torsoTex: Texture, private fx: FxTex) {
    this.torsoTex = torsoTex;
    this.torso = new Sprite(torsoTex);
    this.torso.anchor.set(0.5, 1);
    const s = TORSO_H / torsoTex.height;
    this.torso.scale.set(s);
    this.shadow = new Sprite(fx.shadow);
    this.shadow.anchor.set(0.5);
    this.shadow.width = 40;
    this.shadow.height = 14;
    const flameBox = new Container();
    for (let i = 0; i < 3; i++) {
      const f = new Sprite(fx.flame);
      f.anchor.set(0.5, 1);
      f.visible = false;
      this.flames.push(f);
      flameBox.addChild(f);
    }
    this.root.addChild(this.legs, this.backArm, this.torso, this.frontArm, flameBox);
  }

  update(g: Game, x: number, y: number, dt: number) {
    const p = g.player;
    if (!this.lastShadowParent) { g.shadowLayer.addChild(this.shadow); this.lastShadowParent = true; }
    this.x = x;
    this.y = y;
    const speed = Math.hypot(p.vx, p.vy);
    const moving = speed > 20;
    const dashing = p.dashT > 0;
    const run = Math.min(1, speed / 150);
    this.phase += dt * (moving ? 2 * Math.PI * (1.6 + 1.2 * run) : 0);
    const t = p.animT;
    const ph = this.phase;
    const face = p.face;
    this.root.x = x;
    this.root.y = y;
    this.root.zIndex = y;
    this.root.scale.x = face;
    this.root.scale.y = 1;
    this.shadow.x = x;
    this.shadow.y = y;

    // body motion
    const bob = moving ? -Math.abs(Math.sin(ph)) * 3.2 : Math.sin(t * 2.2) * 0.8;
    const lean = dashing ? 0.32 : moving ? 0.1 * run : 0;
    const hurtJit = p.hurtT > 0 ? Math.sin(t * 80) * 2 : 0;
    const hipY = -16 + bob;
    const s = TORSO_H / this.torsoTex.height;
    const breathe = moving ? 1 : 1 + Math.sin(t * 2.2) * 0.015;
    this.torso.texture = p.hurtT > 0.15 && Math.floor(t * 30) % 2 === 0 ? (g.T.flash.novaki_torso || this.torsoTex) : this.torsoTex;
    this.torso.x = hurtJit;
    this.torso.y = hipY + 2;
    this.torso.rotation = lean;
    this.torso.scale.set(s * (dashing ? 1.08 : 1) / breathe, s * (dashing ? 0.92 : 1) * breathe);
    // invulnerability blink
    this.root.alpha = p.iframes > 0 && p.hurtT <= 0 && p.dashT <= 0 && !p.invincible ? (Math.floor(t * 20) % 2 ? 0.55 : 1) : 1;

    // legs
    const L = this.legs;
    L.clear();
    const stride = moving ? 8 + 3 * run : 0;
    const lift = moving ? 6 : 0;
    const feet: [number, number, number][] = [];
    for (let i = 0; i < 2; i++) {
      const hx = (i === 0 ? -5.5 : 5.5) + Math.sin(lean) * -hipY * 0.5;
      const fp = ph + (i === 0 ? 0 : Math.PI);
      let fx = (i === 0 ? -6 : 6) + Math.sin(fp) * stride;
      let fy = -Math.max(0, Math.cos(fp)) * lift;
      if (dashing) { fx = (i === 0 ? -10 : 2); fy = -4 + i * 2; }
      // rubber hose leg: quadratic curve with knee pushed forward
      const kx = (hx + fx) / 2 + 3, ky = (hipY + fy) / 2;
      L.moveTo(hx, hipY).quadraticCurveTo(kx, ky, fx, fy - 3).stroke({ width: 4.4, color: INK, cap: 'round' });
      feet.push([fx, fy, fp]);
    }
    for (const [fx, fy] of feet) {
      // shoe: chunky black oval pointing forward
      L.ellipse(fx + 3, fy - 2.5, 7.5, 4.6).fill(INK);
      L.ellipse(fx + 5, fy - 4.2, 2.6, 1.2).fill({ color: 0xffffff, alpha: 0.35 });
    }

    // arms (shoulders on the wood body, just under the face)
    const shY = hipY - 26;
    const swing = moving ? Math.sin(ph) * 9 * (0.6 + run * 0.6) : Math.sin(t * 2.2) * 1.2;
    this.drawArm(this.backArm, -9, shY, -13 - swing * 0.6, shY + 17 + (moving ? -Math.abs(swing) * 0.2 : 0), dashing, true);
    this.drawArm(this.frontArm, 9, shY, 14 + swing, shY + 16 - (moving ? Math.abs(swing) * 0.25 : 0), dashing, false);

    // head flame (level up / golden match / revive)
    const fire = p.ignite > 0 || p.goldT > 0;
    for (let i = 0; i < this.flames.length; i++) {
      const f = this.flames[i];
      f.visible = fire;
      if (!fire) continue;
      const k = 0.85 + 0.25 * Math.sin(t * 22 + i * 2.1);
      f.x = (i - 1) * 7 + Math.sin(lean) * 40;
      f.y = hipY + 2 - TORSO_H + 14 + (i === 1 ? -4 : 0);
      f.scale.set((i === 1 ? 0.36 : 0.26) * k, (i === 1 ? 0.42 : 0.3) * k);
      f.rotation = (i - 1) * 0.35 + lean;
      f.tint = p.goldT > 0 ? 0xffe9a0 : 0xffffff;
    }

    // smoke curl rising from the charcoal head
    this.smokeT -= dt;
    if (this.smokeT <= 0) {
      const lowHp = p.hp < p.stats.maxHp * 0.3;
      this.smokeT = fire ? 0.04 : lowHp ? 0.07 : 0.16;
      const hx = x + (Math.sin(lean) * 50 + 3) * face, hy = y + hipY - TORSO_H + 6;
      const pt = g.particle(hx, hy, this.fx.puff, {
        layer: 2, vx: vrange(-8, 8) - p.vx * 0.2, vy: vrange(-45, -30), life: vrange(0.9, 1.4), s0: 0.08, s1: lowHp ? 0.5 : 0.32,
        a0: fire ? 0.35 : 0.55, tint: lowHp ? 0x8a8278 : 0xe4dccb, drag: 0.6, vrot: vrange(-1.5, 1.5),
      });
      if (pt) pt.sp.zIndex = 0;
      if (fire && Math.random() < 0.5) g.spark(hx, hy - 6, 0xffb040, 1, 60);
    }
  }

  private drawArm(gr: Graphics, sx: number, sy: number, hx: number, hy: number, dashing: boolean, back: boolean) {
    gr.clear();
    if (dashing) { hx = sx - 16; hy = sy + 4; }
    const cx = (sx + hx) / 2 + (back ? -5 : 5), cy = (sy + hy) / 2 - 3;
    gr.moveTo(sx, sy).quadraticCurveTo(cx, cy, hx, hy).stroke({ width: 3.6, color: INK, cap: 'round' });
    // cartoon glove: white puff with cuff and finger lines
    gr.circle(hx, hy + 1, 5.6).fill(0xffffff).stroke({ width: 1.6, color: INK });
    gr.moveTo(hx - 2.2, hy - 0.5).lineTo(hx - 2.2, hy + 3).stroke({ width: 1, color: INK, alpha: 0.7 });
    gr.moveTo(hx + 0.6, hy - 1).lineTo(hx + 0.6, hy + 3.4).stroke({ width: 1, color: INK, alpha: 0.7 });
    gr.roundRect(hx - 4, hy - 6.5, 8, 3.6, 1.5).fill(0xffffff).stroke({ width: 1.4, color: INK });
  }
}
