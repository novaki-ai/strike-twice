/** Persistent save (meta progression + settings) in localStorage. */
export interface Settings {
  music: number;
  sfx: number;
  voice: number;
  shake: boolean;
  dmgNumbers: boolean;
  flashes: boolean;
  showFps: boolean;
  subtitles: boolean;
  vibration: boolean;
}

export interface SaveData {
  v: number;
  coins: number;
  shop: Record<string, number>;
  unlocks: string[];
  startWeapon: string;
  seenIntro: boolean;
  seen: string[];
  daily: { date: string; bestTime: number; bestStage: number; won: boolean } | null;
  stats: {
    runs: number;
    wins: number;
    deaths: number;
    kills: number;
    bestTime: number; // fastest win in seconds (0 = none)
    longestRun: number;
    bestStage: number;
    bestLevel: number;
    totalCoins: number;
    bosses: Record<string, number>;
  };
  settings: Settings;
}

const KEY = 'novaki-strike-twice-save-v1';

function prefersReducedMotion(): boolean {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

export function defaultSave(): SaveData {
  const calm = prefersReducedMotion();
  return {
    v: 1,
    coins: 0,
    shop: {},
    unlocks: [],
    startWeapon: 'ember',
    seenIntro: false,
    seen: [],
    daily: null,
    stats: {
      runs: 0, wins: 0, deaths: 0, kills: 0, bestTime: 0, longestRun: 0,
      bestStage: 0, bestLevel: 0, totalCoins: 0, bosses: {},
    },
    settings: {
      music: 0.7, sfx: 0.8, voice: 1, shake: !calm, dmgNumbers: true, flashes: !calm,
      showFps: false, subtitles: true, vibration: true,
    },
  };
}

let memoryFallback: string | null = null;

export function loadSave(): SaveData {
  const d = defaultSave();
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    raw = memoryFallback;
  }
  if (!raw) return d;
  try {
    const s = JSON.parse(raw);
    return {
      ...d,
      ...s,
      stats: { ...d.stats, ...(s.stats || {}) },
      settings: { ...d.settings, ...(s.settings || {}) },
      shop: { ...(s.shop || {}) },
      unlocks: Array.isArray(s.unlocks) ? s.unlocks : [],
      seen: Array.isArray(s.seen) ? s.seen : [],
    };
  } catch {
    return d;
  }
}

export function writeSave(s: SaveData) {
  const raw = JSON.stringify(s);
  try {
    localStorage.setItem(KEY, raw);
  } catch {
    memoryFallback = raw;
  }
}

export function wipeSave(): SaveData {
  try {
    localStorage.removeItem(KEY);
  } catch {
    memoryFallback = null;
  }
  return defaultSave();
}
