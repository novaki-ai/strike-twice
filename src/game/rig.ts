/** Novaki: generated torso sprite + code-drawn rubber-hose limbs. */
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { Game } from './game';
import type { FxTex } from './textures';
import { vrange } from '../core/rng';

const INK = 0x14100d;
const TORSO_H = 64;
const K = 1.25; // overall rig scale

export class NovakiRig {
  root = new Container();
  legs = new Graphics();
  backArm = new Graphics();
  frontArm = new Graphics();
  torso: Sprite;
  flames: Sprite[] = [];
  ember: Sprite;
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
    this.shadow.width = 46;
    this.shadow.height = 16;
    // the stubborn ember: glows brighter as Novaki levels up through the run
    this.ember = new Sprite(fx.glow);
    this.ember.anchor.set(0.5);
    this.ember.blendMode = 'add';
    this.ember.tint = 0xff7a2a;
    const flameBox = new Container();
    flameBox.addChild(this.ember);
    for (let i = 0; i < 3; i++) {
      const f = new Sprite(fx.flame);
      f.anchor.set(0.5, 1);
      f.visible = false;
      this.flames.push(f);
      flameBox.addChild(f);
    }
    this.root.addChild(this.legs, this.backArm, this.torso, this.frontArm, flameBox);
  }

  ko: Sprite | null = null;
  knockOut(g: Game) {
    if (!this.ko) {
      this.ko = new Sprite(g.T.tex.novaki_ko);
      this.ko.anchor.set(0.5, 0.85);
      g.actorLayer.addChild(this.ko);
    }
    const tex = g.T.tex.novaki_ko;
    this.ko.texture = tex;
    this.ko.scale.set(110 / tex.width);
    this.ko.x = this.x;
    this.ko.y = this.y;
    this.ko.zIndex = this.y;
    this.ko.visible = true;
    this.root.visible = false;
  }
  reset() {
    if (this.ko) this.ko.visible = false;
    this.root.visible = true;
  }

  update(g: Game, x: number, y: number, dt: number) {
    const p = g.player;
    if (this.ko && this.ko.visible) {
      // dizzy stars over the knocked-out match
      if (Math.random() < 0.15) g.particle(this.ko.x + vrange(-30, 30), this.ko.y - 40 + vrange(-6, 6), this.fx.star, { add: true, vx: vrange(-20, 20), vy: -20, life: 0.6, s0: 0.5, s1: 0.1, tint: 0xffe066, layer: 1 });
      if (Math.random() < 0.08) g.puff(this.ko.x - 30, this.ko.y - 30, 0x9a9288, 0.4, 1);
      return;
    }
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
    this.root.scale.x = face * K;
    this.root.scale.y = K;
    this.shadow.x = x;
    this.shadow.y = y;

    // body motion
    const bob = moving ? -Math.abs(Math.sin(ph)) * 3.2 : Math.sin(t * 2.2) * 0.8;
    const lean = dashing ? 0.32 : moving ? 0.1 * run : 0;
    const hurtJit = p.hurtT > 0 ? Math.sin(t * 80) * 2 : 0;
    const hipY = -16 + bob;
    const s = TORSO_H / this.torsoTex.height;
    const breathe = moving ? 1 : 1 + Math.sin(t * 2.2) * 0.015;
    // expression: ouch when hit, determined scowl in boss fights / ablaze, deadpan otherwise
    let expr = this.torsoTex;
    if (p.hurtT > 0 && g.T.tex.novaki_torso_ouch) expr = g.T.tex.novaki_torso_ouch;
    else if ((g.bossActive || p.goldT > 0 || p.ignite > 0.3) && g.T.tex.novaki_torso_angry) expr = g.T.tex.novaki_torso_angry;
    this.torso.texture = p.hurtT > 0.15 && Math.floor(t * 30) % 2 === 0 ? (g.T.flash.novaki_torso || this.torsoTex) : expr;
    this.torso.x = hurtJit;
    this.torso.y = hipY + 2;
    this.torso.rotation = lean;
    const sf = TORSO_H / this.torso.texture.height;
    this.torso.scale.set(sf * (dashing ? 1.08 : 1) / breathe, sf * (dashing ? 0.92 : 1) * breathe);
    void s;
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
      L.moveTo(hx, hipY).quadraticCurveTo(kx, ky, fx, fy - 3).stroke({ width: 4.8, color: INK, cap: 'round' });
      feet.push([fx, fy, fp]);
    }
    for (const [fx, fy] of feet) {
      // shoe: big bulbous cartoon shoe pointing forward, with a shine and a pale sole line
      L.ellipse(fx + 3.5, fy - 3.2, 9.5, 5.8).fill(INK);
      L.ellipse(fx + 3.5, fy + 1.4, 8.4, 1.4).fill({ color: 0x8a7d6a, alpha: 0.9 });
      L.ellipse(fx + 6.5, fy - 5.6, 3.2, 1.5).fill({ color: 0xffffff, alpha: 0.45 });
    }

    // arms (shoulders on the wood body, just under the face)
    const shY = hipY - 26;
    const swing = moving ? Math.sin(ph) * 9 * (0.6 + run * 0.6) : Math.sin(t * 2.2) * 1.2;
    this.drawArm(this.backArm, -9, shY, -13 - swing * 0.6, shY + 17 + (moving ? -Math.abs(swing) * 0.2 : 0), dashing, true);
    this.drawArm(this.frontArm, 9, shY, 14 + swing, shY + 16 - (moving ? Math.abs(swing) * 0.25 : 0), dashing, false);

    // head flame (level up / golden match / revive), and a small steady flame once he is well re-lit
    const fire = p.ignite > 0 || p.goldT > 0;
    const relit = Math.min(1, Math.max(0, (p.level - 1) / 34));
    const steady = !fire && p.level >= 22;
    this.ember.x = Math.sin(lean) * 40;
    this.ember.y = hipY + 2 - TORSO_H + 12;
    const pulse = 0.8 + 0.2 * Math.sin(t * 5) + 0.1 * Math.sin(t * 13);
    this.ember.scale.set((0.12 + 0.2 * relit) * pulse, (0.1 + 0.16 * relit) * pulse);
    this.ember.alpha = 0.35 + 0.55 * relit;
    for (let i = 0; i < this.flames.length; i++) {
      const f = this.flames[i];
      if (steady && i === 1) {
        const sz = 0.1 + 0.1 * Math.min(1, (p.level - 22) / 18);
        const k = 0.85 + 0.2 * Math.sin(t * 19) + 0.08 * Math.sin(t * 31);
        f.visible = true;
        f.x = Math.sin(lean) * 40;
        f.y = hipY + 2 - TORSO_H + 14;
        f.scale.set(sz * k, sz * 1.25 * k);
        f.rotation = lean - p.vx * 0.0012;
        f.tint = 0xffffff;
        continue;
      }
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
      const hx = x + (Math.sin(lean) * 50 + 3) * face * K, hy = y + (hipY - TORSO_H + 6) * K;
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
    gr.moveTo(sx, sy).quadraticCurveTo(cx, cy, hx, hy).stroke({ width: 4.2, color: INK, cap: 'round' });
    // cartoon glove: puffy white mitt with a thumb bump, flared cuff and two finger creases
    const gx = hx, gy = hy + 3;
    gr.circle(gx + (back ? -3.2 : 3.2), gy - 1.5, 3.2).fill(0xfffaf0).stroke({ width: 1.5, color: INK });
    gr.ellipse(gx, gy, 6.4, 5.8).fill(0xfffaf0).stroke({ width: 1.7, color: INK });
    gr.moveTo(gx - 2.4, gy + 0.6).lineTo(gx - 2.1, gy + 4.2).stroke({ width: 1.1, color: INK, alpha: 0.75 });
    gr.moveTo(gx + 0.6, gy + 0.9).lineTo(gx + 0.8, gy + 4.6).stroke({ width: 1.1, color: INK, alpha: 0.75 });
    gr.ellipse(gx, gy - 5.2, 4.6, 1.9).fill(0xfffaf0).stroke({ width: 1.4, color: INK });
  }
}
