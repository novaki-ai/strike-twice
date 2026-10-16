/** Comic speech bubble for Novaki's deadpan one-liners (text only, positioned over the player). */
import type { Game } from '../game/game';

const LINES: Record<string, string[]> = {
  evolve: ['Now we\'re cooking.', 'Huh. Neat.', 'Fine. That\'s pretty good.'],
  gold: ['Ooh. Shiny.', 'Okay, THIS I like.'],
  lowhp: ['I\'m fine. Totally fine.', 'Ow. Rude.', 'Getting a bit crispy here.'],
  revive: ['Not today.', 'Told you. Stubborn.'],
  lamp: ['There. Better.', 'You\'re welcome, lamp.', 'One more lit.'],
  elite: ['Next.', 'Big one. Whatever.'],
  chest: ['Ooh, a box.', 'Free stuff. Finally.'],
  flare: ['Strike two.', 'FWOOSH.', 'Feeling warm yet?', 'Told you. Stubborn.'],
  idle: ['Still smoking.', 'Is it over yet?', 'Why is it always bugs.', 'Should\'ve stayed in bed.', 'My glasses are crooked again.', 'One match. Against all this.', 'Hmph.'],
};

export class Bubble {
  el: HTMLDivElement;
  private until = 0;
  private cooldown = 0;
  private idleT = 75;
  private used = new Map<string, number>();
  private lowHpSaid = false;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'bubble passthrough';
    parent.appendChild(this.el);
  }

  reset() {
    this.until = 0;
    this.cooldown = 3;
    this.idleT = 70;
    this.used.clear();
    this.lowHpSaid = false;
    this.el.classList.remove('show');
  }

  /** say a line from a category; important moments ignore the chatter cooldown */
  say(g: Game, kind: string, force = false) {
    if (kind === 'gold' || kind === 'revive' || kind === 'evolve' || kind === 'flare') force = true;
    if (!force && this.cooldown > 0) return;
    const list = LINES[kind];
    if (!list) return;
    const n = this.used.get(kind) || 0;
    if (kind === 'lamp' && n >= 3) return; // don't nag
    this.used.set(kind, n + 1);
    // visual-only choice: cycle through the list so lines rarely repeat
    this.el.textContent = list[(n + Math.floor(g.time)) % list.length];
    this.el.classList.add('show');
    this.until = g.time + 2.6;
    this.cooldown = 9;
  }

  update(g: Game, dt: number, playing: boolean) {
    if (!playing || !g.player || g.over) { this.el.classList.remove('show'); return; }
    this.cooldown -= dt;
    const p = g.player;
    if (!this.lowHpSaid && p.hp < p.stats.maxHp * 0.3) { this.lowHpSaid = true; this.say(g, 'lowhp', true); }
    if (p.hp > p.stats.maxHp * 0.6) this.lowHpSaid = false;
    this.idleT -= dt;
    if (this.idleT <= 0) { this.idleT = 80 + (Math.floor(g.time * 7) % 50); if (!g.bossActive) this.say(g, 'idle'); }
    if (g.time > this.until) { this.el.classList.remove('show'); return; }
    // follow Novaki's head on screen
    const sx = (g.rig.x - g.camX) * g.zoom + g.screenW / 2;
    const sy = (g.rig.y - 120 - g.camY) * g.zoom + g.screenH / 2;
    this.el.style.transform = `translate(${Math.round(sx)}px, ${Math.round(sy)}px) translate(-50%, -100%)`;
  }
}
