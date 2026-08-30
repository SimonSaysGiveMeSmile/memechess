// Lightweight, dependency-free local persistence.
// A stable per-browser user ID + win/loss/draw record. No backend required for MVP;
// swap these functions for API calls when a cross-device DB is added.

export interface Stats {
  wins: number;
  losses: number;
  draws: number;
  games: number;
  streak: number; // current win streak
  best: number; // best win streak
}

const ID_KEY = "memechess.uid";
const NAME_KEY = "memechess.name";
const STATS_KEY = "memechess.stats";
const PREFS_KEY = "memechess.prefs";

const EMPTY_STATS: Stats = { wins: 0, losses: 0, draws: 0, games: 0, streak: 0, best: 0 };

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "u-" + Math.abs(Date.now() ^ Math.floor(Math.random() * 1e9)).toString(36);
}

export function getUserId(): string {
  if (typeof window === "undefined") return "server";
  let id = localStorage.getItem(ID_KEY);
  if (!id) {
    id = uuid();
    localStorage.setItem(ID_KEY, id);
  }
  return id;
}

export function getName(): string {
  if (typeof window === "undefined") return "Player";
  return localStorage.getItem(NAME_KEY) || "";
}

export function setName(name: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(NAME_KEY, name.slice(0, 24));
}

export function getStats(): Stats {
  if (typeof window === "undefined") return { ...EMPTY_STATS };
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) return { ...EMPTY_STATS };
    return { ...EMPTY_STATS, ...JSON.parse(raw) };
  } catch {
    return { ...EMPTY_STATS };
  }
}

export function recordResult(result: "win" | "loss" | "draw"): Stats {
  const s = getStats();
  s.games += 1;
  if (result === "win") {
    s.wins += 1;
    s.streak += 1;
    s.best = Math.max(s.best, s.streak);
  } else if (result === "loss") {
    s.losses += 1;
    s.streak = 0;
  } else {
    s.draws += 1;
  }
  if (typeof window !== "undefined") localStorage.setItem(STATS_KEY, JSON.stringify(s));
  return s;
}

export interface Prefs {
  themeId: string;
  sound: boolean;
  byoKey: string; // player's own key (optional); stored locally only
  byoBaseUrl: string;
  assistModel: string; // model powering the Hint feature (independent of opponent)
}

export function getPrefs(): Prefs {
  const fallback: Prefs = {
    themeId: "classic",
    sound: true,
    byoKey: "",
    byoBaseUrl: "",
    assistModel: "claude-sonnet-4-6",
  };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

export function savePrefs(p: Partial<Prefs>): void {
  if (typeof window === "undefined") return;
  const merged = { ...getPrefs(), ...p };
  localStorage.setItem(PREFS_KEY, JSON.stringify(merged));
}
