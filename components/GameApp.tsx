"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import Board from "./Board";
import { THEMES, getTheme, type Theme } from "@/lib/themes";
import { MODELS, SKILLS, DEFAULT_MODEL, modelLabel, validModel, type Skill } from "@/lib/models";
import { requestAiMove } from "@/lib/ai";
import PieceSvg from "./PieceSvg";
import { sfx } from "@/lib/sound";
import {
  getUserId,
  getName,
  setName as persistName,
  getStats,
  recordResult,
  getPrefs,
  savePrefs,
  type Stats,
} from "@/lib/storage";

type Mode = "ai" | "local" | "watch";
type Color = "white" | "black";

interface PlayerCfg {
  kind: "human" | "ai";
  name: string;
  model?: string;
}

interface TimeCtrl {
  label: string;
  min: number; // 0 = unlimited
  inc: number;
}

const TIME_CONTROLS: TimeCtrl[] = [
  { label: "1+0", min: 1, inc: 0 },
  { label: "3+2", min: 3, inc: 2 },
  { label: "5+0", min: 5, inc: 0 },
  { label: "10+0", min: 10, inc: 0 },
  { label: "∞", min: 0, inc: 0 },
];

function fmtClock(ms: number): string {
  if (ms <= 0) return "0:00";
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m >= 1) return `${m}:${sec.toString().padStart(2, "0")}`;
  const tenths = Math.floor((ms % 1000) / 100);
  return `0:${sec.toString().padStart(2, "0")}.${tenths}`;
}

export default function GameApp() {
  const chessRef = useRef<Chess>(new Chess());
  const [, force] = useState(0);
  const rerender = useCallback(() => force((n) => n + 1), []);

  // ── identity / persistence ────────────────────────────────────────────────
  const [mounted, setMounted] = useState(false);
  const [uid, setUid] = useState("");
  const [name, setName] = useState("");
  const [stats, setStats] = useState<Stats>({ wins: 0, losses: 0, draws: 0, games: 0, streak: 0, best: 0 });

  // ── settings (live; game-affecting ones apply on New game) ────────────────
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [themeId, setThemeId] = useState("classic");
  const [mode, setMode] = useState<Mode>("ai");
  const [humanColor, setHumanColor] = useState<Color>("white");
  const [aiModel, setAiModel] = useState(DEFAULT_MODEL);
  const [whiteModel, setWhiteModel] = useState("claude-opus-4-8");
  const [blackModel, setBlackModel] = useState("claude-sonnet-4-6");
  const [skill, setSkill] = useState<Skill>("sharp");
  const [tc, setTc] = useState<TimeCtrl>(TIME_CONTROLS[3]); // 10+0 default
  const [byoKey, setByoKey] = useState("");
  const [byoBaseUrl, setByoBaseUrl] = useState("");
  const [sound, setSound] = useState(true);
  const [assistModel, setAssistModel] = useState("claude-sonnet-4-6");

  // ── live game state ───────────────────────────────────────────────────────
  const [players, setPlayers] = useState<{ w: PlayerCfg; b: PlayerCfg } | null>(null);
  const [orientation, setOrientation] = useState<Color>("white");
  const [selected, setSelected] = useState<Square | null>(null);
  const [targets, setTargets] = useState<Set<string>>(new Set());
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [hint, setHint] = useState<{ from: string; to: string; san: string } | null>(null);
  const [hintBusy, setHintBusy] = useState(false);
  const [boom, setBoom] = useState<{ square: string; color: "w" | "b"; type: string; tick: number } | null>(null);
  const [clocks, setClocks] = useState<{ w: number; b: number }>({ w: Infinity, b: Infinity });
  const [running, setRunning] = useState(false);
  const [over, setOver] = useState<{ result: Color | "draw"; reason: string } | null>(null);
  const [quip, setQuip] = useState<{ from: string; text: string; thinking: boolean } | null>(null);
  const [pending, setPending] = useState<{ from: Square; to: Square } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const theme = getTheme(themeId);
  const clockRef = useRef(clocks);
  clockRef.current = clocks;
  const runningRef = useRef(running);
  runningRef.current = running;
  const overRef = useRef(over);
  overRef.current = over;
  const aiBusy = useRef(false);
  const playersRef = useRef(players);
  playersRef.current = players;
  const soundRef = useRef(sound);
  soundRef.current = sound;
  const tcRef = useRef(tc);
  tcRef.current = tc;

  // ── mount: load persisted identity + prefs, then start playing right away ─
  useEffect(() => {
    setMounted(true);
    setUid(getUserId());
    const savedName = getName();
    setName(savedName);
    setStats(getStats());
    const p = getPrefs();
    // shareable skin links: ?skin=skibidi beats the saved preference
    const urlSkin = new URLSearchParams(window.location.search).get("skin");
    const initialThemeId =
      urlSkin && THEMES.some((t) => t.id === urlSkin) ? urlSkin : p.themeId || "classic";
    setThemeId(initialThemeId);
    setSound(p.sound);
    setByoKey(p.byoKey);
    setByoBaseUrl(p.byoBaseUrl);
    // sanitize stored ids — a model removed from the list falls back gracefully
    setAssistModel(validModel(p.assistModel, "claude-sonnet-4-6"));
    // no setup screen — drop the user straight onto a live board
    beginGame({
      mode: "ai",
      humanColor: "white",
      aiModel: DEFAULT_MODEL,
      name: savedName,
      tc: TIME_CONTROLS[3],
      themeName: getTheme(initialThemeId).name,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chess = chessRef.current;

  const derived = useMemo(() => {
    const board = chess.board();
    const turn: Color = chess.turn() === "w" ? "white" : "black";
    const inCheck = chess.inCheck();
    let checkSquare: string | null = null;
    if (inCheck) {
      const kc = chess.turn();
      for (const row of board)
        for (const cell of row)
          if (cell && cell.type === "k" && cell.color === kc) checkSquare = cell.square;
    }
    return { board, turn, checkSquare, history: chess.history() };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chess, force, over, lastMove]);

  const current = players ? players[derived.turn === "white" ? "w" : "b"] : null;
  const humanToMove = !!current && current.kind === "human" && !over && running;
  const humanSide: Color | null = players
    ? players.w.kind === "human" && players.b.kind === "human"
      ? derived.turn // local mode: assist whoever is to move
      : players.w.kind === "human"
        ? "white"
        : players.b.kind === "human"
          ? "black"
          : null
    : null;

  // ── clock tick (only after the first move — landing users aren't rushed) ──
  useEffect(() => {
    if (tc.min === 0) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = now - last;
      last = now;
      if (runningRef.current && !overRef.current && chessRef.current.history().length > 0) {
        const side = chessRef.current.turn() === "w" ? "w" : "b";
        setClocks((c) => {
          const cur = c[side];
          if (!isFinite(cur)) return c;
          const next = Math.max(0, cur - dt);
          if (next <= 0) queueMicrotask(() => flagFall(side));
          return { ...c, [side]: next };
        });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tc]);

  const flagFall = useCallback(
    (side: "w" | "b") => {
      if (overRef.current) return;
      finish(side === "w" ? "black" : "white", "on time");
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // ── finish / result handling ──────────────────────────────────────────────
  const finish = useCallback((result: Color | "draw", reason: string) => {
    if (overRef.current) return;
    setRunning(false);
    setOver({ result, reason });
    setQuip(null);
    setHint(null);
    const pl = playersRef.current;
    if (pl) {
      const hs =
        pl.w.kind === "human" && pl.b.kind === "human"
          ? null
          : pl.w.kind === "human"
            ? "white"
            : pl.b.kind === "human"
              ? "black"
              : null;
      if (hs) {
        const r = result === "draw" ? "draw" : result === hs ? "win" : "loss";
        setStats(recordResult(r));
        if (soundRef.current) (r === "win" ? sfx.win : r === "loss" ? sfx.lose : sfx.move)();
      } else if (soundRef.current) {
        sfx.win();
      }
    }
  }, []);

  const checkGameOver = useCallback((): boolean => {
    const c = chessRef.current;
    if (!c.isGameOver()) return false;
    if (c.isCheckmate()) finish(c.turn() === "w" ? "black" : "white", "by checkmate");
    else if (c.isStalemate()) finish("draw", "by stalemate");
    else if (c.isThreefoldRepetition()) finish("draw", "by repetition");
    else if (c.isInsufficientMaterial()) finish("draw", "insufficient material");
    else if (c.isDraw()) finish("draw", "by the 50-move rule");
    else finish("draw", "");
    return true;
  }, [finish]);

  // ── move application ──────────────────────────────────────────────────────
  const applyMove = useCallback(
    (move: { from: string; to: string; promotion?: string } | string) => {
      const c = chessRef.current;
      let result;
      try {
        result = c.move(move as never);
      } catch {
        return false;
      }
      if (!result) return false;

      const moved = result.color === "w" ? "w" : "b";
      if (tcRef.current.inc > 0 && tcRef.current.min > 0) {
        setClocks((cl) => (isFinite(cl[moved]) ? { ...cl, [moved]: cl[moved] + tcRef.current.inc * 1000 } : cl));
      }

      setLastMove({ from: result.from, to: result.to });
      setSelected(null);
      setTargets(new Set());
      setHint(null);
      if (result.captured) {
        // burst shows the victim piece evaporating
        setBoom({
          square: result.to,
          color: result.color === "w" ? "b" : "w",
          type: result.captured,
          tick: c.history().length,
        });
        setTimeout(() => setBoom((b) => (b && b.tick === c.history().length ? null : b)), 650);
      }
      if (soundRef.current) {
        if (c.inCheck()) sfx.check();
        else if (result.captured) sfx.capture();
        else sfx.move();
      }
      rerender();
      checkGameOver();
      return true;
    },
    [checkGameOver, rerender]
  );

  // ── AI opponent driver ────────────────────────────────────────────────────
  useEffect(() => {
    if (!players || over || !running) return;
    const side = derived.turn;
    const cfg = players[side === "white" ? "w" : "b"];
    if (cfg.kind !== "ai" || aiBusy.current) return;

    aiBusy.current = true;
    let cancelled = false;
    const c = chessRef.current;
    const legal = c.moves();
    const remaining = tc.min === 0 ? 20000 : Math.max(1500, clockRef.current[side === "white" ? "w" : "b"]);

    setQuip({ from: cfg.name, text: theme.vocab.thinking, thinking: true });

    const started = performance.now();
    requestAiMove({
      fen: c.fen(),
      ascii: c.ascii(),
      legalMoves: legal,
      color: side,
      moveNumber: Math.floor(c.moveNumber()),
      model: cfg.model || DEFAULT_MODEL,
      skill,
      persona: theme.persona,
      timeoutMs: Math.min(remaining, 26000),
      byoKey: byoKey || undefined,
      byoBaseUrl: byoBaseUrl || undefined,
    })
      .then((res) => {
        if (cancelled || overRef.current) return;
        const elapsed = performance.now() - started;
        const wait = Math.max(0, 420 - elapsed);
        setTimeout(() => {
          if (cancelled || overRef.current) return;
          setQuip({ from: cfg.name, text: res.quip || "…", thinking: false });
          if (res.error) setToast(res.error);
          applyMove(res.move);
          aiBusy.current = false;
        }, wait);
      })
      .catch((e) => {
        if (cancelled) return;
        setToast(String(e));
        aiBusy.current = false;
      });

    return () => {
      cancelled = true;
      aiBusy.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, over, running, derived.turn, force]);

  // ── AI assist (hint for the human) ────────────────────────────────────────
  const requestHint = useCallback(() => {
    if (!humanToMove || hintBusy || !humanSide) return;
    const c = chessRef.current;
    const legal = c.moves();
    if (!legal.length) return;
    setHintBusy(true);
    setQuip({ from: `Assist · ${modelLabel(assistModel)}`, text: "analyzing your position…", thinking: true });
    requestAiMove({
      fen: c.fen(),
      ascii: c.ascii(),
      legalMoves: legal,
      color: humanSide,
      moveNumber: Math.floor(c.moveNumber()),
      model: assistModel,
      skill: "ruthless",
      persona: "a concise chess coach",
      purpose: "assist", // deeper server-side analysis prompt, temperature 0
      timeoutMs: 25000,
      byoKey: byoKey || undefined,
      byoBaseUrl: byoBaseUrl || undefined,
    })
      .then((res) => {
        // convert SAN → from/to for the board highlight (make + undo, never mutates the real line)
        let from = "";
        let to = "";
        try {
          const mv = c.move(res.move);
          if (mv) {
            from = mv.from;
            to = mv.to;
            c.undo();
          }
        } catch {
          /* leave unhighlighted */
        }
        if (from && to) setHint({ from, to, san: res.move });
        setQuip({
          from: `Assist · ${modelLabel(res.model)}`,
          text: `${res.move} — ${res.quip || "strongest move I see."}`,
          thinking: false,
        });
        if (res.error) setToast(res.error);
      })
      .catch((e) => setToast(String(e)))
      .finally(() => setHintBusy(false));
  }, [humanToMove, hintBusy, humanSide, assistModel, byoKey, byoBaseUrl]);

  // dismiss toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  // ── human interaction ─────────────────────────────────────────────────────
  const selectSquare = useCallback((sq: Square) => {
    const c = chessRef.current;
    const moves = c.moves({ square: sq, verbose: true });
    setSelected(sq);
    setTargets(new Set(moves.map((m) => m.to)));
    if (soundRef.current) sfx.select();
  }, []);

  const onSquare = useCallback(
    (sq: Square) => {
      if (!humanToMove) return;
      const c = chessRef.current;
      const piece = c.get(sq);
      const turnColor = c.turn();

      if (selected) {
        if (targets.has(sq)) {
          const sel = c.get(selected);
          const toRank = sq[1];
          if (sel?.type === "p" && (toRank === "8" || toRank === "1")) {
            setPending({ from: selected, to: sq });
            return;
          }
          applyMove({ from: selected, to: sq });
          return;
        }
        if (piece && piece.color === turnColor) {
          selectSquare(sq);
          return;
        }
        setSelected(null);
        setTargets(new Set());
        return;
      }
      if (piece && piece.color === turnColor) selectSquare(sq);
    },
    [humanToMove, selected, targets, applyMove, selectSquare]
  );

  const choosePromotion = useCallback(
    (p: "q" | "r" | "b" | "n") => {
      if (!pending) return;
      applyMove({ from: pending.from, to: pending.to, promotion: p });
      setPending(null);
    },
    [pending, applyMove]
  );

  // ── start / reset ─────────────────────────────────────────────────────────
  function beginGame(cfg: {
    mode: Mode;
    humanColor: Color;
    aiModel: string;
    name: string;
    tc: TimeCtrl;
    whiteM?: string;
    blackM?: string;
    themeName?: string;
  }) {
    chessRef.current = new Chess();
    const aiName = `${cfg.themeName ?? getTheme(getPrefs().themeId || "classic").name} AI`;
    let p: { w: PlayerCfg; b: PlayerCfg };
    if (cfg.mode === "local") {
      p = { w: { kind: "human", name: cfg.name || "White" }, b: { kind: "human", name: "Black" } };
      setOrientation("white");
    } else if (cfg.mode === "ai") {
      const human: PlayerCfg = { kind: "human", name: cfg.name || "You" };
      const ai: PlayerCfg = { kind: "ai", name: aiName, model: cfg.aiModel };
      p = cfg.humanColor === "white" ? { w: human, b: ai } : { w: ai, b: human };
      setOrientation(cfg.humanColor);
    } else {
      p = {
        w: { kind: "ai", name: modelLabel(cfg.whiteM || "claude-opus-4-8"), model: cfg.whiteM || "claude-opus-4-8" },
        b: { kind: "ai", name: modelLabel(cfg.blackM || "claude-sonnet-4-6"), model: cfg.blackM || "claude-sonnet-4-6" },
      };
      setOrientation("white");
    }
    setPlayers(p);
    const startMs = cfg.tc.min === 0 ? Infinity : cfg.tc.min * 60000;
    setClocks({ w: startMs, b: startMs });
    setSelected(null);
    setTargets(new Set());
    setLastMove(null);
    setHint(null);
    setOver(null);
    setQuip(null);
    setPending(null);
    aiBusy.current = false;
    setRunning(true);
    rerender();
  }

  const newGame = useCallback(() => {
    beginGame({
      mode,
      humanColor,
      aiModel,
      name,
      tc,
      whiteM: whiteModel,
      blackM: blackModel,
      themeName: theme.name,
    });
    setSettingsOpen(false);
    savePrefs({ themeId, sound, byoKey, byoBaseUrl });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, humanColor, aiModel, name, tc, whiteModel, blackModel, theme, themeId, sound, byoKey, byoBaseUrl]);

  const resign = useCallback(() => {
    if (over || !players) return;
    const hs = players.w.kind === "human" ? "white" : players.b.kind === "human" ? "black" : null;
    if (hs) finish(hs === "white" ? "black" : "white", "by resignation");
    else finish("draw", "aborted");
  }, [over, players, finish]);

  // persist skin instantly while browsing
  useEffect(() => {
    if (mounted) savePrefs({ themeId });
  }, [themeId, mounted]);

  const themeStyle = useMemo(() => {
    const s: Record<string, string> = { ...theme.vars };
    if (theme.bgFx) s["--bg-fx"] = theme.bgFx;
    return s as React.CSSProperties;
  }, [theme]);

  const topColor: Color = orientation === "white" ? "black" : "white";
  const botColor: Color = orientation;

  const resultText = (() => {
    if (!over || !players) return "";
    if (over.result === "draw") return theme.vocab.draw;
    const hs = players.w.kind === "human" ? "white" : players.b.kind === "human" ? "black" : null;
    if (hs) return over.result === hs ? theme.vocab.win : theme.vocab.lose;
    return `${over.result === "white" ? "White" : "Black"} wins`;
  })();

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="app" data-theme={theme.id} style={themeStyle}>
      <div className="wrap">
        <header className="topbar">
          <div className="brand">
            <span className="mark">
              <PieceSvg type="n" color="w" />
            </span>
            <div>
              MemeChess
              <div className="byo">bring your own AI · model always disclosed</div>
            </div>
          </div>
          <div className="topactions">
            <div className="pill" title={`Your local player ID: ${uid}`}>
              <b>{stats.wins}</b>W·<b>{stats.losses}</b>L·<b>{stats.draws}</b>D
            </div>
            <button
              className="btn gear"
              aria-expanded={settingsOpen}
              aria-label="Settings"
              onClick={() => setSettingsOpen((o) => !o)}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.09a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55h.09a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.09a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z" />
              </svg>
            </button>
          </div>
        </header>

        {settingsOpen && (
          <>
            <div className="scrim" onClick={() => setSettingsOpen(false)} />
            <div className="settings" role="dialog" aria-label="Game settings">
              <div className="settings-hd">
                <span>Settings</span>
                <button className="x" onClick={() => setSettingsOpen(false)} aria-label="Close">
                  ×
                </button>
              </div>

              <div className="label">Skin</div>
              <div className="skinrow">
                {THEMES.map((t) => (
                  <button
                    key={t.id}
                    className="skindot"
                    data-on={themeId === t.id}
                    style={{
                      ["--sw-accent" as string]: t.vars["--accent"],
                      background: `conic-gradient(${t.vars["--light"]} 0 90deg, ${t.vars["--dark"]} 90deg 180deg, ${t.vars["--light"]} 180deg 270deg, ${t.vars["--dark"]} 270deg)`,
                    }}
                    title={`${t.name} — ${t.blurb}`}
                    onClick={() => setThemeId(t.id)}
                  />
                ))}
              </div>
              <div className="skinname">
                {theme.name} · {theme.blurb}
              </div>

              <div className="label">Mode</div>
              <div className="seg">
                {(["ai", "local", "watch"] as Mode[]).map((m) => (
                  <button key={m} data-on={mode === m} onClick={() => setMode(m)}>
                    {m === "ai" ? "vs AI" : m === "local" ? "2-player" : "AI vs AI"}
                  </button>
                ))}
              </div>

              {mode === "ai" && (
                <>
                  <div className="label">Play as</div>
                  <div className="seg">
                    {(["white", "black"] as Color[]).map((c) => (
                      <button key={c} data-on={humanColor === c} onClick={() => setHumanColor(c)}>
                        {c === "white" ? "White" : "Black"}
                      </button>
                    ))}
                  </div>
                  <div className="label">Opponent model (disclosed)</div>
                  <select className="field" value={aiModel} onChange={(e) => setAiModel(e.target.value)}>
                    {MODELS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label} — {m.note}
                      </option>
                    ))}
                  </select>
                </>
              )}

              {mode === "watch" && (
                <>
                  <div className="label">White model</div>
                  <select className="field" value={whiteModel} onChange={(e) => setWhiteModel(e.target.value)}>
                    {MODELS.map((m) => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>
                  <div className="label">Black model</div>
                  <select className="field" value={blackModel} onChange={(e) => setBlackModel(e.target.value)}>
                    {MODELS.map((m) => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>
                </>
              )}

              {mode !== "local" && (
                <>
                  <div className="label">Difficulty</div>
                  <div className="seg">
                    {SKILLS.map((s) => (
                      <button key={s.id} data-on={skill === s.id} onClick={() => setSkill(s.id)} title={s.note}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </>
              )}

              <div className="label">Clock</div>
              <div className="seg">
                {TIME_CONTROLS.map((t) => (
                  <button key={t.label} data-on={tc.label === t.label} onClick={() => setTc(t)}>
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="label">Name</div>
              <input
                className="field"
                value={name}
                placeholder="anon"
                maxLength={24}
                onChange={(e) => {
                  setName(e.target.value);
                  persistName(e.target.value);
                }}
              />

              <div className="label">Sound</div>
              <div className="seg">
                <button data-on={sound} onClick={() => { setSound(true); savePrefs({ sound: true }); }}>On</button>
                <button data-on={!sound} onClick={() => { setSound(false); savePrefs({ sound: false }); }}>Off</button>
              </div>

              <details className="adv">
                <summary>Bring your own API key</summary>
                <div style={{ paddingTop: 10, display: "grid", gap: 10 }}>
                  <p className="disclose">
                    Optional — overrides the built-in provider. Sent per-request, stored only in this browser.
                  </p>
                  <input
                    className="field"
                    value={byoBaseUrl}
                    placeholder="Base URL (e.g. https://api.anthropic.com)"
                    onChange={(e) => { setByoBaseUrl(e.target.value); savePrefs({ byoBaseUrl: e.target.value }); }}
                  />
                  <input
                    className="field"
                    type="password"
                    value={byoKey}
                    placeholder="sk-…"
                    onChange={(e) => { setByoKey(e.target.value); savePrefs({ byoKey: e.target.value }); }}
                  />
                </div>
              </details>

              <button className="btn primary block" onClick={newGame}>
                New game with these settings →
              </button>
            </div>
          </>
        )}

        {players && (
          <main className="game">
            <div className="boardcol">
              <PlayerStrip
                cfg={players[topColor === "white" ? "w" : "b"]}
                color={topColor}
                clock={clocks[topColor === "white" ? "w" : "b"]}
                active={derived.turn === topColor && !over}
              />
              <div className="board-shell">
                <Board
                  board={derived.board}
                  orientation={orientation}
                  selected={selected}
                  targets={targets}
                  lastMove={lastMove}
                  hint={hint}
                  checkSquare={derived.checkSquare}
                  interactive={humanToMove}
                  moveTick={derived.history.length}
                  boom={boom}
                  onSquare={onSquare}
                />
                {over && (
                  <div className="overlay">
                    <div>
                      {over.result !== "draw" && (
                        <span className="ovpiece">
                          <PieceSvg type="k" color={over.result === "white" ? "w" : "b"} />
                        </span>
                      )}
                      <h3>{resultText}</h3>
                      <p>
                        {over.result === "draw" ? "Draw" : `${over.result === "white" ? "White" : "Black"} wins`}{" "}
                        {over.reason}
                      </p>
                      <div className="controls" style={{ justifyContent: "center" }}>
                        <button className="btn primary" onClick={newGame}>
                          Rematch
                        </button>
                        <button className="btn" onClick={() => setSettingsOpen(true)}>
                          Settings
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                {pending && (
                  <div className="overlay">
                    <div>
                      <h3 style={{ fontSize: 24 }}>Promote to…</h3>
                      <div className="controls" style={{ justifyContent: "center" }}>
                        {(["q", "r", "b", "n"] as const).map((pc) => (
                          <button
                            key={pc}
                            className="btn promo"
                            onClick={() => choosePromotion(pc)}
                          >
                            <PieceSvg type={pc} color={derived.turn === "white" ? "w" : "b"} />
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <PlayerStrip
                cfg={players[botColor === "white" ? "w" : "b"]}
                color={botColor}
                clock={clocks[botColor === "white" ? "w" : "b"]}
                active={derived.turn === botColor && !over}
              />
            </div>

            <aside className="side">
              <div className="quip">
                <div className="from">{quip ? quip.from : "MemeChess"}</div>
                <div className={`txt ${quip?.thinking ? "think" : ""}`}>
                  {quip ? quip.text : humanToMove ? "Your move." : theme.vocab.greet}
                </div>
              </div>

              <div className="assistrow" title="AI assist — your chosen model analyzes the position and suggests a move">
                <button className="btn primary" onClick={requestHint} disabled={!humanToMove || hintBusy}>
                  {hintBusy ? "Analyzing…" : "Hint"}
                </button>
                <select
                  className="field compact"
                  value={assistModel}
                  aria-label="Assist model"
                  onChange={(e) => {
                    setAssistModel(e.target.value);
                    savePrefs({ assistModel: e.target.value });
                  }}
                >
                  {MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="controls">
                <button className="btn" onClick={() => setOrientation((o) => (o === "white" ? "black" : "white"))}>
                  Flip
                </button>
                {mode === "watch" ? (
                  <button className="btn" onClick={() => setRunning((r) => !r)}>
                    {running ? "Pause" : "Play"}
                  </button>
                ) : (
                  <button className="btn" onClick={resign} disabled={!!over}>
                    Resign
                  </button>
                )}
              </div>

              <div className="moves">
                <div className="hd">Moves</div>
                <div className="movelist">
                  {derived.history.length === 0 && <div className="empty">No moves yet — you're White. Go!</div>}
                  {Array.from({ length: Math.ceil(derived.history.length / 2) }).map((_, i) => (
                    <Row key={i} n={i + 1} w={derived.history[i * 2]} b={derived.history[i * 2 + 1]} />
                  ))}
                </div>
              </div>

              <div className="statsrow">
                <div className="stat">
                  <b>{stats.wins}</b>
                  <span>Wins</span>
                </div>
                <div className="stat">
                  <b>{stats.streak}</b>
                  <span>Streak</span>
                </div>
                <div className="stat">
                  <b>{stats.games}</b>
                  <span>Games</span>
                </div>
              </div>
            </aside>
          </main>
        )}

        <footer className="footer">
          <span>
            Board goes to models as <code>FEN + ASCII</code> — pure text, no vision.
          </span>
          <span>Skin: {theme.name}</span>
        </footer>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function Row({ n, w, b }: { n: number; w?: string; b?: string }) {
  return (
    <>
      <div className="n">{n}.</div>
      <div className="m">{w || ""}</div>
      <div className="m">{b || ""}</div>
    </>
  );
}

function PlayerStrip({
  cfg,
  color,
  clock,
  active,
}: {
  cfg: PlayerCfg;
  color: Color;
  clock: number;
  active: boolean;
}) {
  const low = isFinite(clock) && clock < 20000;
  return (
    <div className="player" data-active={active}>
      <div className="who">
        <div className="nm">
          <span className="kicon">
            <PieceSvg type="k" color={color === "white" ? "w" : "b"} />
          </span>
          {cfg.name}
          <span className={`badge ${cfg.kind === "human" ? "human" : ""}`}>{cfg.kind === "ai" ? "AI" : "Human"}</span>
        </div>
        <div className="mdl">{cfg.kind === "ai" ? `model: ${modelLabel(cfg.model || "")}` : "local player"}</div>
      </div>
      <div className="clock" data-low={low || undefined}>
        {isFinite(clock) ? fmtClock(clock) : "∞"}
      </div>
    </div>
  );
}
