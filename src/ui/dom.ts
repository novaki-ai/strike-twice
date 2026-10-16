/** Tiny DOM helpers + spatial focus navigation for keyboard / gamepad menus. */
import { audio } from '../core/audio';

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, any> = {}, ...children: (Node | string | null | undefined | false)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (k === 'html') e.innerHTML = v;
    else e.setAttribute(k, String(v));
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return e;
}

export const ASSET = './assets/';
export const icon = (name: string) => `${ASSET}img/icons/${name}.webp`;
export const img = (name: string) => `${ASSET}img/${name}.webp`;

export function button(label: string, onClick: () => void, cls = ''): HTMLButtonElement {
  const b = el('button', { class: 'btn ' + cls, 'data-nav': '1', type: 'button' }, label);
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    b.blur(); // keyboard navigation is handled by FocusNav; native focus would make Enter fire twice
    if (b.disabled) return;
    audio.sfx('click', 0.6);
    onClick();
  });
  return b;
}

/** Focus navigation over [data-nav] elements inside the active root. */
export class FocusNav {
  root: HTMLElement | null = null;
  current: HTMLElement | null = null;
  onBack: (() => void) | null = null;
  enabled = true;
  private mouseMoved = false;

  constructor() {
    window.addEventListener('mousemove', () => { this.mouseMoved = true; }, { passive: true });
  }

  setRoot(root: HTMLElement | null, onBack: (() => void) | null = null, autoFocus = true) {
    this.root = root;
    this.onBack = onBack;
    this.mouseMoved = false;
    const active = document.activeElement as HTMLElement | null;
    if (active && active !== document.body && active.blur) active.blur();
    this.setCurrent(null);
    if (root && autoFocus) {
      const first = this.items()[0];
      if (first) this.setCurrent(first, false);
    }
    if (root) {
      root.querySelectorAll<HTMLElement>('[data-nav]').forEach((n) => {
        if ((n as any)._navHover) return;
        (n as any)._navHover = true;
        n.addEventListener('mouseenter', () => { if (this.mouseMoved && this.root?.contains(n)) this.setCurrent(n); });
      });
    }
  }

  refresh() {
    if (!this.root) return;
    this.root.querySelectorAll<HTMLElement>('[data-nav]').forEach((n) => {
      if ((n as any)._navHover) return;
      (n as any)._navHover = true;
      n.addEventListener('mouseenter', () => { if (this.mouseMoved && this.root?.contains(n)) this.setCurrent(n); });
    });
    if (this.current && !this.root.contains(this.current)) this.setCurrent(this.items()[0] || null, false);
  }

  items(): HTMLElement[] {
    if (!this.root) return [];
    return Array.from(this.root.querySelectorAll<HTMLElement>('[data-nav]')).filter((n) => n.offsetParent !== null && !(n as any).disabled);
  }

  setCurrent(n: HTMLElement | null, sound = true) {
    if (this.current === n) return;
    this.current?.classList.remove('focus');
    this.current = n;
    if (n) {
      n.classList.add('focus');
      if (sound) audio.sfx('hover', 0.4);
      n.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    }
  }

  move(dir: 'up' | 'down' | 'left' | 'right') {
    const items = this.items();
    if (!items.length) return;
    if (!this.current || !items.includes(this.current)) { this.setCurrent(items[0]); return; }
    // range sliders take left/right
    if ((dir === 'left' || dir === 'right') && this.current instanceof HTMLInputElement && this.current.type === 'range') {
      const r = this.current;
      const step = Number(r.step || 0.05) * 2;
      r.value = String(Math.max(Number(r.min), Math.min(Number(r.max), Number(r.value) + (dir === 'right' ? step : -step))));
      r.dispatchEvent(new Event('input'));
      return;
    }
    const a = this.current.getBoundingClientRect();
    const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    let best: HTMLElement | null = null;
    let bs = Infinity;
    for (const n of items) {
      if (n === this.current) continue;
      const b = n.getBoundingClientRect();
      const bx = b.left + b.width / 2, by = b.top + b.height / 2;
      const dx = bx - ax, dy = by - ay;
      let primary: number, secondary: number;
      if (dir === 'up') { primary = -dy; secondary = Math.abs(dx); }
      else if (dir === 'down') { primary = dy; secondary = Math.abs(dx); }
      else if (dir === 'left') { primary = -dx; secondary = Math.abs(dy); }
      else { primary = dx; secondary = Math.abs(dy); }
      if (primary <= 4) continue;
      const score = primary + secondary * 2.2;
      if (score < bs) { bs = score; best = n; }
    }
    if (!best) {
      // wrap around vertically
      if (dir === 'down' || dir === 'right') best = items[0];
      else best = items[items.length - 1];
    }
    this.setCurrent(best);
  }

  confirm() {
    const c = this.current;
    if (!c) return;
    if (c instanceof HTMLInputElement && c.type === 'range') return;
    c.click();
  }

  back() {
    if (this.onBack) { audio.sfx('back', 0.6); this.onBack(); }
  }
}
