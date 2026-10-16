import '@fontsource/luckiest-guy/latin-400.css';
import '@fontsource/fredoka/latin-400.css';
import '@fontsource/fredoka/latin-600.css';
import './ui/style.css';
import { Application } from 'pixi.js';
import { audio } from './core/audio';
import { RNG } from './core/rng';
import { Input } from './core/input';
import { loadSave, writeSave, wipeSave, SaveData } from './core/save';
import { Game, STEP, Hooks } from './game/game';
import { loadSpriteAtlas, loadTiles, loadIcons, makeFxTextures, makeDigitTextures, ICONS } from './game/textures';
import { WEAPONS } from './game/weapons';
import { PASSIVES, rollChoices, applyChoice, rollChest, Choice, SHOP, metaStats, STARTERS } from './game/upgrades';
import { STAGES } from './game/stages';
import { RELICS, RELIC_ICONS, rollRelics, grantRelic, RelicDef } from './game/relics';
import { ACHIEVEMENTS, awardAchievements } from './game/achievements';
import { ENEMIES } from './game/enemies';
import { BOSSES } from './game/bosses';
import { el, button, icon, img, FocusNav, ASSET } from './ui/dom';
import { Bubble } from './ui/bubble';
import { installQA } from './qa';
import { INTRO, ENDING, CHAPTER_LINES, BOSS_LINES, GAMEOVER_LINE, DEATH_LINE, CLEAR_LINE, Line, Panel } from './ui/story';

type Screen = 'loading' | 'title' | 'menu' | 'loadout' | 'shop' | 'settings' | 'howto' | 'records' | 'intro' | 'playing' | 'paused'
  | 'levelup' | 'chest' | 'stageclear' | 'transition' | 'gameover' | 'victory' | 'ending';

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

const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const dailySeed = (key: string) => {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
};

const fmtTime = (t: number) => {
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
};

export class App {
  app!: Application;
  game!: Game;
  input = new Input();
  save: SaveData = loadSave();
  screen: Screen = 'loading';
  nav = new FocusNav();
  ui = document.getElementById('ui')!;
  screens: Record<string, HTMLElement> = {};
  hud!: HTMLElement;
  bubble!: Bubble;
  fadeEl!: HTMLElement;
  dangerEl!: HTMLElement;
  hintsShown = 0;
  flareHints = 0;
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
  cutsceneToken = 0;
  settingsBack: Screen = 'menu';
  howtoBack: Screen = 'menu';
  qaRng: RNG | null = null;
  runResult: any = null;
  runId = 0;
  transitionToken = 0;
  deathTimer = 0;
  qaInvincible = false;
  perfUpdate = 0;
  perfRender = 0;

  /** saves from before the bestiary tracked encounters: fill it from how far the player has been */
  migrateSeen() {
    const s = this.save;
    if (s.seen.length || s.stats.bestStage <= 0) return;
    for (const st of STAGES.slice(0, s.stats.bestStage)) {
      for (const w of st.waves) for (const k of Object.keys(w.mix)) if (!s.seen.includes(k)) s.seen.push(k);
    }
    for (const b of Object.keys(s.stats.bosses)) if (!s.seen.includes(b)) s.seen.push(b);
    writeSave(s);
  }

  async boot() {
    this.migrateSeen();
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
    const iconNames = [...ICONS, ...Object.values(WEAPONS).map((w) => w.icon), ...Object.values(PASSIVES).map((p) => p.icon), 'reroll', 'banish', 'skull', 'trophy', 'hourglass', 'heart', 'star', ...RELIC_ICONS];
    const icons = await loadIcons(ASSET, Array.from(new Set(iconNames)));
    this.setProgress(0.95, 'Almost lit...');
    // preload a few UI images in the browser cache
    for (const n of ['menu_bg', 'logo', 'story_intro1']) { const i = new Image(); i.src = img(n); }
    this.game = new Game(app, T, fx, icons, tiles, digits, this.hooks());
    app.stage.addChild(this.game.root);
    app.stage.visible = false;
    const onResize = () => this.game.resize(app.screen.width, app.screen.height);
    app.renderer.on('resize', onResize);
    onResize();
    this.applySettings();
    this.buildUI();
    this.input.onNav = (d) => this.onNav(d);
    // swallow "ghost" clicks that land on a freshly shown screen (touch taps, double clicks)
    this.ui.addEventListener('click', (e) => {
      if (performance.now() < this.navLockUntil) { e.stopPropagation(); e.preventDefault(); }
    }, true);
    this.input.onDigit = (n) => {
      if (performance.now() < this.navLockUntil) return;
      if (this.screen === 'levelup') this.pickChoice(n - 1);
      else if (this.screen === 'stageclear') this.pickRelic(n - 1);
    };
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
        <div class="flarebar"><div class="fill"></div><div class="txt">FLARE</div></div>
        <div class="slots weapons"></div><div class="slots passives"></div></div>
      <div class="hud-center"><div class="timer">00:00</div><div class="stagename"></div><div class="bossin"><div class="bossin-fill"></div><span></span></div></div>
      <div class="hud-right"><div class="stat"><img src="${icon('skull')}" alt=""><span class="kills">0</span></div>
        <div class="stat"><img src="${icon('coin')}" alt=""><span class="coins">0</span></div></div>
      <div class="bossbar"><div class="name"></div><div class="bar"><div class="fill"></div></div></div>
      <div class="dash-ind"><div class="ring"></div><span class="dash-label">SPACE: DASH</span></div>
      <div class="fps"></div>`;
    this.ui.appendChild(this.hud);
    const q = (s: string) => this.hud.querySelector(s) as HTMLElement;
    this.hudEls = {
      xp: q('.xpbar .fill'), lvl: q('.lvl'), hp: q('.hpbar .fill'), hpt: q('.hpbar .txt'), weapons: q('.weapons'), passives: q('.passives'),
      flare: q('.flarebar'), flareFill: q('.flarebar .fill'), flareTxt: q('.flarebar .txt'),
      timer: q('.timer'), stage: q('.stagename'), kills: q('.kills'), coins: q('.coins'), boss: q('.bossbar'), bossName: q('.bossbar .name'),
      bossFill: q('.bossbar .fill'), bossIn: q('.bossin'), bossInFill: q('.bossin-fill'), bossInTxt: q('.bossin span'), dash: q('.dash-ind .ring'), dashLabel: q('.dash-label'), fps: q('.fps'), dashInd: q('.dash-ind'),
    };
    this.fadeEl = el('div', { id: 'fade', class: 'passthrough' });
    this.ui.appendChild(this.fadeEl);
    this.dangerEl = el('div', { id: 'danger', class: 'passthrough' });
    this.ui.appendChild(this.dangerEl);
    this.toasts = el('div', { id: 'toasts', class: 'passthrough' });
    this.ui.appendChild(this.toasts);
    this.subtitle = el('div', { id: 'subtitle', class: 'passthrough' });
    this.ui.appendChild(this.subtitle);
    this.bubble = new Bubble(this.ui);

    for (const id of ['title', 'menu', 'loadout', 'shop', 'settings', 'howto', 'records', 'cutscene', 'levelup', 'chest', 'pause', 'stageclear', 'gameover', 'victory']) {
      const s = el('div', { class: 'screen', id });
      this.ui.appendChild(s);
      this.screens[id] = s;
    }
    // title
    const t = this.screens.title;
    t.append(
      el('div', { class: 'menu-bg', style: { backgroundImage: `url(${img('menu_bg')})` } }),
      el('div', { class: 'menu-shade' }),
      this.embers(),
      el('img', { class: 'logo', src: img('logo'), alt: 'Strike Twice' }),
      el('div', { class: 'subtitle-novaki' }, 'A NOVAKI ROGUELITE'),
      el('div', { class: 'spacer' }),
      el('div', { class: 'press' }, this.input.touchEnabled ? 'TAP TO START' : 'PRESS ANY KEY'),
    );
    t.addEventListener('pointerdown', () => this.leaveTitle());
    // the whole document unlocks audio on first gesture
    const unlock = () => audio.unlock();
    for (const ev of ['pointerdown', 'touchend', 'click', 'keydown']) window.addEventListener(ev, unlock, { capture: true, passive: true });
  }

  embers(): HTMLElement {
    const box = el('div', { class: 'embers passthrough' });
    for (let i = 0; i < 18; i++) {
      const s = el('span', {});
      s.style.left = (Math.random() * 100).toFixed(1) + '%';
      s.style.animationDuration = (6 + Math.random() * 7).toFixed(1) + 's';
      s.style.animationDelay = (-Math.random() * 12).toFixed(1) + 's';
      const sz = 3 + Math.random() * 5;
      s.style.width = s.style.height = sz.toFixed(1) + 'px';
      box.appendChild(s);
    }
    return box;
  }

  leaveTitle() {
    if (this.screen !== 'title') return;
    audio.unlock();
    audio.sfx('strike', 0.8);
    this.show('menu');
    // the key / tap that left the title must never also press the first menu button
    this.navLockUntil = performance.now() + 400;
    this.input.clearQueued();
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
    const inRun = ['playing', 'paused', 'levelup', 'chest', 'stageclear', 'transition'].includes(s);
    document.body.classList.toggle('overlay-open', ['paused', 'levelup', 'chest', 'stageclear', 'gameover', 'victory'].includes(s));
    if (s !== 'stageclear') document.body.classList.remove('subtitle-top');
    this.hud.classList.toggle('show', inRun);
    this.input.setTouchActive(s === 'playing');
    audio.setPaused(s === 'paused' || (prev === 'paused' && (s === 'settings' || s === 'howto')) || ((s === 'settings' || s === 'howto') && this.runActive));
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
    const btns = el('div', { class: 'menu-buttons' },
      button('Play', () => this.onPlay(), 'primary'),
      this.workshopButton(),
      button('How to Play', () => { this.howtoBack = 'menu'; this.show('howto'); }),
      button('Settings', () => { this.settingsBack = 'menu'; this.show('settings'); }),
      button('Records & Credits', () => this.show('records')),
      this.save.seenIntro ? button('Replay Intro', () => this.playIntro(() => this.show('menu'))) : null,
    );
    m.append(
      el('div', { class: 'menu-bg', style: { backgroundImage: `url(${img('menu_bg')})` } }),
      el('div', { class: 'menu-shade' }),
      this.embers(),
      el('img', { class: 'logo', src: img('logo'), alt: 'Strike Twice' }),
      el('div', { class: 'subtitle-novaki' }, 'A NOVAKI ROGUELITE'),
      btns,
      el('div', { class: 'menu-corner' }, el('div', { class: 'coins-pill' }, el('img', { src: icon('coin'), alt: '' }), String(this.save.coins))),
      el('div', { class: 'version' }, 'v1.0 - made with varlik-generated art, music & voices'),
    );
    this.nav.setRoot(m, null);
  }

  workshopButton() {
    const b = button('Workshop', () => this.show('shop'));
    const affordable = SHOP.some((it) => (this.save.shop[it.id] || 0) < it.max && this.save.coins >= it.cost(this.save.shop[it.id] || 0));
    if (affordable) b.appendChild(el('span', { class: 'badge' }, '!'));
    return b;
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
    this.backdrop(s, 'menu_bg');
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
      this.startRun({ weapon: sel, inferno: this.inferno && this.save.stats.wins > 0 });
    };
    const dkey = todayKey();
    const dbest = this.save.daily && this.save.daily.date === dkey ? this.save.daily : null;
    const dailyRow = el('div', { class: 'row daily-row' },
      el('span', {}, el('b', {}, 'Daily Strike'), ` - today's run (${dkey}) uses the same seed for everyone and starts with Ember Toss.`,
        dbest ? el('span', { class: 'daily-best' }, ` Best today: ${dbest.won ? 'WON in ' + fmtTime(dbest.bestTime) : STAGES[Math.max(1, dbest.bestStage) - 1].name + ', ' + fmtTime(dbest.bestTime)}`) : null),
      button('Play Daily', () => this.startRun({ seed: dailySeed(dkey), weapon: 'ember', daily: true }), 'small'));
    let infernoRow: HTMLElement | null = null;
    if (this.save.stats.wins > 0) {
      const tg = el('div', { class: 'toggle' + (this.inferno ? ' on' : ''), 'data-nav': '1', role: 'switch', 'aria-label': 'Inferno mode' });
      tg.addEventListener('click', () => { this.inferno = !this.inferno; tg.classList.toggle('on', this.inferno); audio.sfx(this.inferno ? 'strike' : 'click', 0.6); });
      infernoRow = el('div', { class: 'row inferno-row' }, el('span', {}, el('b', {}, 'Inferno Mode'), ' - tougher foes and bosses, +50% coins'), tg);
    }
    const panel = el('div', { class: 'panel paper' },
      el('h2', {}, 'Choose Your Spark'),
      el('div', { style: { textAlign: 'center', fontWeight: '600', marginBottom: '10px' } }, 'Pick the weapon Novaki starts with. Unlock more by playing.'),
      el('div', { class: 'scroll' }, grid, infernoRow, dailyRow),
      el('div', { class: 'footer' }, button('Back', () => this.show('menu')), button('Strike!', start, 'primary')),
    );
    s.appendChild(panel);
    this.nav.setRoot(s, () => this.show('menu'));
    const selCard = cards[STARTERS.indexOf(sel)];
    if (selCard) this.nav.setCurrent(selCard, false);
  }

  backdrop(s: HTMLElement, name: string, blur = true) {
    s.appendChild(el('div', { class: 'menu-backdrop' + (blur ? ' blur' : ''), style: { backgroundImage: `url(${img(name)})` } }));
  }

  /* ---------------- shop */
  renderShop() {
    const s = this.screens.shop;
    s.className = 'screen show overlay';
    s.innerHTML = '';
    this.backdrop(s, 'workshop_bg', false);
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
    if (this.settingsBack === 'menu') this.backdrop(s, 'menu_bg');
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
    const toggle = (label: string, key: 'shake' | 'flashes' | 'dmgNumbers' | 'showFps' | 'subtitles' | 'vibration' | 'lowFx') => {
      const isOn = () => (key === 'lowFx' ? st.lowFx || this.autoLowFx : st[key]);
      const t = el('div', { class: 'toggle' + (isOn() ? ' on' : ''), 'data-nav': '1', role: 'switch', 'aria-label': label });
      t.addEventListener('click', () => {
        if (key === 'lowFx') {
          // the player's choice overrides the automatic fallback for the rest of the session
          st.lowFx = !isOn();
          this.autoLowFx = false;
          this.lowFxUserSet = true;
        } else st[key] = !st[key];
        t.classList.toggle('on', isOn());
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
        const keep = this.save.settings;
        this.save = wipeSave();
        this.save.settings = keep; // progress only: audio / display settings stay
        writeSave(this.save);
        this.applySettings();
        this.toast('Progress wiped. A fresh match!', 'warn');
        this.renderSettings();
      } else {
        reset.dataset.armed = '1';
        reset.textContent = 'Really? Click again';
      }
    }, 'small');
    s.appendChild(el('div', { class: 'panel paper', style: { width: 'min(760px, 94vw)' } },
      el('h2', {}, 'Settings'),
      el('div', { class: 'scroll' },
        slider('Music volume', 'music'),
        slider('Sound volume', 'sfx'),
        slider('Voice volume', 'voice'),
        el('div', { class: 'toggle-grid' },
          toggle('Screen shake', 'shake'),
          toggle('Screen flashes', 'flashes'),
          toggle('Damage numbers', 'dmgNumbers'),
          toggle('Subtitles', 'subtitles'),
          toggle('Vibration (pad / phone)', 'vibration'),
          toggle('Reduced effects', 'lowFx'),
          toggle('Show FPS', 'showFps')),
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
    this.input.rumbleOn = st.vibration !== false;
    if (this.game) {
      this.game.settings.lowFx = !!st.lowFx || this.autoLowFx;
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
    if (this.howtoBack === 'menu') this.backdrop(s, 'menu_bg');
    const back = () => this.show(this.howtoBack);
    const tabs = el('div', { class: 'tabs' });
    const mk = (id: string, label: string) => {
      const b = button(label, () => this.renderHowto(id), 'small' + (tab === id ? ' active' : ''));
      tabs.appendChild(b);
    };
    mk('basics', 'Basics'); mk('evos', 'Arsenal'); mk('relics', 'Relics'); mk('bestiary', 'Bestiary');
    let body: HTMLElement;
    if (tab === 'basics') {
      body = el('div', { class: 'howto-cols', html: `
        <div><h3>Survive &amp; Strike</h3>
        <p>Novaki fights on his own: weapons fire <b>automatically</b>. Your job is to <b>move</b>, dodge, and collect the glowing <b>embers</b> enemies drop.</p>
        <p>Fill the ember bar to <b>level up</b> and pick an upgrade: new weapons, weapon levels, or passive trinkets.</p>
        <p>Each stage ends with a <b>boss</b>. Beat all three to relight Tinderbox. A full run takes about 20 minutes.</p>
        <p><b>Dash</b> to slip through danger: you can't be hurt for a moment while dashing. Glowing outlines and arrows on the ground warn you where an attack will land.</p>
        <p><b>Flare-Up:</b> kills and boss hits charge your flare meter. When it's full, strike twice: Novaki blazes up, scorching everything on screen and snuffing out enemy shots.</p>
        <p><b>Evolutions:</b> get a weapon to level 8 while owning its partner trinket, and it can evolve into something much stronger. After each boss you also pick a <b>relic</b>.</p>
        <p>Coins you collect stay with you: spend them in the <b>Workshop</b> for permanent upgrades.</p></div>
        <div><h3>Controls</h3>
        <p><b>Keyboard:</b> move with <span class="keycap">W</span><span class="keycap">A</span><span class="keycap">S</span><span class="keycap">D</span> or arrow keys. Dash with <span class="keycap">Space</span> or <span class="keycap">Shift</span>. Flare-Up with <span class="keycap">E</span> or <span class="keycap">Q</span>. Pause with <span class="keycap">Esc</span> or <span class="keycap">P</span>. Pick upgrades with <span class="keycap">1</span>-<span class="keycap">4</span>.</p>
        <p><b>Gamepad:</b> left stick or d-pad to move, <span class="keycap">A</span> / <span class="keycap">RB</span> to dash, <span class="keycap">Y</span> / <span class="keycap">LB</span> to flare up, <span class="keycap">Start</span> to pause. Menus: stick + <span class="keycap">A</span>, <span class="keycap">B</span> to go back.</p>
        <p><b>Touch:</b> drag anywhere to move with the floating joystick. Tap <b>DASH</b> to dodge, <b>FLARE</b> to flare up, <b>II</b> to pause.</p>
        <h3>Pickups</h3>
        <p><img src="${icon('marshmallow')}" style="height:22px;vertical-align:middle"> heals &nbsp; <img src="${icon('magnet')}" style="height:22px;vertical-align:middle"> pulls all embers &nbsp; <img src="${icon('firecracker')}" style="height:22px;vertical-align:middle"> clears the screen &nbsp; <img src="${icon('watch')}" style="height:22px;vertical-align:middle"> freezes time &nbsp; <img src="${icon('goldmatch')}" style="height:22px;vertical-align:middle"> golden match: invincible and ablaze &nbsp; <img src="${icon('chest')}" style="height:22px;vertical-align:middle"> treasure. Smash lanterns, barrels and candles to find them.</p></div>` });
    } else if (tab === 'evos') {
      body = el('div', {});
      const wl = el('div', { class: 'arsenal' });
      for (const w of Object.values(WEAPONS)) {
        const pas = PASSIVES[w.evo.passive];
        const locked = w.locked && !(this.save.shop['bp_' + w.id] > 0);
        wl.appendChild(el('div', { class: 'ars-row' },
          el('img', { src: icon(w.icon), alt: '' }),
          el('div', { class: 'ars-body' },
            el('div', { class: 'ars-nm' }, w.name, locked ? el('span', { class: 'ars-lock' }, ' (blueprint in the Workshop)') : null),
            el('div', {}, w.desc),
            el('div', { class: 'ars-evo' }, el('img', { src: icon(pas.icon), alt: '' }), `Lv 8 + ${pas.name} = `, el('b', {}, w.evo.name), ': ' + w.evo.desc))));
      }
      const pl = el('div', { class: 'evo-table' });
      for (const p of Object.values(PASSIVES)) {
        pl.appendChild(el('div', { class: 'evo-row' }, el('img', { src: icon(p.icon), alt: '' }),
          el('div', {}, el('div', { style: { fontFamily: 'var(--font-h)', fontSize: '15px' } }, p.name), el('div', {}, `${p.desc} per level (max ${p.max})`))));
      }
      body.append(el('h3', { class: 'ars-h' }, 'Weapons & evolutions'), wl, el('h3', { class: 'ars-h' }, 'Trinkets'), pl);
    } else if (tab === 'relics') {
      body = el('div', {});
      body.appendChild(el('p', { style: { fontWeight: '600', textAlign: 'center', marginTop: '0' } }, 'After each boss you choose one of three relics. Each can only be found once per run.'));
      const grid = el('div', { class: 'evo-table' });
      for (const r of Object.values(RELICS)) grid.appendChild(el('div', { class: 'evo-row' }, el('img', { src: icon(r.icon), alt: '' }), el('div', {}, el('div', { style: { fontFamily: 'var(--font-h)', fontSize: '15px' } }, r.name), el('div', {}, r.desc))));
      body.appendChild(grid);
    } else {
      body = el('div', { class: 'bestiary' });
      for (const st of STAGES) {
        const b = BOSSES[st.boss];
        const bseen = this.save.seen.includes(st.boss) || (this.save.stats.bosses[st.boss] || 0) > 0;
        body.appendChild(el('div', { class: 'beast boss' + (bseen ? '' : ' unseen') }, el('img', { src: img(b.tex), alt: '' }), el('div', { class: 'nm' }, bseen ? b.name : '???'), el('div', {}, bseen ? `${b.title}. ${b.desc}` : 'A great foe awaits at the end of ' + st.name + '.')));
        const types = new Set<string>();
        for (const w of st.waves) for (const k of Object.keys(w.mix)) if (!['moth', 'raindrop'].includes(k) || st.id < 3) types.add(k);
        for (const k of types) {
          const e = ENEMIES[k];
          if (!e || (st.id === 3 && ['moth', 'raindrop'].includes(k))) continue;
          if (Array.from(STAGES.slice(0, st.id - 1)).some((o) => o.waves.some((w) => w.mix[k]))) continue;
          const seen = this.save.seen.includes(k);
          body.appendChild(el('div', { class: 'beast' + (seen ? '' : ' unseen') }, el('img', { src: img(e.tex), alt: '' }), el('div', { class: 'nm' }, seen ? e.name : '???'), el('div', {}, seen ? e.desc : 'Not encountered yet.')));
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
    this.backdrop(s, 'menu_bg');
    const st = this.save.stats;
    const back = () => this.show('menu');
    const rows: [string, string][] = [
      ['Runs played', String(st.runs)], ['Victories', String(st.wins)], ['Fastest victory', st.bestTime ? fmtTime(st.bestTime) : '-'],
      ['Longest run', fmtTime(st.longestRun)], ['Furthest stage', st.bestStage ? STAGES[Math.min(3, st.bestStage) - 1].name : '-'],
      ['Highest level', String(st.bestLevel)], ['Enemies snuffed', String(st.kills)], ['Coins earned', String(st.totalCoins)],
      ['Duchess Dustwing defeated', String(st.bosses.duchess || 0)], ['Baron von Drizzle defeated', String(st.bosses.baron || 0)], ['The Snuffer defeated', String(st.bosses.snuffer || 0)],
    ];
    const dly = this.save.daily && this.save.daily.date === todayKey() ? this.save.daily : null;
    rows.push(['Daily Strike today', dly ? (dly.won ? 'Won in ' + fmtTime(dly.bestTime) : STAGES[Math.max(1, dly.bestStage) - 1].name + ', ' + fmtTime(dly.bestTime)) : 'Not played yet']);
    const grid = el('div', { class: 'results' });
    for (const [k, v] of rows) grid.append(el('div', { class: 'k' }, k), el('div', { class: 'v' }, v));
    const unl = el('div', { style: { marginTop: '10px', fontWeight: '600' } }, 'Starting sparks unlocked: ' + STARTERS.filter((id) => this.starterUnlocked(id)).map((id) => WEAPONS[id].name).join(', '));
    const achWrap = el('div', { class: 'ach-wrap' }, el('h3', {}, `Achievements (${ACHIEVEMENTS.filter((a) => this.save.unlocks.includes('ach_' + a.id)).length} / ${ACHIEVEMENTS.length})`));
    const achGrid = el('div', { class: 'ach-grid' });
    for (const a of ACHIEVEMENTS) {
      const got = this.save.unlocks.includes('ach_' + a.id);
      achGrid.appendChild(el('div', { class: 'ach' + (got ? ' got' : '') }, el('span', { class: 'ach-star' }, got ? '★' : '☆'),
        el('div', {}, el('div', { class: 'ach-nm' }, a.name), el('div', { class: 'ach-ds' }, a.desc + (got ? '' : `  (+${a.reward} coins)`)))));
    }
    achWrap.appendChild(achGrid);
    const credits = el('div', { class: 'credits', html: `<h3>Credits</h3>
      <p><b>Novaki: Strike Twice</b> was built for the Novaki AI game test.</p>
      <p>All illustrations, sprites and icons were generated with <b>varlik image</b> (GPT image model); the soundtrack with <b>varlik music</b> (Lyria); every voice line with <b>varlik voice</b> (Gemini TTS). Sound effects are synthesized in code. Novaki is based on the official reference sheet.</p>
      <p>Code, design and writing by an AI coding agent. Engine: PixiJS. Fonts: Luckiest Guy &amp; Fredoka (SIL Open Font License).</p>` });
    s.appendChild(el('div', { class: 'panel paper', style: { width: 'min(760px, 94vw)' } }, el('h2', {}, 'Records'), el('div', { class: 'scroll' }, grid, unl, achWrap, credits), el('div', { class: 'footer' }, button('Back', back))));
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
    s.onpointerdown = (e) => { if (e.target === skip) return; this.nextLine(); };
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
      if (screen === 'ending') await this.creditsRoll(s, token);
      if (token !== this.cutsceneToken) return;
      this.endCutscene();
    };
    run();
  }

  /** a short "The End" credits roll after the ending's last panel (skippable like the rest of the cutscene) */
  creditsRoll(s: HTMLElement, token: number): Promise<void> {
    const roll = el('div', { class: 'credits-roll', html: `
      <div class="cr-inner">
        <div class="cr-end">The End</div>
        <div class="cr-title">Novaki: Strike Twice</div>
        <p><b>Starring</b><br>Novaki, the match who struck twice</p>
        <p><b>Villains</b><br>Duchess Dustwing &middot; Baron von Drizzle &middot; The Snuffer</p>
        <p><b>Art, music &amp; voices</b><br>generated with varlik (GPT image, Lyria, Gemini TTS)</p>
        <p><b>Code, design &amp; writing</b><br>an AI coding agent, for the Novaki game test</p>
        <p><b>Engine</b><br>PixiJS &middot; fonts Luckiest Guy &amp; Fredoka</p>
        <p class="cr-thanks">Thanks for playing!</p>
      </div>` });
    s.appendChild(roll);
    return new Promise<void>((resolve) => {
      let done = false;
      const finish = () => { if (done) return; done = true; this.csLineSkip = null; roll.remove(); resolve(); };
      this.csLineSkip = finish; // tap / Enter skips the roll
      setTimeout(() => { if (token === this.cutsceneToken) finish(); else resolve(); }, 11000);
    });
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
  sayLine(line: Line, skippable = false, subtitle = true): Promise<void> {
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
      if (subtitle) this.showSubtitle(line);
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
  inferno = false;
  dailyKey = '';
  startRun(opts: { seed?: number; weapon?: string; inferno?: boolean; daily?: boolean } = {}) {
    const seed = opts.seed ?? ((Math.random() * 0xffffffff) >>> 0);
    const sh = this.save.shop;
    const unlockedWeapons = Object.keys(WEAPONS).filter((id) => !WEAPONS[id].locked || (sh['bp_' + id] || 0) > 0);
    this.game.newRun(seed, {
      stats: metaStats(sh), weapons: unlockedWeapons, startWeapon: opts.weapon || this.save.startWeapon || 'ember',
      rerolls: sh.reroll || 0, banishes: sh.banish || 0, choices: (sh.choice || 0) > 0 ? 4 : 3,
      inferno: !!opts.inferno,
      daily: !!opts.daily,
    } as any);
    this.runActive = true;
    this.runId++;
    this.transitionToken++;
    this.dailyKey = opts.daily ? todayKey() : '';
    if (this.deathTimer) { clearTimeout(this.deathTimer); this.deathTimer = 0; }
    this.runResult = null;
    this.pendingClear = null;
    this.relicChoices = [];
    this.interruptBarks();
    this.clearBanners();
    this.hintsShown = 0;
    this.flareHints = 0;
    this.evoReadyAnnounced.clear();
    this.bubble.reset();
    this.acc = 0;
    this.game.startStage(1);
    this.lastHud = {};
    this.show('playing');
    audio.sfx('strike', 0.9);
    this.game.player.ignite = 1.5;
    if (this.qaInvincible) { this.game.player.invincible = true; this.game.stats.assisted = true; }
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
    for (const rid of g.relics) {
      const d = RELICS[rid];
      list.appendChild(el('div', { class: 'reward relic-owned', title: d.desc }, el('img', { src: icon(d.icon), alt: '' }), el('div', { class: 'nm' }, d.name), el('div', { class: 'lv' }, 'Relic')));
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
        button('Restart', () => {
          const w = g.player.weapons[0]?.id || this.save.startWeapon;
          const daily = g.daily, inferno = g.inferno, seed = g.seed;
          this.endRun(false, true);
          const key = this.dailyKey;
          this.startRun(daily ? { seed, weapon: 'ember', daily: true } : { weapon: w, inferno });
          if (daily && key) this.dailyKey = key;
        }),
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
          el('div', { class: 'tx' }, c.text),
          this.synergyHint(c) ? el('div', { class: 'syn' }, this.synergyHint(c)) : null),
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
    this.navLockUntil = Math.max(this.navLockUntil, performance.now() + 300);
  }

  /** short hint about the evolution partner of a weapon / trinket */
  synergyHint(c: Choice): string {
    const p = this.game.player;
    if (c.kind === 'weapon') {
      const pas = PASSIVES[WEAPONS[c.id].evo.passive];
      const owned = p.passives.some((q) => q.id === pas.id);
      return `★ Evolves with ${pas.name}${owned ? ' (owned)' : ''}`;
    }
    if (c.kind === 'passive') {
      const ws = p.weapons.filter((w) => WEAPONS[w.id].evo.passive === c.id && !w.evo).map((w) => WEAPONS[w.id].name);
      if (ws.length) return `★ Evolves your ${ws.join(' & ')}`;
    }
    return '';
  }

  pickChoice(i: number): string | null {
    if (this.screen !== 'levelup') return null;
    const c = this.choices[i];
    if (!c) return null;
    const g = this.game;
    if (this.banishMode && !((c.kind === 'weapon' || c.kind === 'passive') && c.isNew)) {
      this.toast('Only brand-new options can be banished', 'warn');
      return null;
    }
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
    if (c.kind === 'evo') { this.evoBanner(c); this.bubble.say(g, 'evolve', true); }
    this.afterChoice();
    return c.id;
  }

  /** announce (once per weapon per run) when a weapon becomes ready to evolve */
  evoReadyAnnounced = new Set<string>();
  checkEvolutionReady() {
    const p = this.game.player;
    for (const w of p.weapons) {
      const def = WEAPONS[w.id];
      if (w.evo || w.level < 8 || this.evoReadyAnnounced.has(w.id)) continue;
      if (!p.passives.some((q) => q.id === def.evo.passive)) continue;
      this.evoReadyAnnounced.add(w.id);
      this.toast(`${def.name} is ready to evolve! Look for it on a level-up or in a chest.`, 'gold');
    }
  }

  afterChoice() {
    const g = this.game;
    this.checkEvolutionReady();
    g.pendingLevels = Math.max(0, g.pendingLevels - 1);
    if (g.pendingLevels > 0) {
      this.choices = rollChoices(g, g.choiceCount);
      this.banishMode = false;
      this.renderLevelUp();
    } else {
      this.show('playing');
      // a little burst of heat as Novaki powers up
      const p = g.player;
      g.particle(p.x, p.y - 30, g.fx.softring, { add: true, life: 0.45, s0: 0.15, s1: 1.1, a0: 0.9, tint: 0xffc070 });
      g.sparkleAt(p.x, p.y - 30, 0xffd23a);
      g.addLight(p.x, p.y - 30, 260, 0.4, 0xffc070);
    }
  }

  evoBanner(c: Choice) {
    const b = el('div', { class: 'banner anim evo-banner passthrough', style: { '--hold': '2.2s' } as any },
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
    setTimeout(() => this.checkEvolutionReady(), 0);
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
    this.navLockUntil = performance.now() + 450;
    this.input.clearQueued();
    this.chestT = 2.8;
    audio.sfx('chest', 0.9);
  }

  closeChest() {
    if (this.screen !== 'chest' || performance.now() < this.navLockUntil) return;
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
    this.pendingClear = { id, rewards, stage: g.stage, at: g.time + 4.2 };
  }

  pendingClear: { id: string; rewards: Choice[]; stage: number; at: number } | null = null;
  /** stage clear waits (in simulation time) for the defeat line and any level-up choices */
  updatePendingClear() {
    const pc = this.pendingClear;
    if (!pc || !this.runActive) return;
    const final = pc.stage >= 3;
    if (this.game.time < pc.at || this.screen !== 'playing' || (!final && this.game.pendingLevels > 0)) return;
    this.pendingClear = null;
    if (this.game.stage !== pc.stage) return;
    if (pc.stage >= 3) this.victory();
    else this.showStageClear(pc.id, pc.rewards);
  }

  relicChoices: RelicDef[] = [];
  showStageClear(id: string, rewards: Choice[]) {
    const g = this.game;
    const s = this.screens.stageclear;
    s.className = 'screen show overlay';
    s.innerHTML = '';
    const list = el('div', { class: 'reward-list small' });
    for (const c of rewards) list.appendChild(el('div', { class: 'reward' + (c.kind === 'evo' ? ' evo' : '') }, el('img', { src: icon(c.icon), alt: '' }), el('div', { class: 'nm' }, c.name), el('div', { class: 'lv' }, c.kind === 'evo' ? 'EVOLVED!' : c.isNew ? 'NEW' : 'Level ' + c.level)));
    const next = STAGES[g.stage];
    this.relicChoices = rollRelics(g, 3);
    const relics = el('div', { class: 'relic-list' });
    this.relicChoices.forEach((r, i) => {
      const card = el('div', { class: 'relic paper', 'data-nav': '1' },
        el('div', { class: 'key' }, el('span', { class: 'keycap' }, String(i + 1))),
        el('img', { src: icon(r.icon), alt: '' }),
        el('div', { class: 'nm' }, r.name),
        el('div', { class: 'tx' }, r.desc));
      card.addEventListener('click', () => this.pickRelic(i));
      relics.appendChild(card);
    });
    this.countdownEl = el('div', { class: 'countdown' }, '');
    // a storybook interlude plays first, then the relic choice slides in
    const INTERLUDE: Record<number, string> = {
      1: 'Past the Mothwood, the road wound down to Drizzleport, where the rain never stops.',
      2: "Up the Snuffer's Spire, step after cold step... and the little flame burned brighter with every one.",
    };
    s.appendChild(el('div', { class: 'interlude' },
      el('div', { class: 'interlude-img', style: { backgroundImage: `url(${img('interlude_' + Math.min(2, g.stage))})` } }),
      el('div', { class: 'interlude-cap' }, INTERLUDE[g.stage] || '')));
    s.appendChild(el('div', { class: 'panel paper stageclear-panel', style: { width: 'min(820px, 96vw)', alignItems: 'center', textAlign: 'center', marginTop: '40px' } },
      el('img', { class: 'result-art', src: img('novaki_cheer'), alt: '' }),
      el('h2', { class: 'result-title' }, 'Stage Clear!'),
      el('div', { style: { fontWeight: '700', fontSize: '17px' } }, `${BOSSES[id].name} has been snuffed out!  Time ${fmtTime(g.time)} - Level ${g.player.level}`),
      el('div', { class: 'sc-label sc-treasure' }, 'Boss treasure'),
      list,
      el('div', { class: 'sc-label' }, 'Choose a relic for the road ahead'),
      relics,
      this.countdownEl,
      el('div', { style: { marginTop: '4px', fontStyle: 'italic' } }, next ? `Next: ${next.chapter} - ${next.name}` : ''),
    ));
    this.screen = 'stageclear';
    for (const [k, e] of Object.entries(this.screens)) e.classList.toggle('show', k === 'stageclear');
    this.hud.classList.add('show');
    this.input.setTouchActive(false);
    document.body.classList.add('overlay-open');
    this.nav.setRoot(s, null);
    this.navLockUntil = performance.now() + 2600; // no accidental picks while the panel slides in
    this.stageClearT = 22;
    audio.playMusic('victory', MUSIC.victory, 0.5);
    this.bark([CLEAR_LINE]);
    const rid = this.runId;
    setTimeout(() => { if (this.screen === 'stageclear' && this.runId === rid) document.body.classList.add('subtitle-top'); }, 2100);
  }
  countdownEl: HTMLElement | null = null;

  pickRelic(i: number): string | null {
    if (this.screen !== 'stageclear') return null;
    const r = this.relicChoices[i];
    if (!r) return null;
    grantRelic(this.game, r.id);
    audio.sfx('chest', 0.8);
    this.toast(`Relic gained: ${r.name}`, 'gold');
    this.relicChoices = [];
    this.nextStage();
    return r.id;
  }

  nextStage() {
    if (this.screen !== 'stageclear') return;
    const g = this.game;
    this.screen = 'transition'; // simulation holds while the screen fades
    const rid = this.runId;
    const tok = ++this.transitionToken;
    this.fade(() => {
      // a new run, a QA skipTo or anything else that took over the screen cancels this transition
      if (this.runId !== rid || !this.runActive || tok !== this.transitionToken || this.screen !== 'transition') return;
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
    audio.ambience(null);
    const fair = !g.stats.assisted;
    if (win) { st.wins++; if (fair && (!st.bestTime || g.time < st.bestTime)) st.bestTime = Math.floor(g.time); } else if (!quit) st.deaths++;
    st.kills += g.stats.kills;
    if (fair) st.longestRun = Math.max(st.longestRun, Math.floor(g.time));
    st.bestStage = Math.max(st.bestStage, g.stats.stageReached);
    st.bestLevel = Math.max(st.bestLevel, g.player.level);
    st.totalCoins += earned;
    for (const b of g.stats.bossesKilled) st.bosses[b] = (st.bosses[b] || 0) + 1;
    for (const t of g.seenTypes) if (!this.save.seen.includes(t)) this.save.seen.push(t);
    if (g.daily && !quit) {
      const dk = this.dailyKey || todayKey();
      const prev = this.save.daily && this.save.daily.date === dk ? this.save.daily : null;
      const better = !prev || (win && (!prev.won || g.time < prev.bestTime)) || (!prev.won && !win && (g.stats.stageReached > prev.bestStage || (g.stats.stageReached === prev.bestStage && g.time > prev.bestTime)));
      if (better) this.save.daily = { date: dk, bestTime: Math.floor(g.time), bestStage: g.stats.stageReached, won: win };
    }
    for (const [id, u] of Object.entries(STARTER_UNLOCKS)) if (u && u.check(this.save) && !this.save.unlocks.includes('start_' + id)) this.save.unlocks.push('start_' + id);
    if (win && !this.save.unlocks.includes('victory')) this.save.unlocks.push('victory');
    if (win && g.inferno && !this.save.unlocks.includes('inferno_victory')) this.save.unlocks.push('inferno_victory');
    const achieved = quit ? [] : awardAchievements({
      win, time: g.time, level: g.player.level, kills: g.stats.kills, stage: g.stats.stageReached, bosses: g.stats.bossesKilled,
      evolutions: g.stats.evolutions, dmgTaken: g.stats.dmgTaken, dmgAtStage1Boss: g.stats.dmgAtStage1Boss, flares: g.stats.flares, lamps: g.lightsRelit, relics: g.relics.size,
      inferno: g.inferno, daily: g.daily, weapons: g.player.weapons.length, startWeapon: g.player.weapons[0]?.id || '', assisted: g.stats.assisted,
    }, this.save);
    writeSave(this.save);
    const newUnlocks = this.save.unlocks.filter((u) => !before.has(u) && u.startsWith('start_')).map((u) => WEAPONS[u.slice(6)]?.name).filter(Boolean);
    if (win && !before.has('victory')) newUnlocks.push('Inferno Mode (toggle it when choosing your spark)');
    this.runResult = { win, earned, bonus, newUnlocks, quit, achieved };
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
      ['Damage taken', String(Math.round(g.stats.dmgTaken))], ['Flare-Ups', String(g.stats.flares)], ['Lamps relit', String(g.lightsRelit)], ['Coins earned', `${r.earned} (incl. ${r.bonus} bonus)`],
    ];
    const grid = el('div', { class: 'results' });
    for (const [k, v] of rows) grid.append(el('div', { class: 'k' }, k), el('div', { class: 'v' }, v));
    const wt = el('table', { class: 'wtable' });
    const ws = [...g.player.weapons].sort((a, b) => b.dmg - a.dmg);
    for (const w of ws) {
      const d = WEAPONS[w.id];
      wt.appendChild(el('tr', {}, el('td', {}, el('img', { src: icon(d.icon), alt: '' })), el('td', {}, (w.evo ? d.evo.name : d.name) + (w.evo ? '' : ` (Lv ${w.level})`)), el('td', { class: 'n' }, Math.round(w.dmg).toLocaleString('en-US') + ' dmg'), el('td', { class: 'n' }, w.kills + ' kills')));
    }
    const again = button('Strike Again', () => this.show('loadout'), 'primary');
    s.appendChild(el('div', { class: 'panel paper', style: { width: 'min(720px, 94vw)', marginTop: '50px' } },
      el('img', { class: 'result-art', src: img(win ? 'novaki_cheer' : 'novaki_ko'), alt: '' }),
      el('h2', { class: 'result-title' }, win ? 'Tinderbox Is Lit!' : 'Snuffed Out!'),
      g.stats.assisted ? el('div', { style: { textAlign: 'center', fontSize: '13px', opacity: '0.7' } }, '(QA-assisted run: stage skips used, best times not recorded)') : null,
      g.inferno ? el('div', { style: { textAlign: 'center', fontFamily: 'var(--font-h)', color: '#c8361d' } }, 'INFERNO MODE') : null,
      g.daily ? el('div', { style: { textAlign: 'center', fontFamily: 'var(--font-h)', color: '#a8461a' } }, 'DAILY STRIKE ' + (this.dailyKey || todayKey())) : null,
      el('div', { style: { textAlign: 'center', fontStyle: 'italic', fontWeight: '600', marginBottom: '6px' } }, win ? 'Novaki relit every flame in the land. Not bad for a spent match.' : GAMEOVER_LINE.text),
      win ? el('div', { class: 'thanks' }, 'Thanks for playing! For a hotter challenge, try Inferno Mode or today\'s Daily Strike.') : null,
      el('div', { class: 'scroll' },
        r.achieved && r.achieved.length ? el('div', { class: 'ach-list' }, ...r.achieved.map((a: any) => el('div', { class: 'ach-got' },
          el('span', { class: 'ach-star' }, '★'), el('b', {}, 'Achievement: ' + a.name), ` - ${a.desc} `, el('span', { class: 'ach-coin' }, `+${a.reward}`), el('img', { src: icon('coin'), alt: '' })))) : null,
        grid, wt,
        r.newUnlocks.length ? el('div', { class: 'unlock-note' }, 'Unlocked: ' + r.newUnlocks.join(', ') + '!') : null,
),
      el('div', { class: 'footer' }, again, button('Workshop', () => this.show('shop')), button('Main Menu', () => this.show('menu'))),
    ));
    this.show(id as Screen);
    this.app.stage.visible = !win;
    this.nav.setRoot(s, () => this.show('menu'));
    audio.playMusic(win ? 'victory' : 'gameover', MUSIC[win ? 'victory' : 'gameover']);
    // the narration repeats the panel's tagline, so no subtitle box over the buttons
    if (!win) setTimeout(() => { if (this.screen === 'gameover') this.sayLine(GAMEOVER_LINE, false, false); }, 700);
  }

  /* ================================================================ hooks from the game */
  hooks(): Hooks {
    return {
      levelUp: () => this.openLevelUp(),
      rumble: (s, ms) => this.input.rumble(s, ms),
      say: (kind) => this.bubble.say(this.game, kind),
      flareReady: () => {
        if (this.flareHints === 0) this.bubble.say(this.game, 'flareReady');
        if (this.flareHints < 2 && this.save.stats.runs < 4) {
          this.flareHints++;
          const how = this.input.device === 'gamepad' ? 'Y' : this.input.device === 'touch' ? 'FLARE' : 'E';
          this.toast(`Flare-Up ready! Press ${how} to blast everything on screen`, 'gold');
        }
      },
      bossSpawn: (id) => {
        const b = BOSSES[id];
        const bar = this.hudEls.bossFill.parentElement!;
        bar.querySelectorAll('.notch').forEach((n) => n.remove());
        for (const ph of b.phases) bar.appendChild(el('div', { class: 'notch', style: { left: (ph * 100) + '%' } }));
        const card = el('div', { class: 'bosscard passthrough' }, el('img', { src: img(b.tex), alt: '' }), el('div', {}, el('div', { class: 'nm' }, b.name), el('div', { class: 'ttl' }, b.title.toUpperCase())));
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
        const rid = this.runId;
        if (this.runActive) this.deathTimer = window.setTimeout(() => { this.deathTimer = 0; if (this.runId === rid) this.endRun(false); }, 2200);
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
        const b = el('div', { class: 'banner anim passthrough', style: { '--hold': '3.6s' } as any }, el('div', { class: 'small' }, st.chapter.toUpperCase()), el('div', { class: 'big' }, st.name), el('div', { class: 'tiny' }, st.subtitle));
        this.clearBanners();
        this.addBanner(b, 4400);
        audio.playMusic('stage' + n, st.music, 1.2);
        audio.ambience(st.ambience, n === 2 ? 0.55 : 0.4);
        this.interruptBarks();
        this.bark([CHAPTER_LINES[n]]);
        audio.preloadMusic(st.bossMusic);
      },
      warning: (text) => {
        const b = el('div', { class: 'banner anim warning-banner passthrough', style: { '--hold': '2.6s' } as any }, el('div', { class: 'big' }, 'WARNING'), el('div', { class: 'small' }, text));
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

  /* ================================================================ adaptive resolution */
  private perfWin = { t: 0, frames: 0 };
  private adaptCooldown = 0;
  private slowWindows = 0;
  autoLowFx = false;
  lowFxUserSet = false;
  /** If gameplay runs slow on a high-DPI screen, render at a lower resolution. */
  adaptResolution(dt: number) {
    if (this.screen !== 'playing' || !this.game.running) { this.perfWin.t = 0; this.perfWin.frames = 0; return; }
    if (this.adaptCooldown > 0) { this.adaptCooldown -= dt; return; }
    this.perfWin.t += dt;
    this.perfWin.frames++;
    if (this.perfWin.t < 3) return;
    const fps = this.perfWin.frames / this.perfWin.t;
    this.perfWin.t = 0;
    this.perfWin.frames = 0;
    const r = this.app.renderer.resolution;
    if (fps < 40 && r <= 1 && !this.game.settings.lowFx && !this.lowFxUserSet) {
      // already at 1x: two slow windows in a row switch effects to reduced for this session
      if (++this.slowWindows >= 2) {
        this.autoLowFx = true;
        this.applySettings();
        this.toast('Effects reduced for smoother play (see Settings)', 'info');
        console.info(`[novaki] low FPS (${fps.toFixed(0)}) at 1x, effects reduced`);
      }
      return;
    }
    if (fps >= 40) this.slowWindows = 0;
    if (fps < 48 && r > 1) {
      const nr = Math.max(1, Math.round((r - 0.5) * 4) / 4);
      this.app.renderer.resize(this.app.screen.width, this.app.screen.height, nr);
      this.adaptCooldown = 4;
      console.info(`[novaki] low FPS (${fps.toFixed(0)}), render resolution ${r} -> ${nr}`);
    }
  }

  /* ================================================================ main loop */
  private tickErrors = 0;
  tick(dt: number) {
    try {
      this.tickInner(dt);
    } catch (e) {
      // Pixi's ticker stops for good if a frame throws; report it once and keep the game running
      if (this.tickErrors++ === 0) console.error('[novaki] frame error', e);
    }
  }

  tickInner(dt: number) {
    dt = Math.min(dt, 0.1);
    this.adaptResolution(dt);
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
        if (this.input.consumeFlare()) g.input.flare = true;
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
      if (this.countdownEl) this.countdownEl.textContent = `Auto-picking in ${Math.max(0, Math.ceil(this.stageClearT))}s`;
      if (this.stageClearT <= 0) { if (this.relicChoices.length) this.pickRelic(0); else this.nextStage(); }
      g.render(1, dt * 0.3);
    } else if (this.screen === 'gameover') {
      g.render(1, dt * 0.2);
    } else {
      g.render(1, 0);
    }
    this.updatePendingClear();
    this.bubble.update(g, dt, this.screen === 'playing' && g.running);
    // dash readiness for touch button
    const p = g.player;
    this.input.dashReady = p ? 1 - Math.max(0, p.dashCd) / p.stats.dashCd : 1;
    this.input.flareReady = g.flare;
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
    const stDef = STAGES[g.stage - 1];
    const left = Math.max(0, stDef.duration - g.stageTime);
    const showIn = !bossOn && !g.director?.bossStarted;
    this.setHud('bossInShow', String(showIn), (v) => { H.bossIn.style.display = v === 'true' ? 'block' : 'none'; });
    if (showIn) {
      this.setHud('bossInTxt', fmtTime(left), (v) => { H.bossInTxt.textContent = 'BOSS IN ' + v; });
      this.setHud('bossInFill', (Math.min(1, g.stageTime / stDef.duration) * 100).toFixed(1), (v) => { H.bossInFill.style.width = v + '%'; });
    }
    this.setHud('bossOn', String(bossOn), (v) => { H.boss.classList.toggle('show', v === 'true'); });
    if (bossOn) {
      this.setHud('bossName', b!.def.name, (v) => { H.bossName.textContent = v; });
      this.setHud('bossHp', (Math.max(0, b!.hp) / b!.maxHp * 100).toFixed(1), (v) => { H.bossFill.style.width = v + '%'; });
    }
    this.setHud('flare', g.flare.toFixed(2), (v) => { H.flareFill.style.width = (Number(v) * 100).toFixed(0) + '%'; H.flare.classList.toggle('full', Number(v) >= 1); });
    const flareKey = this.input.device === 'gamepad' ? 'Y' : this.input.device === 'touch' ? 'TAP FLARE' : 'E';
    this.setHud('flareTxt', g.flare >= 1 ? 'FLARE READY - ' + flareKey : 'FLARE', (v) => { H.flareTxt.textContent = v; });
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

  /* ================================================================ QA interface: see src/qa.ts */
  installQA() {
    installQA(this);
  }
}

const theApp = new App();
(window as any).__novaki = theApp;
theApp.boot().catch((e) => {
  console.error(e);
  const m = document.querySelector('#loading .msg');
  if (m) m.textContent = 'Failed to start: ' + (e?.message || e);
});
