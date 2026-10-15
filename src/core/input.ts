/** Unified input: keyboard (WASD + arrows), gamepad, and touch (floating joystick). */
export type NavDir = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back' | 'pause';

export class Input {
  keys = new Set<string>();
  moveX = 0;
  moveY = 0;
  /** last input device used, for UI hints */
  device: 'keyboard' | 'gamepad' | 'touch' = 'keyboard';
  private dashQueued = false;
  private pauseQueued = false;
  onNav: ((d: NavDir) => void) | null = null;
  onAnyInput: (() => void) | null = null;

  // gamepad
  private padPrev: boolean[] = [];
  private padAxisPrev = { x: 0, y: 0 };
  private padRepeatT = 0;
  padConnected = false;

  // touch joystick
  touchEnabled = false;
  private joyId: number | null = null;
  private joyBaseX = 0;
  private joyBaseY = 0;
  private joyX = 0;
  private joyY = 0;
  private joyEl: HTMLDivElement;
  private knobEl: HTMLDivElement;
  private touchLayer: HTMLDivElement;
  dashBtn: HTMLDivElement;
  pauseBtn: HTMLDivElement;
  touchActive = false; // whether touch controls should show (in gameplay)
  dashReady = 1; // 0..1 for button ring

  constructor() {
    window.addEventListener('keydown', (e) => this.keyDown(e));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    window.addEventListener('gamepadconnected', () => { this.padConnected = true; });
    window.addEventListener('gamepaddisconnected', () => { this.padConnected = this.anyPad() != null; });

    this.touchEnabled = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    this.buildTouch();
  }

  private keyDown(e: KeyboardEvent) {
    const c = e.code;
    const target = e.target as HTMLElement;
    if (target && (target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'text')) return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(c)) e.preventDefault();
    if (this.device !== 'keyboard') this.device = 'keyboard';
    this.onAnyInput?.();
    if (!e.repeat) {
      if (c === 'Space' || c === 'ShiftLeft' || c === 'ShiftRight' || c === 'KeyK') this.dashQueued = true;
      if (c === 'Escape' || c === 'KeyP') this.pauseQueued = true;
    }
    this.keys.add(c);
    // menu navigation
    const map: Record<string, NavDir> = {
      ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left',
      ArrowRight: 'right', KeyD: 'right', Enter: 'confirm', NumpadEnter: 'confirm', Space: 'confirm',
      Escape: 'back', Backspace: 'back',
    };
    const d = map[c];
    if (d && this.onNav) this.onNav(d);
  }

  consumeDash(): boolean {
    const d = this.dashQueued;
    this.dashQueued = false;
    return d;
  }
  consumePause(): boolean {
    const p = this.pauseQueued;
    this.pauseQueued = false;
    return p;
  }
  clearQueued() {
    this.dashQueued = false;
    this.pauseQueued = false;
  }

  private anyPad(): Gamepad | null {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }

  /** Call once per frame. dt in seconds. */
  update(dt: number) {
    let x = 0, y = 0;
    const k = this.keys;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (k.has('KeyW') || k.has('ArrowUp')) y -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y += 1;

    // gamepad
    const pad = this.anyPad();
    if (pad) {
      this.padConnected = true;
      const btn = (i: number) => !!(pad.buttons[i] && pad.buttons[i].pressed);
      let ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
      const mag = Math.hypot(ax, ay);
      if (mag < 0.22) { ax = 0; ay = 0; }
      else { const s = Math.min(1, (mag - 0.22) / 0.7) / mag; ax *= s; ay *= s; }
      if (btn(14)) ax = -1;
      if (btn(15)) ax = 1;
      if (btn(12)) ay = -1;
      if (btn(13)) ay = 1;
      if (ax !== 0 || ay !== 0) { x = ax; y = ay; this.device = 'gamepad'; }
      const pressed = (i: number) => btn(i) && !this.padPrev[i];
      if (pressed(0) || pressed(1) || pressed(2) || pressed(3) || pressed(9) || pressed(5) || pressed(7)) {
        this.device = 'gamepad';
        this.onAnyInput?.();
      }
      if (pressed(0) || pressed(5) || pressed(7) || pressed(2)) this.dashQueued = true;
      if (pressed(9) || pressed(8)) this.pauseQueued = true;
      // nav events
      if (this.onNav) {
        if (pressed(0)) this.onNav('confirm');
        if (pressed(1)) this.onNav('back');
        if (pressed(9)) this.onNav('pause');
        // directional with repeat
        const nx = Math.abs(ax) > 0.5 ? Math.sign(ax) : 0;
        const ny = Math.abs(ay) > 0.5 ? Math.sign(ay) : 0;
        const changed = nx !== this.padAxisPrev.x || ny !== this.padAxisPrev.y;
        this.padRepeatT -= dt;
        if ((nx || ny) && (changed || this.padRepeatT <= 0)) {
          this.padRepeatT = changed ? 0.4 : 0.15;
          if (ny < 0) this.onNav('up');
          else if (ny > 0) this.onNav('down');
          else if (nx < 0) this.onNav('left');
          else if (nx > 0) this.onNav('right');
        }
        this.padAxisPrev = { x: nx, y: ny };
      }
      this.padPrev = pad.buttons.map((b) => b.pressed);
    }

    // touch joystick
    if (this.joyId !== null) {
      const dx = this.joyX - this.joyBaseX, dy = this.joyY - this.joyBaseY;
      const max = 56;
      const d = Math.hypot(dx, dy);
      if (d > 6) {
        const m = Math.min(1, d / max);
        x = (dx / d) * m;
        y = (dy / d) * m;
      }
    }

    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    this.moveX = x;
    this.moveY = y;
    // dash button cooldown ring
    if (this.dashBtn) this.dashBtn.style.setProperty('--ready', String(this.dashReady));
  }

  private buildTouch() {
    const layer = document.createElement('div');
    layer.id = 'touch-layer';
    this.touchLayer = layer;
    const joy = document.createElement('div');
    joy.className = 'joy';
    const knob = document.createElement('div');
    knob.className = 'joy-knob';
    joy.appendChild(knob);
    layer.appendChild(joy);
    this.joyEl = joy;
    this.knobEl = knob;

    const dash = document.createElement('div');
    dash.className = 'touch-btn dash-btn';
    dash.innerHTML = '<span>DASH</span>';
    this.dashBtn = dash;
    const pause = document.createElement('div');
    pause.className = 'touch-btn pause-btn';
    pause.innerHTML = '<span>II</span>';
    this.pauseBtn = pause;
    document.body.appendChild(layer);
    document.body.appendChild(dash);
    document.body.appendChild(pause);

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      if (!this.touchActive) return;
      this.device = 'touch';
      if (this.joyId === null) {
        this.joyId = e.pointerId;
        this.joyBaseX = this.joyX = e.clientX;
        this.joyBaseY = this.joyY = e.clientY;
        joy.style.display = 'block';
        joy.style.left = e.clientX + 'px';
        joy.style.top = e.clientY + 'px';
        knob.style.transform = 'translate(-50%, -50%)';
        try { layer.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      }
      e.preventDefault();
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== this.joyId) return;
      this.joyX = e.clientX;
      this.joyY = e.clientY;
      let dx = this.joyX - this.joyBaseX, dy = this.joyY - this.joyBaseY;
      const d = Math.hypot(dx, dy);
      const max = 56;
      // drag the base along if the finger goes far (floating stick)
      if (d > max * 1.6) {
        const k = (d - max * 1.6) / d;
        this.joyBaseX += dx * k;
        this.joyBaseY += dy * k;
        joy.style.left = this.joyBaseX + 'px';
        joy.style.top = this.joyBaseY + 'px';
        dx = this.joyX - this.joyBaseX;
        dy = this.joyY - this.joyBaseY;
      }
      const dd = Math.hypot(dx, dy);
      const cl = dd > max ? max / dd : 1;
      knob.style.transform = `translate(calc(-50% + ${dx * cl}px), calc(-50% + ${dy * cl}px))`;
      e.preventDefault();
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== this.joyId) return;
      this.joyId = null;
      joy.style.display = 'none';
    };
    layer.addEventListener('pointerdown', onDown);
    layer.addEventListener('pointermove', onMove);
    layer.addEventListener('pointerup', onUp);
    layer.addEventListener('pointercancel', onUp);
    dash.addEventListener('pointerdown', (e) => { this.dashQueued = true; this.device = 'touch'; e.preventDefault(); e.stopPropagation(); });
    pause.addEventListener('pointerdown', (e) => { this.pauseQueued = true; e.preventDefault(); e.stopPropagation(); });
  }

  setTouchActive(on: boolean) {
    this.touchActive = on;
    const show = on && this.touchEnabled;
    this.touchLayer.style.display = on ? 'block' : 'none';
    this.dashBtn.style.display = show ? 'flex' : 'none';
    this.pauseBtn.style.display = on ? 'flex' : 'none';
    if (!on) {
      this.joyId = null;
      this.joyEl.style.display = 'none';
    }
  }
}
