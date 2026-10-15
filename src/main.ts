import '@fontsource/luckiest-guy/400.css';
import '@fontsource/fredoka/400.css';
import '@fontsource/fredoka/600.css';
import './ui/style.css';
import { Application } from 'pixi.js';
import { audio } from './core/audio';
import { Input } from './core/input';
import { loadSave, writeSave, wipeSave, SaveData } from './core/save';
import { Game, STEP, Hooks, xpFor } from './game/game';
import { loadSpriteAtlas, loadTiles, loadIcons, makeFxTextures, makeDigitTextures, ICONS } from './game/textures';
import { WEAPONS } from './game/weapons';
import { PASSIVES, rollChoices, applyChoice, rollChest, Choice, SHOP, metaStats, STARTERS } from './game/upgrades';
import { STAGES } from './game/stages';
import { ENEMIES } from './game/enemies';
import { BOSSES } from './game/bosses';
import { el, button, icon, img, FocusNav, ASSET } from './ui/dom';
import { INTRO, ENDING, CHAPTER_LINES, BOSS_LINES, GAMEOVER_LINE, DEATH_LINE, Line, Panel } from './ui/story';

type Screen = 'loading' | 'title' | 'menu' | 'loadout' | 'shop' | 'settings' | 'howto' | 'records' | 'intro' | 'playing' | 'paused'
  | 'levelup' | 'chest' | 'stageclear' | 'gameover' | 'victory' | 'ending';

const MUSIC: Record<string, string[]> = {
  menu: ['menu_a', 'menu_b'], intro: ['intro'], shop: ['shop'], gameover: ['gameover'], victory: ['victory'], ending: ['ending'],
};

const STARTER_UNLOCKS: Record<string, { text: string; check: (s: SaveData) => boolean } | null> = {
  ember: null,
  whip: { text: 'Defeat Duchess Dustwing', check: (s) => (s.stats.bosses.duchess || 0) > 0 },
  ring: { text: 'Reach Drizzleport (stage 2)', check: (s) => s.stats.bestStage >= 2 },
  halo: { text: 'Reach level 15 in one run', check: (s) => s.stats.bestLevel >= 15 },
  volley: { text: 'Defeat 1,000 enemies in total', check: (s) => s.stats.kills >= 1000 },
  cracker: { text: 'Defeat Baron von Drizzle', check: (s) => (s.stats.bosses.baron || 0) > 0 },
  trail: { text: 'Survive 10 minutes in one run', check: (s) => s.stats.longestRun >= 600 },
  aura: { text: 'Reach level 25 in one run', check: (s) => s.stats.bestLevel >= 25 },
  spark: { text: 'Win a run', check: (s) => s.stats.wins > 0 },
};

const fmtTime = (t: number) => {
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
};

class App {
  app!: Application;
  game!: Game;
  input = new Input();
  save: SaveData = loadSave();
  screen: Screen = 'loading';
  nav = new FocusNav();
  ui = document.getElementById('ui')!;
  screens: Record<string, HTMLElement> = {};
  hud!: HTMLElement;
  fadeEl!: HTMLElement;
  dangerEl!: HTMLElement;
  hintsShown = 0;
  hudEls: Record<string, HTMLElement> = {};
  toasts!: HTMLElement;
  subtitle!: HTMLElement;
  acc = 0;
  runActive = false;
  choices: Choice[] = [];
  banishMode = false;
  fps = 60;
  fpsAcc = 0;
  fpsFrames = 0;
  lineQueue: Line[] = [];
  lineToken = 0;
  hudT = 0;
  lastHud: Record<string, string> = {};
  stageClearT = 0;
  chestT = 0;
  seedNext: number | null = null;
  pendingVictory = false;
  cutsceneToken = 0;
  settingsBack: Screen = 'menu';
  howtoBack: Screen = 'menu';
  qaChoicesLog: string[] = [];
  runResult: any = null;
  perfUpdate = 0;
  perfRender = 0;

  async boot() {
    this.buildLoading();
    const app = new Application();
    const touch = this.input.touchEnabled;
    await app.init({
      resizeTo: window, antialias: false, backgroundColor: 0x120e0b,
      resolution: Math.min(window.devicePixelRatio || 1, touch ? 1.5 : 2), autoDensity: true,
      powerPreference: 'high-performance', preference: 'webgl',
    });
    this.app = app;
    document.getElementById('game')!.appendChild(app.canvas);
    this.setProgress(0.1, 'Striking the match...');
    try { await Promise.all([document.fonts.load('40px "Luckiest Guy"'), document.fonts.load('600 16px "Fredoka"')]); } catch { /* fonts optional */ }
    const fx = makeFxTextures();
    const digits = makeDigitTextures();
    const T = await loadSpriteAtlas(ASSET, (p) => this.setProgress(0.15 + p * 0.6, 'Gathering kindling...'));
    this.setProgress(0.8, 'Painting the backdrops...');
    const tiles = await loadTiles(ASSET);
    const iconNames = [...ICONS, ...Object.values(WEAPONS).map((w) => w.icon), ...Object.values(PASSIVES).map((p) => p.icon), 'reroll', 'banish', 'skull', 'trophy', 'hourglass', 'heart', 'star'];
    const icons = await loadIcons(ASSET, Array.from(new Set(iconNames)));
    this.setProgress(0.95, 'Almost lit...');
    // preload a few UI images in the browser cache
    for (const n of ['menu_bg', 'logo', 'story_intro1']) { const i = new Image(); i.src = img(n); }
    this.game = new Game(app, T, fx, icons, tiles, digits, this.hooks());
    app.stage.addChild(this.game.root);
    app.stage.visible = false;
    const onResize = () => this.game.resize(app.renderer.width / app.renderer.resolution, app.renderer.height / app.renderer.resolution);
    app.renderer.on('resize', onResize);
    onResize();
    this.applySettings();
    this.buildUI();
    this.input.onNav = (d) => this.onNav(d);
    // swallow "ghost" clicks that land on a freshly shown screen (touch taps, double clicks)
    this.ui.addEventListener('click', (e) => {
      if (performance.now() < this.navLockUntil) { e.stopPropagation(); e.preventDefault(); }
    }, true);
    this.input.onDigit = (n) => { if (this.screen === 'levelup' && performance.now() >= this.navLockUntil) this.pickChoice(n - 1); };
    this.input.onAnyInput = () => { if (this.screen === 'title') this.leaveTitle(); };
    app.ticker.add((t) => this.tick(t.deltaMS / 1000));
    const autoPause = () => { if (this.screen === 'playing') this.pause(); };
    document.addEventListener('visibilitychange', () => { if (document.hidden) autoPause(); });
    this.installQA();
    this.setProgress(1, 'Ready');
    this.show('title');
  }

  /* ================================================================ loading */
  buildLoading() {
    const s = el('div', { class: 'screen show', id: 'loading' },
      el('div', { class: 'match-spin', html: '<svg viewBox="0 0 60 60" width="60" height="60"><rect x="26" y="20" width="9" height="36" rx="2" fill="#e9c88f" stroke="#1b1612" stroke-width="3"/><ellipse cx="30.5" cy="17" rx="9" ry="11" fill="#1b1612"/><path d="M30 2 q6 6 0 10 q-6 -4 0 -10" fill="#ffb347" stroke="#1b1612" stroke-width="2"/></svg>' }),
      el('div', { class: 'msg' }, 'Loading...'),
      el('div', { class: 'bar' }, el('div', { class: 'fill' })),
    );
    this.ui.appendChild(s);
    this.screens.loading = s;
  }
  setProgress(p: number, msg: string) {
    const s = this.screens.loading;
    (s.querySelector('.fill') as HTMLElement).style.width = Math.round(p * 100) + '%';
    (s.querySelector('.msg') as HTMLElement).textContent = msg;
  }

  /* ================================================================ UI build */
  buildUI() {
    // HUD
    this.hud = el('div', { id: 'hud', class: 'passthrough' });
    this.hud.innerHTML = `
      <div class="xpbar"><div class="fill"></div></div><div class="lvl">LV 1</div>
      <div class="hud-left"><div class="hpbar"><div class="fill"></div><div class="txt">100 / 100</div></div>
        <div class="slots weapons"></div><div class="slots passives"></div></div>
      <div class="hud-center"><div class="timer">00:00</div><div class="stagename"></div></div>
      <div class="hud-right"><div class="stat"><img src="${icon('skull')}" alt=""><span class="kills">0</span></div>
        <div class="stat"><img src="${icon('coin')}" alt=""><span class="coins">0</span></div></div>
      <div class="bossbar"><div class="name"></div><div class="bar"><div class="fill"></div></div></div>
      <div class="dash-ind"><div class="ring"></div><span class="dash-label">SPACE: DASH</span></div>
      <div class="fps"></div>`;
    this.ui.appendChild(this.hud);
    const q = (s: string) => this.hud.querySelector(s) as HTMLElement;
    this.hudEls = {
      xp: q('.xpbar .fill'), lvl: q('.lvl'), hp: q('.hpbar .fill'), hpt: q('.hpbar .txt'), weapons: q('.weapons'), passives: q('.passives'),
      timer: q('.timer'), stage: q('.stagename'), kills: q('.kills'), coins: q('.coins'), boss: q('.bossbar'), bossName: q('.bossbar .name'),
      bossFill: q('.bossbar .fill'), dash: q('.dash-ind .ring'), dashLabel: q('.dash-label'), fps: q('.fps'), dashInd: q('.dash-ind'),
    };
    this.fadeEl = el('div', { id: 'fade', class: 'passthrough' });
    this.ui.appendChild(this.fadeEl);
    this.dangerEl = el('div', { id: 'danger', class: 'passthrough' });
    this.ui.appendChild(this.dangerEl);
    this.toasts = el('div', { id: 'toasts', class: 'passthrough' });
    this.ui.appendChild(this.toasts);
    this.subtitle = el('div', { id: 'subtitle', class: 'passthrough' });
    this.ui.appendChild(this.subtitle);

    for (const id of ['title', 'menu', 'loadout', 'shop', 'settings', 'howto', 'records', 'cutscene', 'levelup', 'chest', 'pause', 'stageclear', 'gameover', 'victory']) {
      const s = el('div', { class: 'screen', id });
      this.ui.appendChild(s);
      this.screens[id] = s;
    }
    // title
    const t = this.screens.title;
    t.classList.add('passthrough-no');
    t.append(
      el('div', { class: 'menu-bg', style: { backgroundImage: `url(${img('menu_bg')})` } }),
      el('div', { class: 'menu-shade' }),
      el('img', { class: 'logo', src: img('logo'), alt: 'Strike Twice' }),
      el('div', { class: 'subtitle-novaki' }, 'A NOVAKI ROGUELITE'),
      el('div', { class: 'spacer' }),
      el('div', { class: 'press' }, this.input.touchEnabled ? 'TAP TO START' : 'PRESS ANY KEY'),
    );
    t.addEventListener('pointerdown', () => this.leaveTitle());
    // the whole document unlocks audio on first gesture
    const unlock = () => audio.unlock();
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
    // pause button (touch / mouse)
    this.input.pauseBtn.addEventListener('click', () => {});
  }

  leaveTitle() {
    if (this.screen !== 'title') return;
    audio.unlock();
    audio.sfx('strike', 0.8);
    this.show('menu');
  }

  /* ================================================================ screens */
  navLockUntil = 0;
  show(s: Screen) {
    const prev = this.screen;
    this.screen = s;
    this.navLockUntil = performance.now() + 220;
    const map: Record<string, string> = { paused: 'pause', intro: 'cutscene', ending: 'cutscene' };
    const id = map[s] || s;
    for (const [k, e] of Object.entries(this.screens)) e.classList.toggle('show', k === id);
    const inRun = ['playing', 'paused', 'levelup', 'chest', 'stageclear'].includes(s);
    document.body.classList.toggle('overlay-open', ['paused', 'levelup', 'chest', 'stageclear', 'gameover', 'victory'].includes(s));
    this.hud.classList.toggle('show', inRun);
    this.input.setTouchActive(s === 'playing');
    if (this.app) this.app.stage.visible = inRun || (s === 'gameover' && this.runActive) || s === 'victory' && false;
    if (s === 'gameover') this.app.stage.visible = true;
    this.input.clearQueued();
    switch (s) {
      case 'menu': this.renderMenu(); audio.playMusic('menu', MUSIC.menu); break;
      case 'loadout': this.renderLoadout(); break;
      case 'shop': this.renderShop(); audio.playMusic('shop', MUSIC.shop); break;
      case 'settings': this.renderSettings(); break;
      case 'howto': this.renderHowto(); break;
      case 'records': this.renderRecords(); break;
      case 'paused': this.renderPause(); break;
      case 'playing': this.nav.setRoot(null); break;
      default: break;
    }
    void prev;
  }

  onNav(d: string) {
    if (this.screen === 'title') { this.leaveTitle(); return; }
    if (performance.now() < this.navLockUntil) return;
    if (this.screen === 'playing') return; // gameplay reads the input directly
    if (this.screen === 'intro' || this.screen === 'ending') {
      if (d === 'back') this.skipCutscene();
      else if (d === 'confirm') this.nextLine();
      return;
    }
    if (this.screen === 'chest') { if (d === 'confirm' || d === 'back') this.closeChest(); return; }
    if (this.screen === 'paused' && (d === 'pause' || (d === 'back' && this.nav.root === this.screens.pause))) { this.resume(); return; }
    if (d === 'pause') return;
    if (d === 'up' || d === 'down' || d === 'left' || d === 'right') this.nav.move(d);
    else if (d === 'confirm') this.nav.confirm();
    else if (d === 'back') this.nav.back();
  }

  /* ---------------- main menu */
  renderMenu() {
    const m = this.screens.menu;
    m.innerHTML = '';
    const canContinue = false;
    void canContinue;
    const btns = el('div', { class: 'menu-buttons' },
      button('Play', () => this.onPlay(), 'primary'),
      button('Workshop', () => this.show('shop')),
      button('How to Play', () => { this.howtoBack = 'menu'; this.show('howto'); }),
      button('Settings', () => { this.settingsBack = 'menu'; this.show('settings'); }),
      button('Records & Credits', () => this.show('records')),
      this.save.seenIntro ? button('Replay Intro', () => this.playIntro(() => this.show('menu'))) : null,
    );
    m.append(
      el('div', { class: 'menu-bg', style: { backgroundImage: `url(${img('menu_bg')})` } }),
      el('div', { class: 'menu-shade' }),
      el('img', { class: 'logo', src: img('logo'), alt: 'Strike Twice' }),
      el('div', { class: 'subtitle-novaki' }, 'A NOVAKI ROGUELITE'),
      btns,
      el('div', { class: 'menu-corner' }, el('div', { class: 'coins-pill' }, el('img', { src: icon('coin'), alt: '' }), String(this.save.coins))),
      el('div', { class: 'version' }, 'v1.0 - made with varlik-generated art, music & voices'),
    );
    this.nav.setRoot(m, null);
  }

  onPlay() {
    if (!this.save.seenIntro) {
      this.playIntro(() => {
        this.save.seenIntro = true;
        writeSave(this.save);
        this.show('loadout');
      });
    } else this.show('loadout');
  }

  /* ---------------- loadout (starting weapon) */
  starterUnlocked(id: string) {
    const u = STARTER_UNLOCKS[id];
    return !u || this.save.unlocks.includes('start_' + id);
  }

  renderLoadout() {
    const s = this.screens.loadout;
    s.className = 'screen show overlay';
    s.innerHTML = '';
    const grid = el('div', { class: 'loadout-grid' });
    let sel = this.starterUnlocked(this.save.startWeapon) ? this.save.startWeapon : 'ember';
    const cards: HTMLElement[] = [];
    for (const id of STARTERS) {
      const w = WEAPONS[id];
      const unlocked = this.starterUnlocked(id);
      const u = STARTER_UNLOCKS[id];
      const c = el('div', { class: 'lo-card' + (unlocked ? '' : ' locked') + (id === sel ? ' sel' : ''), 'data-nav': unlocked ? '1' : null },
        el('img', { src: icon(w.icon), alt: '' }),
        el('div', { class: 'nm' }, w.name),
        el('div', { class: 'ds' }, unlocked ? w.desc : 'Locked: ' + (u?.text || '')),
      );
      if (unlocked) c.addEventListener('click', () => {
        if (sel === id) { start(); return; }
        sel = id;
        cards.forEach((x) => x.classList.remove('sel'));
        c.classList.add('sel');
        audio.sfx('click', 0.5);
      });
      cards.push(c);
      grid.appendChild(c);
    }
    const start = () => {
      this.save.startWeapon = sel;
      writeSave(this.save);
      this.startRun({ weapon: sel });
    };
    const panel = el('div', { class: 'panel paper' },
      el('h2', {}, 'Choose Your Spark'),
      el('div', { style: { textAlign: 'center', fontWeight: '600', marginBottom: '10px' } }, 'Pick the weapon Novaki starts with. Unlock more by playing.'),
      el('div', { class: 'scroll' }, grid),
      el('div', { class: 'footer' }, button('Back', () => this.show('menu')), button('Strike!', start, 'primary')),
    );
    s.appendChild(panel);
    this.nav.setRoot(s, () => this.show('menu'));
    const selCard = cards[STARTERS.indexOf(sel)];
    if (selCard) this.nav.setCurrent(selCard, false);
  }

  /* ---------------- shop */
  renderShop() {
    const s = this.screens.shop;
    s.className = 'screen show overlay';
    s.innerHTML = '';
    const grid = el('div', { class: 'shop-grid' });
    for (const it of SHOP) {
      const rank = this.save.shop[it.id] || 0;
      const maxed = rank >= it.max;
      const cost = it.cost(rank);
      const poor = !maxed && this.save.coins < cost;
      const pips = el('div', { class: 'pips' });
      for (let i = 0; i < it.max; i++) pips.appendChild(el('div', { class: 'pip' + (i < rank ? ' on' : '') }));
      const card = el('div', { class: 'shop-item' + (maxed ? ' maxed' : '') + (poor ? ' poor' : ''), 'data-nav': '1' },
        el('img', { src: icon(it.icon), alt: '' }),
        el('div', {}, el('div', { class: 'nm' }, it.name), el('div', { class: 'ds' }, it.desc), pips),
        el('div', { class: 'cost' }, maxed ? 'MAX' : el('span', {}, String(cost)), maxed ? null : el('img', { src: icon('coin'), alt: '' })),
      );
      card.addEventListener('click', () => {
        if (maxed) return;
        if (this.save.coins < cost) { audio.sfx('back', 0.6); card.animate([{ transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'none' }], { duration: 200 }); return; }
        this.save.coins -= cost;
        this.save.shop[it.id] = rank + 1;
        writeSave(this.save);
        audio.sfx('coin', 0.8);
        const idx = SHOP.indexOf(it);
        this.renderShop();
        const items = this.nav.items();
        if (items[idx]) this.nav.setCurrent(items[idx], false);
      });
      grid.appendChild(card);
    }
    const back = () => this.show('menu');
    s.appendChild(el('div', { class: 'panel paper' },
      el('h2', {}, "Novaki's Workshop"),
      el('div', { style: { textAlign: 'center', marginBottom: '10px' } }, el('span', { class: 'coins-pill' }, el('img', { src: icon('coin'), alt: '' }), String(this.save.coins) + ' cinder coins')),
      el('div', { class: 'scroll' }, grid),
      el('div', { class: 'footer' }, button('Back', back)),
    ));
    this.nav.setRoot(s, back);
  }

  /* ---------------- settings */
  renderSettings() {
    const s = this.screens.settings;
    s.className = 'screen show overlay';
    s.innerHTML = '';
    const st = this.save.settings;
    const slider = (label: string, key: 'music' | 'sfx' | 'voice') => {
      const r = el('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(st[key]), 'data-nav': '1', 'aria-label': label }) as HTMLInputElement;
      r.addEventListener('input', () => {
        st[key] = Number(r.value);
        this.applySettings();
        writeSave(this.save);
        if (key === 'sfx') audio.sfx('xp', 0.8);
      });
      return el('div', { class: 'row' }, el('span', {}, label), r);
    };
    const toggle = (label: string, key: 'shake' | 'flashes' | 'dmgNumbers' | 'showFps' | 'subtitles') => {
      const t = el('div', { class: 'toggle' + (st[key] ? ' on' : ''), 'data-nav': '1', role: 'switch', 'aria-label': label });
      t.addEventListener('click', () => {
        st[key] = !st[key];
        t.classList.toggle('on', st[key]);
        this.applySettings();
        writeSave(this.save);
        audio.sfx('click', 0.6);
      });
      return el('div', { class: 'row' }, el('span', {}, label), t);
    };
    const back = () => this.show(this.settingsBack);
    const fsBtn = button(document.fullscreenElement ? 'Exit Fullscreen' : 'Fullscreen', () => {
      try {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen?.();
      } catch { /* not supported */ }
      setTimeout(() => this.renderSettings(), 300);
    }, 'small');
    const reset = button('Reset Progress', () => {
      if (reset.dataset.armed) {
        this.save = wipeSave();
        writeSave(this.save);
        this.applySettings();
        this.toast('Progress wiped. A fresh match!', 'warn');
        this.renderSettings();
      } else {
        reset.dataset.armed = '1';
        reset.textContent = 'Really? Click again';
      }
    }, 'small');
    s.appendChild(el('div', { class: 'panel paper', style: { width: 'min(620px, 94vw)' } },
      el('h2', {}, 'Settings'),
      el('div', { class: 'scroll' },
        slider('Music volume', 'music'),
        slider('Sound volume', 'sfx'),
        slider('Voice volume', 'voice'),
        toggle('Screen shake', 'shake'),
        toggle('Screen flashes', 'flashes'),
        toggle('Damage numbers', 'dmgNumbers'),
        toggle('Subtitles', 'subtitles'),
        toggle('Show FPS', 'showFps'),
        el('div', { class: 'row' }, el('span', {}, 'Display'), fsBtn),
        el('div', { class: 'row' }, el('span', {}, 'Save data'), reset),
      ),
      el('div', { class: 'footer' }, button('Back', back)),
    ));
    this.nav.setRoot(s, back);
  }

  applySettings() {
    const st = this.save.settings;
    audio.setVolumes(st.music, st.sfx, st.voice);
    if (this.game) {
      this.game.settings.shake = st.shake;
      this.game.settings.dmgNumbers = st.dmgNumbers;
      this.game.settings.flashes = st.flashes;
    }
    if (this.hudEls.fps) this.hudEls.fps.style.display = st.showFps ? 'block' : 'none';
  }

  /* ---------------- how to play */
  renderHowto(tab = 'basics') {
    const s = this.screens.howto;
    s.className = 'screen show overlay';
    s.innerHTML = '';
    const back = () => this.show(this.howtoBack);
    const tabs = el('div', { class: 'tabs' });
    const mk = (id: string, label: string) => {
      const b = button(label, () => this.renderHowto(id), 'small' + (tab === id ? ' active' : ''));
      tabs.appendChild(b);
    };
    mk('basics', 'Basics'); mk('evos', 'Evolutions'); mk('bestiary', 'Bestiary');
    let body: HTMLElement;
    if (tab === 'basics') {
      body = el('div', { class: 'howto-cols', html: `
        <div><h3>Survive &amp; Strike</h3>
        <p>Novaki fights on his own: weapons fire <b>automatically</b>. Your job is to <b>move</b>, dodge, and collect the glowing <b>embers</b> enemies drop.</p>
        <p>Fill the ember bar to <b>level up</b> and pick an upgrade: new weapons, weapon levels, or passive trinkets.</p>
        <p>Each stage ends with a <b>boss</b>. Beat all three to relight Tinderbox. A full run takes about 20 minutes.</p>
        <p><b>Evolutions:</b> get a weapon to level 8 while owning its partner trinket, and it can evolve into something much stronger.</p>
        <p>Coins you collect stay with you: spend them in the <b>Workshop</b> for permanent upgrades.</p></div>
        <div><h3>Controls</h3>
        <p><b>Keyboard:</b> move with <span class="keycap">W</span><span class="keycap">A</span><span class="keycap">S</span><span class="keycap">D</span> or arrow keys. Dash with <span class="keycap">Space</span> or <span class="keycap">Shift</span>. Pause with <span class="keycap">Esc</span> or <span class="keycap">P</span>. Pick upgrades with <span class="keycap">1</span>-<span class="keycap">4</span>.</p>
        <p><b>Gamepad:</b> left stick or d-pad to move, <span class="keycap">A</span> / <span class="keycap">RB</span> to dash, <span class="keycap">Start</span> to pause. Menus: stick + <span class="keycap">A</span>, <span class="keycap">B</span> to go back.</p>
        <p><b>Touch:</b> drag anywhere to move with the floating joystick. Tap <b>DASH</b> to dodge, <b>II</b> to pause.</p>
        <h3>Pickups</h3>
        <p><img src="${icon('marshmallow')}" style="height:22px;vertical-align:middle"> heals &nbsp; <img src="${icon('magnet')}" style="height:22px;vertical-align:middle"> pulls all embers &nbsp; <img src="${icon('firecracker')}" style="height:22px;vertical-align:middle"> clears the screen &nbsp; <img src="${icon('watch')}" style="height:22px;vertical-align:middle"> freezes time &nbsp; <img src="${icon('goldmatch')}" style="height:22px;vertical-align:middle"> golden match: invincible and ablaze &nbsp; <img src="${icon('chest')}" style="height:22px;vertical-align:middle"> treasure. Smash lanterns, barrels and candles to find them.</p></div>` });
    } else if (tab === 'evos') {
      body = el('div', { class: 'evo-table' });
      for (const w of Object.values(WEAPONS)) {
        const pas = PASSIVES[w.evo.passive];
        body.appendChild(el('div', { class: 'evo-row' },
          el('img', { src: icon(w.icon), alt: '' }), el('span', { class: 'plus' }, '+'), el('img', { src: icon(pas.icon), alt: '' }),
          el('div', {}, el('div', { style: { fontFamily: 'var(--font-h)', fontSize: '15px' } }, w.evo.name), el('div', {}, `${w.name} (Lv 8) + ${pas.name}`)),
        ));
      }
    } else {
      body = el('div', { class: 'bestiary' });
      for (const st of STAGES) {
        const b = BOSSES[st.boss];
        body.appendChild(el('div', { class: 'beast boss' }, el('img', { src: img(b.tex), alt: '' }), el('div', { class: 'nm' }, b.name), el('div', {}, `${b.title}. ${b.desc}`)));
        const types = new Set<string>();
        for (const w of st.waves) for (const k of Object.keys(w.mix)) if (!['moth', 'raindrop'].includes(k) || st.id < 3) types.add(k);
        for (const k of types) {
          const e = ENEMIES[k];
          if (!e || (st.id === 3 && ['moth', 'raindrop'].includes(k))) continue;
          if (Array.from(STAGES.slice(0, st.id - 1)).some((o) => o.waves.some((w) => w.mix[k]))) continue;
          body.appendChild(el('div', { class: 'beast' }, el('img', { src: img(e.tex), alt: '' }), el('div', { class: 'nm' }, e.name), el('div', {}, e.desc)));
        }
      }
    }
    s.appendChild(el('div', { class: 'panel paper' }, el('h2', {}, 'How to Play'), tabs, el('div', { class: 'scroll' }, body), el('div', { class: 'footer' }, button('Back', back))));
    this.nav.setRoot(s, back);
    const active = tabs.querySelector('.active') as HTMLElement;
    if (active) this.nav.setCurrent(active, false);
  }

  /* ---------------- records */
  renderRecords() {
    const s = this.screens.records;
    s.className = 'screen show overlay';
    s.innerHTML = '';
    const st = this.save.stats;
    const back = () => this.show('menu');
    const rows: [string, string][] = [
      ['Runs played', String(st.runs)], ['Victories', String(st.wins)], ['Fastest victory', st.bestTime ? fmtTime(st.bestTime) : '-'],
      ['Longest run', fmtTime(st.longestRun)], ['Furthest stage', st.bestStage ? STAGES[Math.min(3, st.bestStage) - 1].name : '-'],
      ['Highest level', String(st.bestLevel)], ['Enemies snuffed', String(st.kills)], ['Coins earned', String(st.totalCoins)],
      ['Duchess Dustwing defeated', String(st.bosses.duchess || 0)], ['Baron von Drizzle defeated', String(st.bosses.baron || 0)], ['The Snuffer defeated', String(st.bosses.snuffer || 0)],
    ];
    const grid = el('div', { class: 'results' });
    for (const [k, v] of rows) grid.append(el('div', { class: 'k' }, k), el('div', { class: 'v' }, v));
    const unl = el('div', { style: { marginTop: '10px', fontWeight: '600' } }, 'Starting sparks unlocked: ' + STARTERS.filter((id) => this.starterUnlocked(id)).map((id) => WEAPONS[id].name).join(', '));
    const credits = el('div', { class: 'credits', html: `<h3>Credits</h3>
      <p><b>Novaki: Strike Twice</b> was built for the Novaki AI game test.</p>
      <p>All illustrations, sprites and icons were generated with <b>varlik image</b> (GPT image model); the soundtrack with <b>varlik music</b> (Lyria); every voice line with <b>varlik voice</b> (Gemini TTS). Sound effects are synthesized in code. Novaki is based on the official reference sheet.</p>
      <p>Code, design and writing by an AI coding agent. Engine: PixiJS. Fonts: Luckiest Guy &amp; Fredoka (SIL Open Font License).</p>` });
    s.appendChild(el('div', { class: 'panel paper', style: { width: 'min(620px, 94vw)' } }, el('h2', {}, 'Records'), el('div', { class: 'scroll' }, grid, unl, credits), el('div', { class: 'footer' }, button('Back', back))));
    this.nav.setRoot(s, back);
  }

  /* ================================================================ cutscenes & voice */
  playIntro(done: () => void) { this.playCutscene(INTRO, 'intro', 'intro', done); }

  cutsceneDone: (() => void) | null = null;
  csLineSkip: (() => void) | null = null;

  playCutscene(panels: Panel[], screen: 'intro' | 'ending', music: string, done: () => void) {
    const token = ++this.cutsceneToken;
    this.cutsceneDone = done;
    this.show(screen);
    audio.playMusic(music, MUSIC[music]);
    const s = this.screens.cutscene;
    s.innerHTML = '';
    const frame = el('div', { class: 'frame' });
    const backdrop = el('div', { class: 'backdrop' });
    frame.appendChild(backdrop);
    const imgs = panels.map((p) => el('img', { src: img(p.img), alt: '' }));
    imgs.forEach((i) => frame.appendChild(i));
    const skip = button('Skip >>', () => this.skipCutscene(), 'small skip');
    s.append(frame, el('div', { class: 'bars' }), el('div', { class: 'grain' }), el('div', { class: 'vig' }), skip);
    s.addEventListener('pointerdown', (e) => { if (e.target === skip) return; this.nextLine(); });
    this.nav.setRoot(s, () => this.skipCutscene(), false);
    audio.preloadVoice(panels.flatMap((p) => p.lines.map((l) => l.voice)));
    const run = async () => {
      for (let i = 0; i < panels.length; i++) {
        if (token !== this.cutsceneToken) return;
        const im = imgs[i];
        imgs.forEach((x, j) => x.classList.toggle('show', j === i));
        backdrop.style.backgroundImage = `url(${img(panels[i].img)})`;
        const total = panels[i].lines.length * 9;
        im.style.transition = 'opacity 1s, transform ' + total + 's linear';
        im.style.transform = 'scale(1.0)';
        requestAnimationFrame(() => { im.style.transform = `scale(1.12) translate(${i % 2 ? '-' : ''}2%, -1%)`; });
        await this.wait(600);
        for (const line of panels[i].lines) {
          if (token !== this.cutsceneToken) return;
          await this.sayLine(line, true);
          await this.wait(450);
        }
      }
      if (token !== this.cutsceneToken) return;
      this.endCutscene();
    };
    run();
  }

  nextLine() { this.csLineSkip?.(); }

  skipCutscene() {
    if (this.screen !== 'intro' && this.screen !== 'ending') return;
    this.endCutscene();
  }

  endCutscene() {
    this.cutsceneToken++;
    audio.stopVoice();
    this.hideSubtitle();
    const d = this.cutsceneDone;
    this.cutsceneDone = null;
    d?.();
  }

  wait(ms: number) { return new Promise<void>((r) => setTimeout(r, ms)); }

  /** Speak a line with subtitles; resolves when finished (or skipped). */
  sayLine(line: Line, skippable = false): Promise<void> {
    const token = ++this.lineToken;
    return new Promise<void>((resolve) => {
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        if (token === this.lineToken) this.hideSubtitle();
        this.csLineSkip = null;
        resolve();
      };
      if (skippable) this.csLineSkip = () => { audio.stopVoice(); finish(); };
      this.showSubtitle(line);
      const fallback = setTimeout(finish, Math.max(2500, line.text.length * 75) + 2000);
      const started = audio.ctx && audio.ctx.state === 'running';
      if (!started) {
        clearTimeout(fallback);
        setTimeout(finish, Math.max(2200, line.text.length * 60));
        return;
      }
      audio.playVoice(line.voice).then(() => { clearTimeout(fallback); finish(); });
    });
  }

  showSubtitle(line: Line) {
    if (!this.save.settings.subtitles) return;
    this.subtitle.innerHTML = '';
    if (line.who) this.subtitle.appendChild(el('span', { class: 'who' }, line.who + ':'));
    this.subtitle.appendChild(document.createTextNode(line.text));
    this.subtitle.classList.add('show');
  }
  hideSubtitle() { this.subtitle.classList.remove('show'); }

  banners: HTMLElement[] = [];
  addBanner(b: HTMLElement, ms: number) {
    this.ui.appendChild(b);
    this.banners.push(b);
    setTimeout(() => { b.remove(); this.banners = this.banners.filter((x) => x !== b); }, ms);
  }
  clearBanners() {
    for (const b of this.banners) b.remove();
    this.banners = [];
  }
  /** stop any voice line / queued barks immediately */
  interruptBarks() {
    this.lineQueue.length = 0;
    this.lineToken++;
    audio.stopVoice();
    this.hideSubtitle();
  }

  /** queue in-game barks so they don't overlap */
  private barkBusy = false;
  async bark(lines: Line[]) {
    this.lineQueue.push(...lines);
    if (this.barkBusy) return;
    this.barkBusy = true;
    while (this.lineQueue.length) {
      const l = this.lineQueue.shift()!;
      await this.sayLine(l);
      await this.wait(250);
    }
    this.barkBusy = false;
  }

  /* ================================================================ run lifecycle */
  startRun(opts: { seed?: number; weapon?: string; skipIntroCard?: boolean } = {}) {
    const seed = opts.seed ?? this.seedNext ?? ((Math.random() * 0xffffffff) >>> 0);
    this.seedNext = null;
    const sh = this.save.shop;
    const unlockedWeapons = Object.keys(WEAPONS).filter((id) => !WEAPONS[id].locked || (sh['bp_' + id] || 0) > 0);
    this.game.newRun(seed, {
      stats: metaStats(sh), weapons: unlockedWeapons, startWeapon: opts.weapon || this.save.startWeapon || 'ember',
      rerolls: sh.reroll || 0, banishes: sh.banish || 0, choices: (sh.choice || 0) > 0 ? 4 : 3,
    });
    this.runActive = true;
    this.runResult = null;
    this.pendingVictory = false;
    this.pendingClear = null;
    this.interruptBarks();
    this.clearBanners();
    this.hintsShown = 0;
    this.acc = 0;
    this.game.startStage(1);
    this.lastHud = {};
    this.show('playing');
    audio.sfx('strike', 0.9);
    this.game.player.ignite = 1.5;
  }

  pause() {
    if (this.screen !== 'playing') return;
    this.show('paused');
    audio.sfx('back', 0.5);
  }
  resume() {
    if (this.screen !== 'paused') return;
    this.show('playing');
  }

  renderPause() {
    const s = this.screens.pause;
    s.className = 'screen show overlay';
    s.innerHTML = '';
    const g = this.game;
    const list = el('div', { class: 'reward-list' });
    for (const w of g.player.weapons) {
      const d = WEAPONS[w.id];
      list.appendChild(el('div', { class: 'reward' + (w.evo ? ' evo' : '') }, el('img', { src: icon(d.icon), alt: '' }), el('div', { class: 'nm' }, w.evo ? d.evo.name : d.name), el('div', { class: 'lv' }, w.evo ? 'EVOLVED' : 'Level ' + w.level)));
    }
    for (const q of g.player.passives) {
      const d = PASSIVES[q.id];
      list.appendChild(el('div', { class: 'reward' }, el('img', { src: icon(d.icon), alt: '' }), el('div', { class: 'nm' }, d.name), el('div', { class: 'lv' }, 'Level ' + q.level)));
    }
    let quitArmed = false;
    const quit = button('Quit Run', () => {
      if (!quitArmed) { quitArmed = true; quit.textContent = 'Quit? Click again'; return; }
      this.endRun(false, true);
    });
    s.appendChild(el('div', { class: 'panel paper', style: { width: 'min(760px, 94vw)' } },
      el('h2', {}, 'Paused'),
      el('div', { style: { textAlign: 'center', fontWeight: '600' } }, `${STAGES[g.stage - 1].name} - ${fmtTime(g.time)} - Level ${g.player.level} - ${g.stats.kills} snuffed`),
      el('div', { class: 'scroll' }, list, this.statsRow()),
      el('div', { class: 'footer' },
        button('Resume', () => this.resume(), 'primary'),
        button('Settings', () => { this.settingsBack = 'paused'; this.show('settings'); }),
        button('How to Play', () => { this.howtoBack = 'paused'; this.show('howto'); }),
        quit,
      ),
    ));
    this.nav.setRoot(s, () => this.resume());
  }

  statsRow() {
    const s = this.game.player.stats;
    const pct = (v: number) => (v >= 0 ? '+' : '') + Math.round(v * 100) + '%';
    const items: [string, string][] = [
      ['Max HP', String(Math.round(s.maxHp))], ['Armor', String(s.armor)], ['Damage', pct(s.might - 1)], ['Area', pct(s.area - 1)],
      ['Cooldown', pct(s.cooldown - 1)], ['Projectiles', '+' + s.amount], ['Speed', String(Math.round(s.speed))], ['Crit', Math.round(s.crit * 100) + '%'],
      ['Pickup range', String(Math.round(s.magnet))], ['Revives', String(this.game.player.revives)],
    ];
    const row = el('div', { class: 'stat-row' });
    for (const [k, v] of items) row.appendChild(el('div', { class: 'stat-chip' }, el('span', {}, k), el('b', {}, v)));
    return row;
  }

  /* ---------------- level up */
  openLevelUp() {
    if (this.screen !== 'playing' || this.game.pendingLevels <= 0) return;
    this.choices = rollChoices(this.game, this.game.choiceCount);
    this.banishMode = false;
    this.show('levelup');
    this.navLockUntil = performance.now() + 380;
    audio.sfx('levelup', 0.7);
    this.game.player.ignite = Math.max(this.game.player.ignite, 1.2);
    this.renderLevelUp();
  }

  renderLevelUp() {
    const s = this.screens.levelup;
    s.innerHTML = '';
    const g = this.game;
    const cards = el('div', { class: 'cards' });
    this.choices.forEach((c, i) => {
      const tag = c.kind === 'evo' ? 'EVOLUTION!' : c.isNew ? 'NEW!' : c.kind === 'heal' || c.kind === 'coins' ? 'BONUS' : 'LEVEL ' + c.level;
      const card = el('div', { class: 'card paper' + (c.kind === 'evo' ? ' evo' : ''), 'data-nav': '1' },
        el('div', { class: 'kind' }, c.kind === 'passive' ? 'TRINKET' : c.kind === 'evo' ? 'EVOLVE' : c.kind === 'weapon' ? 'WEAPON' : ''),
        el('div', { class: 'key' }, el('span', { class: 'keycap' }, String(i + 1))),
        el('img', { src: icon(c.icon), alt: '' }),
        el('div', { class: 'body' },
          el('div', { class: 'nm' }, c.name),
          el('div', { class: 'lvtag' + (c.isNew ? ' new' : c.kind === 'evo' ? ' evo' : '') }, tag),
          el('div', { class: 'tx' }, c.text)),
      );
      card.addEventListener('click', () => this.pickChoice(i));
      cards.appendChild(card);
    });
    const actions = el('div', { class: 'lu-actions' });
    if (g.rerolls > 0) actions.appendChild(button(`Reroll (${g.rerolls})`, () => {
      g.rerolls--;
      this.choices = rollChoices(g, g.choiceCount);
      audio.sfx('pop', 0.6);
      this.renderLevelUp();
    }, 'small'));
    if (g.banishes > 0) actions.appendChild(button(this.banishMode ? 'Pick a card to banish' : `Banish (${g.banishes})`, () => {
      this.banishMode = !this.banishMode;
      this.renderLevelUp();
    }, 'small'));
    actions.appendChild(button('Skip (+10% HP)', () => {
      g.heal(g.player.stats.maxHp * 0.1);
      this.afterChoice();
    }, 'small'));
    s.append(el('h1', {}, this.banishMode ? 'Banish what?' : 'Level Up!'), cards, actions);
    this.nav.setRoot(s, null);
  }

  pickChoice(i: number): string | null {
    if (this.screen !== 'levelup') return null;
    const c = this.choices[i];
    if (!c) return null;
    const g = this.game;
    if (this.banishMode && (c.kind === 'weapon' || c.kind === 'passive') && c.isNew) {
      g.banishes--;
      g.banished.add(c.id);
      this.banishMode = false;
      this.choices = rollChoices(g, g.choiceCount);
      audio.sfx('back', 0.6);
      this.renderLevelUp();
      return null;
    }
    applyChoice(g, c);
    audio.sfx(c.kind === 'evo' ? 'chest' : 'click', 0.8);
    if (c.kind === 'evo') this.evoBanner(c);
    this.afterChoice();
    return c.id;
  }

  afterChoice() {
    const g = this.game;
    g.pendingLevels = Math.max(0, g.pendingLevels - 1);
    if (g.pendingLevels > 0) {
      this.choices = rollChoices(g, g.choiceCount);
      this.banishMode = false;
      this.renderLevelUp();
    } else {
      this.show('playing');
    }
  }

  evoBanner(c: Choice) {
    const b = el('div', { class: 'banner anim evo-banner', style: { '--hold': '2.2s' } as any },
      el('img', { src: icon(c.icon), alt: '' }),
      el('div', { class: 'small' }, 'EVOLUTION!'),
      el('div', { class: 'big' }, c.name),
      el('div', { class: 'tiny' }, c.text));
    this.addBanner(b, 3000);
    const g = this.game;
    g.player.ignite = Math.max(g.player.ignite, 3);
    if (g.settings.flashes) { g.flashT = 0.2; g.flashColor = 0xffd27a; }
    g.shake(6, 0.3);
  }

  /* ---------------- chests */
  showChest(items: Choice[], title = 'Treasure Matchbox!') {
    const evo = items.find((c) => c.kind === 'evo');
    if (evo) setTimeout(() => this.evoBanner(evo), 100);
    const s = this.screens.chest;
    s.className = 'screen show overlay';
    s.innerHTML = '';
    const list = el('div', { class: 'reward-list' });
    for (const c of items) list.appendChild(el('div', { class: 'reward' + (c.kind === 'evo' ? ' evo' : '') }, el('img', { src: icon(c.icon), alt: '' }), el('div', { class: 'nm' }, c.name), el('div', { class: 'lv' }, c.kind === 'evo' ? 'EVOLVED!' : c.isNew ? 'NEW' : c.level ? 'Level ' + c.level : '')));
    const panel = el('div', { class: 'panel paper', style: { width: 'min(640px, 94vw)', alignItems: 'center' } },
      el('img', { src: icon('chest'), alt: '', style: { width: '90px', marginTop: '-60px', filter: 'drop-shadow(3px 3px 0 #1b1612)' } }),
      el('h2', {}, title), list, button('Collect', () => this.closeChest(), 'primary'));
    s.appendChild(panel);
    s.onpointerdown = (e) => { if (e.target === s) this.closeChest(); };
    this.screen = 'chest';
    for (const [k, e] of Object.entries(this.screens)) e.classList.toggle('show', k === 'chest');
    this.input.setTouchActive(false);
    this.nav.setRoot(s, () => this.closeChest());
    this.chestT = 2.8;
    audio.sfx('chest', 0.9);
  }

  closeChest() {
    if (this.screen !== 'chest') return;
    this.show('playing');
  }

  /* ---------------- stage clear */
  onBossDefeated(id: string) {
    const lines = BOSS_LINES[id];
    this.interruptBarks();
    audio.stopMusic(2);
    audio.sfx('stageclear', 0.8);
    const g = this.game;
    const rewards = rollChest(g, 3);
    this.bark([lines.defeat]);
    this.pendingClear = { id, rewards, stage: g.stage, t: 4.2 };
  }

  pendingClear: { id: string; rewards: Choice[]; stage: number; t: number } | null = null;
  /** stage clear waits for the defeat line and any level-up choices to finish */
  updatePendingClear(dt: number) {
    const pc = this.pendingClear;
    if (!pc || !this.runActive) return;
    pc.t -= dt;
    if (pc.t > 0 || this.screen !== 'playing' || this.game.pendingLevels > 0) return;
    this.pendingClear = null;
    if (this.game.stage !== pc.stage) return;
    if (pc.stage >= 3) this.victory();
    else this.showStageClear(pc.id, pc.rewards);
  }

  showStageClear(id: string, rewards: Choice[]) {
    const g = this.game;
    const s = this.screens.stageclear;
    s.className = 'screen show overlay';
    s.innerHTML = '';
    const list = el('div', { class: 'reward-list' });
    for (const c of rewards) list.appendChild(el('div', { class: 'reward' + (c.kind === 'evo' ? ' evo' : '') }, el('img', { src: icon(c.icon), alt: '' }), el('div', { class: 'nm' }, c.name), el('div', { class: 'lv' }, c.kind === 'evo' ? 'EVOLVED!' : c.isNew ? 'NEW' : 'Level ' + c.level)));
    const next = STAGES[g.stage];
    const cont = button('Onward!', () => this.nextStage(), 'primary');
    s.appendChild(el('div', { class: 'panel paper', style: { width: 'min(700px, 94vw)', alignItems: 'center', textAlign: 'center', marginTop: '40px' } },
      el('img', { class: 'result-art', src: img('novaki_cheer'), alt: '' }),
      el('h2', { class: 'result-title' }, 'Stage Clear!'),
      el('div', { style: { fontWeight: '700', fontSize: '18px' } }, `${BOSSES[id].name} has been snuffed out!`),
      el('div', { style: { marginTop: '6px', fontFamily: 'var(--font-h)', fontSize: '18px' } }, "Boss treasure:"),
      list,
      el('div', { style: { fontWeight: '600' } }, `Time ${fmtTime(g.time)} - Level ${g.player.level} - ${g.stats.kills} snuffed - ${g.coinsRun} coins`),
      el('div', { style: { marginTop: '8px', fontStyle: 'italic' } }, next ? `Next: ${next.chapter} - ${next.name}` : ''),
      el('div', { class: 'footer' }, cont),
    ));
    this.screen = 'stageclear';
    for (const [k, e] of Object.entries(this.screens)) e.classList.toggle('show', k === 'stageclear');
    this.hud.classList.add('show');
    this.input.setTouchActive(false);
    this.nav.setRoot(s, null);
    this.stageClearT = 8;
    audio.playMusic('victory', MUSIC.victory, 0.5);
  }

  nextStage() {
    if (this.screen !== 'stageclear') return;
    const g = this.game;
    this.screen = 'playing'; // block double triggers while fading
    this.fade(() => {
      g.heal(g.player.stats.maxHp * 0.35);
      g.startStage(g.stage + 1);
      this.acc = 0;
      this.show('playing');
    });
  }

  fade(mid: () => void) {
    const f = this.fadeEl;
    f.classList.add('on');
    setTimeout(() => {
      mid();
      requestAnimationFrame(() => setTimeout(() => f.classList.remove('on'), 120));
    }, 380);
  }

  victory() {
    if (!this.runActive) return;
    this.pendingVictory = true;
    this.endRun(true);
  }

  /* ---------------- end of run */
  endRun(win: boolean, quit = false) {
    if (!this.runActive) return;
    const g = this.game;
    this.runActive = false;
    g.running = false;
    this.interruptBarks();
    this.clearBanners();
    const st = this.save.stats;
    const bossCount = g.stats.bossesKilled.length;
    const bonus = Math.floor(g.stats.kills / 20) + bossCount * 60 + (win ? 150 : 0);
    const earned = g.coinsRun + bonus;
    const before = new Set(this.save.unlocks);
    this.save.coins += earned;
    st.runs++;
    const fair = !g.stats.assisted;
    if (win) { st.wins++; if (fair && (!st.bestTime || g.time < st.bestTime)) st.bestTime = Math.floor(g.time); } else if (!quit) st.deaths++;
    st.kills += g.stats.kills;
    if (fair) st.longestRun = Math.max(st.longestRun, Math.floor(g.time));
    st.bestStage = Math.max(st.bestStage, g.stats.stageReached);
    st.bestLevel = Math.max(st.bestLevel, g.player.level);
    st.totalCoins += earned;
    for (const b of g.stats.bossesKilled) st.bosses[b] = (st.bosses[b] || 0) + 1;
    for (const [id, u] of Object.entries(STARTER_UNLOCKS)) if (u && u.check(this.save) && !this.save.unlocks.includes('start_' + id)) this.save.unlocks.push('start_' + id);
    if (win && !this.save.unlocks.includes('victory')) this.save.unlocks.push('victory');
    writeSave(this.save);
    const newUnlocks = this.save.unlocks.filter((u) => !before.has(u) && u.startsWith('start_')).map((u) => WEAPONS[u.slice(6)]?.name).filter(Boolean);
    this.runResult = { win, earned, bonus, newUnlocks, quit };
    if (quit) { this.show('menu'); return; }
    if (win) {
      this.playCutscene(ENDING, 'ending', 'ending', () => this.showResults(true));
    } else {
      this.showResults(false);
    }
  }

  showResults(win: boolean) {
    const g = this.game;
    const r = this.runResult;
    const id = win ? 'victory' : 'gameover';
    const s = this.screens[id];
    s.className = 'screen show overlay';
    s.innerHTML = '';
    const rows: [string, string][] = [
      ['Time', fmtTime(g.time)], ['Stage reached', STAGES[g.stats.stageReached - 1].name], ['Level', String(g.player.level)],
      ['Enemies snuffed', String(g.stats.kills)], ['Bosses defeated', String(g.stats.bossesKilled.length) + ' / 3'], ['Evolutions', String(g.stats.evolutions)],
      ['Damage taken', String(Math.round(g.stats.dmgTaken))], ['Coins earned', `${r.earned} (incl. ${r.bonus} bonus)`],
    ];
    const grid = el('div', { class: 'results' });
    for (const [k, v] of rows) grid.append(el('div', { class: 'k' }, k), el('div', { class: 'v' }, v));
    const wt = el('table', { class: 'wtable' });
    const ws = [...g.player.weapons].sort((a, b) => b.dmg - a.dmg);
    for (const w of ws) {
      const d = WEAPONS[w.id];
      wt.appendChild(el('tr', {}, el('td', {}, el('img', { src: icon(d.icon), alt: '' })), el('td', {}, (w.evo ? d.evo.name : d.name) + (w.evo ? '' : ` (Lv ${w.level})`)), el('td', { class: 'n' }, Math.round(w.dmg).toLocaleString() + ' dmg'), el('td', { class: 'n' }, w.kills + ' kills')));
    }
    const again = button('Strike Again', () => this.show('loadout'), 'primary');
    s.appendChild(el('div', { class: 'panel paper', style: { width: 'min(720px, 94vw)', marginTop: '50px' } },
      el('img', { class: 'result-art', src: img(win ? 'novaki_cheer' : 'novaki_ko'), alt: '' }),
      el('h2', { class: 'result-title' }, win ? 'Tinderbox Is Lit!' : 'Snuffed Out!'),
      g.stats.assisted ? el('div', { style: { textAlign: 'center', fontSize: '13px', opacity: '0.7' } }, '(QA-assisted run: stage skips used, best times not recorded)') : null,
      el('div', { style: { textAlign: 'center', fontStyle: 'italic', fontWeight: '600', marginBottom: '6px' } }, win ? 'Novaki relit every flame in the land. Not bad for a spent match.' : GAMEOVER_LINE.text),
      el('div', { class: 'scroll' }, grid, wt,
        r.newUnlocks.length ? el('div', { class: 'unlock-note' }, 'New starting spark unlocked: ' + r.newUnlocks.join(', ') + '!') : null),
      el('div', { class: 'footer' }, again, button('Workshop', () => this.show('shop')), button('Main Menu', () => this.show('menu'))),
    ));
    this.show(id as Screen);
    this.app.stage.visible = !win;
    this.nav.setRoot(s, () => this.show('menu'));
    audio.playMusic(win ? 'victory' : 'gameover', MUSIC[win ? 'victory' : 'gameover']);
    if (!win) setTimeout(() => { if (this.screen === 'gameover') this.sayLine(GAMEOVER_LINE); }, 700);
  }

  /* ================================================================ hooks from the game */
  hooks(): Hooks {
    return {
      levelUp: () => this.openLevelUp(),
      bossSpawn: (id) => {
        const b = BOSSES[id];
        const card = el('div', { class: 'bosscard' }, el('img', { src: img(b.tex), alt: '' }), el('div', {}, el('div', { class: 'nm' }, b.name), el('div', { class: 'ttl' }, b.title.toUpperCase())));
        this.clearBanners();
        this.addBanner(card, 4300);
        const st = STAGES[this.game.stage - 1];
        audio.playMusic('boss' + st.id, st.bossMusic, 0.6);
        const L = BOSS_LINES[id];
        this.interruptBarks();
        this.bark([L.intro, ...(L.quip ? [L.quip] : [])]);
      },
      bossPhase: (id, phase) => {
        const L = BOSS_LINES[id];
        if (id === 'snuffer' && phase === 2 && L.phase) this.bark([L.phase]);
        if (id === 'snuffer' && phase === 3) { audio.playMusic('boss3b', ['boss3_b'], 1.5); this.toast('The Snuffer burns with cold fury!', 'boss'); }
        if (id === 'duchess' && phase === 2) this.toast('Duchess Dustwing is furious!', 'boss');
        if (id === 'baron' && phase === 2) this.toast('The storm gets worse!', 'boss');
      },
      bossDefeated: (id) => this.onBossDefeated(id),
      playerDied: () => {
        this.game.slowmoT = 0;
        audio.stopMusic(0.5);
        audio.sfx('bossdie', 0.7, 1.4);
        this.interruptBarks();
        this.bark([DEATH_LINE]);
        this.runActive && setTimeout(() => this.endRun(false), 2200);
      },
      chest: (contents) => {
        if (contents.length && contents[0].id === 'boss') return;
        const g = this.game;
        const n = g.rng.next() < 0.18 * g.player.stats.luck ? 3 : 1;
        const items = rollChest(g, n);
        this.showChest(items, n > 1 ? 'Jackpot Matchbox!' : 'Treasure Matchbox!');
      },
      toast: (t, k) => this.toast(t, k),
      stageIntro: (n) => {
        const st = STAGES[n - 1];
        const b = el('div', { class: 'banner anim', style: { '--hold': '3.6s' } as any }, el('div', { class: 'small' }, st.chapter.toUpperCase()), el('div', { class: 'big' }, st.name), el('div', { class: 'tiny' }, st.subtitle));
        this.clearBanners();
        this.addBanner(b, 4400);
        audio.playMusic('stage' + n, st.music, 1.2);
        this.interruptBarks();
        this.bark([CHAPTER_LINES[n]]);
        audio.preloadMusic(st.bossMusic);
      },
      warning: (text) => {
        const b = el('div', { class: 'banner anim warning-banner', style: { '--hold': '2.6s' } as any }, el('div', { class: 'big' }, 'WARNING'), el('div', { class: 'small' }, text));
        this.addBanner(b, 3400);
      },
    };
  }

  toast(text: string, kind = 'info') {
    const t = el('div', { class: 'toast ' + kind }, text);
    this.toasts.appendChild(t);
    while (this.toasts.children.length > 4) this.toasts.firstChild!.remove();
    setTimeout(() => t.remove(), 2800);
  }

  /* ================================================================ main loop */
  tick(dt: number) {
    dt = Math.min(dt, 0.1);
    this.input.update(dt);
    this.fpsAcc += dt;
    this.fpsFrames++;
    if (this.fpsAcc >= 0.5) { this.fps = this.fpsFrames / this.fpsAcc; this.fpsAcc = 0; this.fpsFrames = 0; }
    const g = this.game;
    if (!g || !this.runActive && this.screen !== 'gameover') {
      return;
    }
    if (this.screen === 'playing' && !g.running) {
      g.render(1, dt * 0.5);
    } else if (this.screen === 'playing') {
      if (this.input.consumePause()) { this.pause(); }
      else {
        g.input.x = this.input.moveX;
        g.input.y = this.input.moveY;
        if (this.input.consumeDash()) g.input.dash = true;
        let scale = 1;
        if (g.slowmoT > 0) { g.slowmoT -= dt; scale = 0.35; }
        this.acc += dt * scale;
        let steps = 0;
        const t0 = performance.now();
        while (this.acc >= STEP && steps < 4) {
          g.update(STEP);
          this.acc -= STEP;
          steps++;
          if (this.screen !== 'playing' || !g.running) break;
        }
        if (steps >= 4) this.acc = 0;
        if (steps) this.perfUpdate = this.perfUpdate * 0.9 + ((performance.now() - t0) / steps) * 0.1;
      }
      const t1 = performance.now();
      g.render(Math.min(1, this.acc / STEP), dt);
      this.perfRender = this.perfRender * 0.9 + (performance.now() - t1) * 0.1;
    } else if (this.screen === 'chest') {
      this.chestT -= dt;
      if (this.chestT <= 0) this.closeChest();
      g.render(1, 0);
    } else if (this.screen === 'stageclear') {
      this.stageClearT -= dt;
      if (this.stageClearT <= 0) this.nextStage();
      g.render(1, dt * 0.3);
    } else if (this.screen === 'gameover') {
      g.render(1, dt * 0.2);
    } else {
      g.render(1, 0);
    }
    this.updatePendingClear(dt);
    // dash readiness for touch button
    const p = g.player;
    this.input.dashReady = p ? 1 - Math.max(0, p.dashCd) / p.stats.dashCd : 1;
    this.hudT -= dt;
    if (this.hudT <= 0) { this.hudT = 0.08; this.updateHud(); }
  }

  setHud(key: string, val: string, apply: (v: string) => void) {
    if (this.lastHud[key] === val) return;
    this.lastHud[key] = val;
    apply(val);
  }

  updateHud() {
    const g = this.game;
    const p = g.player;
    if (!p) return;
    const H = this.hudEls;
    this.setHud('xp', (p.xp / p.xpNext * 100).toFixed(1), (v) => { H.xp.style.width = v + '%'; });
    this.setHud('lvl', String(p.level), (v) => { H.lvl.textContent = 'LV ' + v; });
    this.setHud('hp', (p.hp / p.stats.maxHp * 100).toFixed(1), (v) => { H.hp.style.width = v + '%'; });
    this.setHud('hpt', `${Math.ceil(p.hp)} / ${Math.round(p.stats.maxHp)}`, (v) => { H.hpt.textContent = v; });
    this.setHud('timer', fmtTime(g.time), (v) => { H.timer.textContent = v; });
    this.setHud('stage', STAGES[g.stage - 1].name, (v) => { H.stage.textContent = v.toUpperCase(); });
    this.setHud('kills', String(g.stats.kills), (v) => { H.kills.textContent = v; });
    this.setHud('coins', String(g.coinsRun), (v) => { H.coins.textContent = v; });
    const wsig = p.weapons.map((w) => w.id + w.level + (w.evo ? 'e' : '')).join(',');
    this.setHud('weapons', wsig, () => {
      H.weapons.innerHTML = '';
      for (const w of p.weapons) H.weapons.appendChild(el('div', { class: 'slot' + (w.evo ? ' evo' : '') }, el('img', { src: icon(WEAPONS[w.id].icon), alt: '' }), el('div', { class: 'lv' }, w.evo ? '★' : String(w.level))));
    });
    const psig = p.passives.map((q) => q.id + q.level).join(',');
    this.setHud('passives', psig, () => {
      H.passives.innerHTML = '';
      for (const q of p.passives) H.passives.appendChild(el('div', { class: 'slot passive' }, el('img', { src: icon(PASSIVES[q.id].icon), alt: '' }), el('div', { class: 'lv' }, String(q.level))));
    });
    const b = g.boss;
    const bossOn = !!(b && b.alive && g.bossActive);
    this.setHud('bossOn', String(bossOn), (v) => { H.boss.classList.toggle('show', v === 'true'); });
    if (bossOn) {
      this.setHud('bossName', b!.def.name, (v) => { H.bossName.textContent = v; });
      this.setHud('bossHp', (Math.max(0, b!.hp) / b!.maxHp * 100).toFixed(1), (v) => { H.bossFill.style.width = v + '%'; });
    }
    const hpF = p.hp / p.stats.maxHp;
    const danger = this.screen === 'playing' && hpF < 0.35 ? (0.35 - hpF) / 0.35 : 0;
    this.setHud('danger', danger.toFixed(2), (v) => { this.dangerEl.style.opacity = String(Math.min(0.85, Number(v) * 1.2)); });
    this.maybeHint();
    const dashP = 1 - Math.max(0, p.dashCd) / p.stats.dashCd;
    this.setHud('dash', dashP.toFixed(2), (v) => { H.dash.style.setProperty('--p', v); });
    this.setHud('dashLabel', this.input.device, (v) => {
      H.dashLabel.textContent = v === 'gamepad' ? 'A: DASH' : v === 'touch' ? '' : 'SPACE: DASH';
      H.dashInd.style.display = v === 'touch' ? 'none' : 'flex';
    });
    if (this.save.settings.showFps) this.setHud('fps', `${Math.round(this.fps)} FPS - ${g.enemyCount()} foes`, (v) => { H.fps.textContent = v; });
  }

  /** first-runs onboarding hints */
  maybeHint() {
    const g = this.game;
    if (this.screen !== 'playing' || this.save.stats.runs >= 2 || g.stats.assisted) return;
    const touch = this.input.device === 'touch', pad = this.input.device === 'gamepad';
    const hints: [number, string][] = [
      [3, touch ? 'Drag anywhere to move. Novaki attacks on his own!' : pad ? 'Move with the left stick. Novaki attacks on his own!' : 'Move with WASD or the arrow keys. Novaki attacks on his own!'],
      [12, 'Collect the glowing embers to level up.'],
      [22, touch ? 'Tap DASH to zip through danger.' : pad ? 'Press A to dash through danger.' : 'Press SPACE to dash through danger.'],
      [40, 'Smash lanterns, barrels and candles for treats.'],
    ];
    if (g.stage !== 1 || this.hintsShown >= hints.length) return;
    const [t, text] = hints[this.hintsShown];
    if (g.stageTime >= t) { this.hintsShown++; this.toast(text, 'info'); }
  }

  /* ================================================================ QA interface */
  installQA() {
    const self = this;
    const qa = {
      state() {
        const g = self.game;
        const p = g.player;
        const inRun = self.runActive || self.screen === 'gameover' || self.screen === 'victory' || self.screen === 'ending';
        return {
          screen: self.screen === 'ending' ? 'victory' : self.screen,
          stage: inRun && p ? g.stage : 1,
          time: inRun && p ? Math.round(g.time * 100) / 100 : 0,
          player: p ? { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, hp: Math.round(p.hp * 10) / 10, maxHp: Math.round(p.stats.maxHp), level: p.level, xp: Math.round(p.xp * 10) / 10, xpNext: p.xpNext } : null,
          enemies: p && inRun ? g.enemyCount() : 0,
          bossActive: !!(g.bossActive && g.boss && g.boss.alive),
          boss: g.boss && g.boss.alive ? { id: g.boss.boss.id, hp: Math.round(g.boss.hp), maxHp: g.boss.maxHp, phase: g.boss.boss.phase } : null,
          upgrades: p ? [...p.weapons.map((w) => w.id), ...p.passives.map((q) => q.id), ...p.weapons.filter((w) => w.evo).map((w) => 'evo_' + w.id)] : [],
          weapons: p ? p.weapons.map((w) => ({ id: w.id, level: w.level, evolved: w.evo })) : [],
          passives: p ? p.passives.map((q) => ({ id: q.id, level: q.level })) : [],
          levelUpChoices: self.screen === 'levelup' ? self.choices.map((c) => ({ id: c.id, kind: c.kind, level: c.level, name: c.name })) : [],
          kills: g.stats?.kills ?? 0,
          seed: g.seed,
          fps: Math.round(self.fps),
          perf: { updateMs: Math.round(self.perfUpdate * 100) / 100, renderMs: Math.round(self.perfRender * 100) / 100, bullets: g.bullets?.filter((b) => b.alive).length ?? 0, projectiles: g.projs?.filter((p) => p.alive).length ?? 0, particles: g.particles?.filter((p) => p.alive).length ?? 0 },
          meta: { currency: self.save.coins, unlocks: [...self.save.unlocks], shop: { ...self.save.shop }, stats: { ...self.save.stats } },
        };
      },
      start(options: { seed?: number; weapon?: string } = {}) {
        audio.unlock();
        self.cutsceneToken++;
        self.cutsceneDone = null;
        audio.stopVoice();
        self.hideSubtitle();
        if (self.runActive) { self.runActive = false; self.game.running = false; }
        self.startRun({ seed: typeof options.seed === 'number' ? options.seed : undefined, weapon: options.weapon });
        return true;
      },
      setInvincible(on: boolean) { if (self.game.player) self.game.player.invincible = !!on; return !!on; },
      addXp(amount: number) {
        const g = self.game;
        if (!g.player || !self.runActive) return false;
        const p = g.player;
        p.xp += Number(amount) || 0;
        while (p.xp >= p.xpNext) { p.xp -= p.xpNext; p.level++; p.xpNext = xpFor(p.level); g.pendingLevels++; g.stats.maxLevel = Math.max(g.stats.maxLevel, p.level); }
        if (g.pendingLevels > 0 && self.screen === 'playing') self.openLevelUp();
        return true;
      },
      chooseUpgrade(index: number) { return self.pickChoice(index); },
      skipTo(stage: number, point: 'start' | 'boss' = 'start') {
        stage = Math.max(1, Math.min(3, Math.floor(stage) || 1));
        if (!self.runActive) qa.start({});
        const g = self.game;
        self.cutsceneToken++;
        self.lineQueue.length = 0;
        // catch-up build so later stages are fair when jumping ahead
        const target = stage === 1 ? 1 : stage === 2 ? 12 : 22;
        let guard = 0;
        while (g.player.level < target && guard++ < 60) {
          g.player.level++;
          g.player.xpNext = xpFor(g.player.level);
          const c = rollChoices(g, 1)[0];
          if (c) applyChoice(g, c);
        }
        g.pendingLevels = 0;
        g.player.hp = g.player.stats.maxHp;
        g.running = true;
        g.over = false;
        self.interruptBarks();
        self.clearBanners();
        g.stats.assisted = true;
        g.startStage(stage, point === 'boss');
        if (point === 'boss') {
          audio.playMusic('stage' + stage, STAGES[stage - 1].music, 0.5);
          g.stageTime = STAGES[stage - 1].duration;
          g.director.startBoss();
        }
        self.acc = 0;
        self.show('playing');
        return true;
      },
      killBoss() {
        const g = self.game;
        if (!g.boss || !g.boss.alive || !g.boss.boss) return false;
        g.boss.boss.entry = 99;
        g.boss.boss.invuln = false;
        g.boss.hp = 0;
        g.boss.boss.dying = true;
        if (self.screen !== 'playing' && ['levelup', 'chest', 'paused'].includes(self.screen)) self.show('playing');
        return true;
      },
      spawnEnemies(count: number) {
        const g = self.game;
        if (!self.runActive || !g.player) return 0;
        const w = g.director.currentWave();
        const types = Object.keys(w.mix);
        let n = 0;
        for (let i = 0; i < count; i++) {
          const a = Math.random() * Math.PI * 2;
          const r = 160 + Math.random() * 420;
          const e = g.spawnEnemy(types[i % types.length], g.player.x + Math.cos(a) * r, g.player.y + Math.sin(a) * r);
          if (e) n++;
        }
        return n;
      },
    };
    (window as any).NOVAKI_QA = qa;
  }
}

const theApp = new App();
(window as any).__novaki = theApp;
theApp.boot().catch((e) => {
  console.error(e);
  const m = document.querySelector('#loading .msg');
  if (m) m.textContent = 'Failed to start: ' + (e?.message || e);
});
