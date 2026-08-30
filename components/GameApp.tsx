"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import Board from "./Board";
import { THEMES, getTheme, type Theme } from "@/lib/themes";
import { MODELS, SKILLS, DEFAULT_MODEL, modelLabel, type Skill } from "@/lib/models";
import { requestAiMove } from "@/lib/ai";
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
  { label: "Bullet 1+0", min: 1, inc: 0 },
  { label: "Blitz 3+2", min: 3, inc: 2 },
  { label: "Rapid 5+0", min: 5, inc: 0 },
  { label: "Rapid 10+0", min: 10, inc: 0 },
  { label: "No clock", min: 0, inc: 0 },
];

function fmtClock(ms: number): string {
  if (ms <= 0) return "0:00";
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m >= 1) return `${m}:${sec.toString().padStart(2, "0")}`;
  // under a minute: show tenths for tension
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

  // ── setup selections ──────────────────────────────────────────────────────
  const [screen, setScreen] = useState<"setup" | "game">("setup");
  const [themeId, setThemeId] = useState("classic");
  const [mode, setMode] = useState<Mode>("ai");
  const [humanColor, setHumanColor] = useState<Color>("white");
  const [aiModel, setAiModel] = useState(DEFAULT_MODEL);
  const [whiteModel, setWhiteModel] = useState("claude-opus-4-8");
  const [blackModel, setBlackModel] = useState("claude-sonnet-4-6");
  const [skill, setSkill] = useState<Skill>("sharp");
  const [tc, setTc] = useState<TimeCtrl>(TIME_CONTROLS[2]);
  const [byoKey, setByoKey] = useState("");
  const [byoBaseUrl, setByoBaseUrl] = useState("");
  const [sound, setSound] = useState(true);

  // ── live game state ───────────────────────────────────────────────────────
  const [players, setPlayers] = useState<{ w: PlayerCfg; b: PlayerCfg } | null>(null);
  const [orientation, setOrientation] = useState<Color>("white");
  const [selected, setSelected] = useState<Square | null>(null);
  const [targets, setTargets] = useState<Set<string>>(new Set());
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
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
  const tickRef = useRef<number>(0);

  // ── mount: load persisted identity + prefs ────────────────────────────────
  useEffect(() => {
    setMounted(true);
    setUid(getUserId());
    setName(getName());
    setStats(getStats());
    const p = getPrefs();
    setThemeId(p.themeId || "classic");
    setSound(p.sound);
    setByoKey(p.byoKey);
    setByoBaseUrl(p.byoBaseUrl);
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

  // ── clock tick ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (tc.min === 0) return; // unlimited — no ticking
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = now - last;
      last = now;
      if (runningRef.current && !overRef.current) {
        const side = chessRef.current.turn() === "w" ? "w" : "b";
        setClocks((c) => {
          const cur = c[side];
          if (!isFinite(cur)) return c;
          const next = Math.max(0, cur - dt);
          if (next <= 0) {
            queueMicrotask(() => flagFall(side));
          }
          return { ...c, [side]: next };
        });
      }
      tickRef.current = raf = requestAnimationFrame(loop);
    };
    tickRef.current = raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tc, screen]);

  const flagFall = useCallback(
    (side: "w" | "b") => {
      if (overRef.current) return;
      const winner: Color = side === "w" ? "black" : "white";
      finish(winner, "on time");
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // ── finish / result handling ──────────────────────────────────────────────
  const finish = useCallback(
    (result: Color | "draw", reason: string) => {
      if (overRef.current) return;
      setRunning(false);
      setOver({ result, reason });
      setQuip(null);
      // Record vs-AI results from the human's perspective only.
      const pl = playersRef.current;
      if (pl) {
        const humanSide = pl.w.kind === "human" && pl.b.kind === "human" ? null : pl.w.kind === "human" ? "white" : pl.b.kind === "human" ? "black" : null;
        if (humanSide) {
          const r = result === "draw" ? "draw" : result === humanSide ? "win" : "loss";
          setStats(recordResult(r));
          if (soundRef.current) (r === "win" ? sfx.win : r === "loss" ? sfx.lose : sfx.move)();
        } else if (soundRef.current) {
          sfx.win();
        }
      }
    },
    []
  );

  const playersRef = useRef(players);
  playersRef.current = players;
  const soundRef = useRef(sound);
  soundRef.current = sound;

  const checkGameOver = useCallback((): boolean => {
    const c = chessRef.current;
    if (!c.isGameOver()) return false;
    if (c.isCheckmate()) {
      // side to move is checkmated → the other side won
      const winner: Color = c.turn() === "w" ? "black" : "white";
      finish(winner, "by checkmate");
    } else if (c.isStalemate()) finish("draw", "by stalemate");
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

      // increment for the side that just moved
      const moved = result.color === "w" ? "w" : "b";
      if (tcRef.current.inc > 0 && tcRef.current.min > 0) {
        setClocks((cl) => (isFinite(cl[moved]) ? { ...cl, [moved]: cl[moved] + tcRef.current.inc * 1000 } : cl));
      }

      setLastMove({ from: result.from, to: result.to });
      setSelected(null);
      setTargets(new Set());
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

  const tcRef = useRef(tc);
  tcRef.current = tc;

  // ── AI driver ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (screen !== "game" || !players || over || !running) return;
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
        // small floor so a lightning-fast reply still feels deliberate
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
  }, [screen, players, over, running, derived.turn, force]);

  // dismiss toast after a while
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  // ── human interaction ─────────────────────────────────────────────────────
  const onSquare = useCallback(
    (sq: Square) => {
      if (!humanToMove) return;
      const c = chessRef.current;
      const piece = c.get(sq);
      const turnColor = c.turn();

      if (selected) {
        if (targets.has(sq)) {
          // promotion?
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [humanToMove, selected, targets, applyMove]
  );

  const selectSquare = useCallback((sq: Square) => {
    const c = chessRef.current;
    const moves = c.moves({ square: sq, verbose: true });
    setSelected(sq);
    setTargets(new Set(moves.map((m) => m.to)));
    if (soundRef.current) sfx.select();
  }, []);

  const choosePromotion = useCallback(
    (p: "q" | "r" | "b" | "n") => {
      if (!pending) return;
      applyMove({ from: pending.from, to: pending.to, promotion: p });
      setPending(null);
    },
    [pending, applyMove]
  );

  // ── start / reset ─────────────────────────────────────────────────────────
  const startGame = useCallback(() => {
    chessRef.current = new Chess();
    let p: { w: PlayerCfg; b: PlayerCfg };
    const aiName = `${theme.name} AI`;
    if (mode === "local") {
      p = { w: { kind: "human", name: name || "White" }, b: { kind: "human", name: "Black" } };
      setOrientation("white");
    } else if (mode === "ai") {
      const human: PlayerCfg = { kind: "human", name: name || "You" };
      const ai: PlayerCfg = { kind: "ai", name: aiName, model: aiModel };
      p = humanColor === "white" ? { w: human, b: ai } : { w: ai, b: human };
      setOrientation(humanColor);
    } else {
      p = {
        w: { kind: "ai", name: `${modelLabel(whiteModel)}`, model: whiteModel },
        b: { kind: "ai", name: `${modelLabel(blackModel)}`, model: blackModel },
      };
      setOrientation("white");
    }
    setPlayers(p);
    const startMs = tc.min === 0 ? Infinity : tc.min * 60000;
    setClocks({ w: startMs, b: startMs });
    setSelected(null);
    setTargets(new Set());
    setLastMove(null);
    setOver(null);
    setQuip(null);
    setPending(null);
    aiBusy.current = false;
    setScreen("game");
    setRunning(true);
    savePrefs({ themeId, sound, byoKey, byoBaseUrl });
    rerender();
  }, [mode, name, humanColor, aiModel, whiteModel, blackModel, tc, theme, themeId, sound, byoKey, byoBaseUrl, rerender]);

  const rematch = useCallback(() => {
    chessRef.current = new Chess();
    const startMs = tc.min === 0 ? Infinity : tc.min * 60000;
    setClocks({ w: startMs, b: startMs });
    setSelected(null);
    setTargets(new Set());
    setLastMove(null);
    setOver(null);
    setQuip(null);
    setPending(null);
    aiBusy.current = false;
    setRunning(true);
    rerender();
  }, [tc, rerender]);

  const resign = useCallback(() => {
    if (over || !players) return;
    // whoever the human is resigns; in watch mode this just ends the game
    const humanSide = players.w.kind === "human" ? "white" : players.b.kind === "human" ? "black" : null;
    if (humanSide) finish(humanSide === "white" ? "black" : "white", "by resignation");
    else finish("draw", "aborted");
  }, [over, players, finish]);

  const backToMenu = useCallback(() => {
    setRunning(false);
    setScreen("setup");
    setPlayers(null);
    setOver(null);
    setQuip(null);
    aiBusy.current = false;
  }, []);

  // persist theme immediately when browsing skins
  useEffect(() => {
    if (mounted) savePrefs({ themeId });
  }, [themeId, mounted]);

  const themeStyle = useMemo(() => {
    const s: Record<string, string> = { ...theme.vars };
    if (theme.bgFx) s["--bg-fx"] = theme.bgFx;
    return s as React.CSSProperties;
  }, [theme]);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="app" data-theme={theme.id} style={themeStyle}>
      <div className="wrap">
        <Topbar theme={theme} uid={uid} stats={stats} />
        {screen === "setup" ? (
          <Setup
            {...{
              theme,
              themeId,
              setThemeId,
              mode,
              setMode,
              humanColor,
              setHumanColor,
              aiModel,
              setAiModel,
              whiteModel,
              setWhiteModel,
              blackModel,
              setBlackModel,
              skill,
              setSkill,
              tc,
              setTc,
              name,
              setName: (v: string) => {
                setName(v);
                persistName(v);
              },
              sound,
              setSound: (v: boolean) => {
                setSound(v);
                savePrefs({ sound: v });
              },
              byoKey,
              setByoKey: (v: string) => {
                setByoKey(v);
                savePrefs({ byoKey: v });
              },
              byoBaseUrl,
              setByoBaseUrl: (v: string) => {
                setByoBaseUrl(v);
                savePrefs({ byoBaseUrl: v });
              },
              onStart: startGame,
            }}
          />
        ) : (
          players && (
            <Game
              {...{
                theme,
                players,
                orientation,
                board: derived.board,
                turn: derived.turn,
                checkSquare: derived.checkSquare,
                history: derived.history,
                selected,
                targets,
                lastMove,
                clocks,
                over,
                quip,
                pending,
                humanToMove,
                mode,
                running,
                stats,
                onSquare,
                onFlip: () => setOrientation((o) => (o === "white" ? "black" : "white")),
                onResign: resign,
                onRematch: rematch,
                onMenu: backToMenu,
                onPause: () => setRunning((r) => !r),
                choosePromotion,
              }}
            />
          )
        )}
        <Footer theme={theme} />
      </div>
      {toast && <div className="toast">⚠︎ {toast}</div>}
    </div>
  );
}

/* ── Topbar ─────────────────────────────────────────────────────────────── */
function Topbar({ theme, uid, stats }: { theme: Theme; uid: string; stats: Stats }) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="mark">{theme.tag}</span>
        <div>
          MemeChess
          <div className="byo">bring your own AI · model always disclosed</div>
        </div>
      </div>
      <div className="pill" title={`Your local player ID: ${uid}`}>
        <span>♜</span>
        <span>
          <b>{stats.wins}</b>W · <b>{stats.losses}</b>L · <b>{stats.draws}</b>D
        </span>
      </div>
    </header>
  );
}

/* ── Setup screen ───────────────────────────────────────────────────────── */
function Setup(props: {
  theme: Theme;
  themeId: string;
  setThemeId: (v: string) => void;
  mode: Mode;
  setMode: (v: Mode) => void;
  humanColor: Color;
  setHumanColor: (v: Color) => void;
  aiModel: string;
  setAiModel: (v: string) => void;
  whiteModel: string;
  setWhiteModel: (v: string) => void;
  blackModel: string;
  setBlackModel: (v: string) => void;
  skill: Skill;
  setSkill: (v: Skill) => void;
  tc: TimeCtrl;
  setTc: (v: TimeCtrl) => void;
  name: string;
  setName: (v: string) => void;
  sound: boolean;
  setSound: (v: boolean) => void;
  byoKey: string;
  setByoKey: (v: string) => void;
  byoBaseUrl: string;
  setByoBaseUrl: (v: string) => void;
  onStart: () => void;
}) {
  const p = props;
  return (
    <main className="setup">
      <div className="stack">
        <section className="card">
          <h2>New game</h2>
          <p className="sub">{p.theme.vocab.greet}</p>

          <div className="label">Mode</div>
          <div className="seg" style={{ marginBottom: 18 }}>
            {(["ai", "local", "watch"] as Mode[]).map((m) => (
              <button key={m} data-on={p.mode === m} onClick={() => p.setMode(m)}>
                {m === "ai" ? "You vs AI" : m === "local" ? "Local 2-player" : "AI vs AI"}
              </button>
            ))}
          </div>

          {p.mode === "ai" && (
            <>
              <div className="row" style={{ marginBottom: 16 }}>
                <div>
                  <div className="label">Play as</div>
                  <div className="seg">
                    {(["white", "black"] as Color[]).map((c) => (
                      <button key={c} data-on={p.humanColor === c} onClick={() => p.setHumanColor(c)}>
                        {c === "white" ? "♔ White" : "♚ Black"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <div className="label">Opponent model (disclosed)</div>
                <select className="field" value={p.aiModel} onChange={(e) => p.setAiModel(e.target.value)}>
                  {MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label} — {m.note}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {p.mode === "watch" && (
            <div className="row" style={{ marginBottom: 16 }}>
              <div>
                <div className="label">♔ White model</div>
                <select className="field" value={p.whiteModel} onChange={(e) => p.setWhiteModel(e.target.value)}>
                  {MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className="label">♚ Black model</div>
                <select className="field" value={p.blackModel} onChange={(e) => p.setBlackModel(e.target.value)}>
                  {MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {p.mode !== "local" && (
            <div style={{ marginBottom: 16 }}>
              <div className="label">AI difficulty</div>
              <div className="seg">
                {SKILLS.map((s) => (
                  <button key={s.id} data-on={p.skill === s.id} onClick={() => p.setSkill(s.id)} title={s.note}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <div className="label">Time control</div>
            <div className="seg">
              {TIME_CONTROLS.map((t) => (
                <button key={t.label} data-on={p.tc.label === t.label} onClick={() => p.setTc(t)}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="row" style={{ marginBottom: 18 }}>
            <div style={{ flex: 2 }}>
              <div className="label">Your name</div>
              <input
                className="field"
                value={p.name}
                placeholder="anon"
                maxLength={24}
                onChange={(e) => p.setName(e.target.value)}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div className="label">Sound</div>
              <div className="seg">
                <button data-on={p.sound} onClick={() => p.setSound(true)}>
                  On
                </button>
                <button data-on={!p.sound} onClick={() => p.setSound(false)}>
                  Off
                </button>
              </div>
            </div>
          </div>

          <details className="adv" style={{ marginBottom: 18 }}>
            <summary>Bring your own API key (optional)</summary>
            <div style={{ paddingTop: 10, display: "grid", gap: 10 }}>
              <p className="disclose">
                Leave blank to use the built-in provider. Your key is sent per-request to the game's serverless
                proxy and never stored on the server — only in this browser.
              </p>
              <input
                className="field"
                value={p.byoBaseUrl}
                placeholder="Base URL (e.g. https://api.anthropic.com)"
                onChange={(e) => p.setByoBaseUrl(e.target.value)}
              />
              <input
                className="field"
                type="password"
                value={p.byoKey}
                placeholder="sk-…"
                onChange={(e) => p.setByoKey(e.target.value)}
              />
            </div>
          </details>

          <button className="btn primary block" onClick={p.onStart}>
            Start game →
          </button>
        </section>
      </div>

      <div className="stack">
        <section className="card">
          <h2>Skins</h2>
          <p className="sub">{THEMES.length} to choose from — the board, the vibe, and the AI's trash talk all change.</p>
          <div className="themes">
            {THEMES.map((t) => (
              <button
                key={t.id}
                className="swatch"
                data-on={p.themeId === t.id}
                style={{ ["--sw-accent" as string]: t.vars["--accent"] }}
                onClick={() => p.setThemeId(t.id)}
                title={t.blurb}
              >
                <span className="mini">
                  {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                    <i
                      key={i}
                      style={{
                        background:
                          (Math.floor(i / 4) + (i % 4)) % 2 === 0 ? t.vars["--light"] : t.vars["--dark"],
                      }}
                    />
                  ))}
                </span>
                <span className="nm">
                  <span>{t.tag}</span> {t.name}
                </span>
                <span className="tg">{t.id === p.themeId ? "selected" : t.blurb.split(".")[0]}</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

/* ── Game screen ────────────────────────────────────────────────────────── */
function Game(props: {
  theme: Theme;
  players: { w: PlayerCfg; b: PlayerCfg };
  orientation: Color;
  board: ReturnType<Chess["board"]>;
  turn: Color;
  checkSquare: string | null;
  history: string[];
  selected: Square | null;
  targets: Set<string>;
  lastMove: { from: string; to: string } | null;
  clocks: { w: number; b: number };
  over: { result: Color | "draw"; reason: string } | null;
  quip: { from: string; text: string; thinking: boolean } | null;
  pending: { from: Square; to: Square } | null;
  humanToMove: boolean;
  mode: Mode;
  running: boolean;
  stats: Stats;
  onSquare: (sq: Square) => void;
  onFlip: () => void;
  onResign: () => void;
  onRematch: () => void;
  onMenu: () => void;
  onPause: () => void;
  choosePromotion: (p: "q" | "r" | "b" | "n") => void;
}) {
  const p = props;
  const topColor: Color = p.orientation === "white" ? "black" : "white";
  const botColor: Color = p.orientation;

  const resultText = (() => {
    if (!p.over) return "";
    if (p.over.result === "draw") return p.theme.vocab.draw;
    const humanSide = p.players.w.kind === "human" ? "white" : p.players.b.kind === "human" ? "black" : null;
    if (humanSide) return p.over.result === humanSide ? p.theme.vocab.win : p.theme.vocab.lose;
    return `${p.over.result === "white" ? "White" : "Black"} wins`;
  })();

  return (
    <main className="game">
      <div className="boardcol">
        <PlayerStrip cfg={p.players[topColor === "white" ? "w" : "b"]} color={topColor} clock={p.clocks[topColor === "white" ? "w" : "b"]} active={p.turn === topColor && !p.over} />
        <div className="board-shell">
          <Board
            board={p.board}
            orientation={p.orientation}
            selected={p.selected}
            targets={p.targets}
            lastMove={p.lastMove}
            checkSquare={p.checkSquare}
            interactive={p.humanToMove}
            onSquare={p.onSquare}
          />
          {p.over && (
            <div className="overlay">
              <div>
                <div style={{ fontSize: 40 }}>{p.theme.confetti[0]}</div>
                <h3>{resultText}</h3>
                <p>
                  {p.over.result === "draw" ? "Draw" : `${p.over.result === "white" ? "White" : "Black"} wins`} {p.over.reason}
                </p>
                <div className="controls" style={{ justifyContent: "center" }}>
                  <button className="btn primary" onClick={p.onRematch}>
                    Rematch
                  </button>
                  <button className="btn" onClick={p.onMenu}>
                    Menu
                  </button>
                </div>
              </div>
            </div>
          )}
          {p.pending && (
            <div className="overlay">
              <div>
                <h3 style={{ fontSize: 24 }}>Promote to…</h3>
                <div className="controls" style={{ justifyContent: "center", fontSize: 34 }}>
                  {(["q", "r", "b", "n"] as const).map((pc) => (
                    <button key={pc} className="btn" style={{ fontSize: 30, padding: "8px 16px" }} onClick={() => p.choosePromotion(pc)}>
                      {GLYPH_WHITE[pc]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
        <PlayerStrip cfg={p.players[botColor === "white" ? "w" : "b"]} color={botColor} clock={p.clocks[botColor === "white" ? "w" : "b"]} active={p.turn === botColor && !p.over} />
      </div>

      <aside className="side">
        <div className="quip">
          <div className="from">{p.quip ? p.quip.from : "MemeChess"}</div>
          <div className={`txt ${p.quip?.thinking ? "think" : ""}`}>
            {p.quip ? p.quip.text : p.humanToMove ? "Your move." : p.theme.vocab.greet}
          </div>
        </div>

        <div className="moves">
          <div className="hd">Moves · pure-text state → model</div>
          <div className="movelist">
            {p.history.length === 0 && <div className="empty">No moves yet.</div>}
            {Array.from({ length: Math.ceil(p.history.length / 2) }).map((_, i) => (
              <Row key={i} n={i + 1} w={p.history[i * 2]} b={p.history[i * 2 + 1]} />
            ))}
          </div>
        </div>

        <div className="statsrow">
          <div className="stat">
            <b>{p.stats.wins}</b>
            <span>Wins</span>
          </div>
          <div className="stat">
            <b>{p.stats.streak}</b>
            <span>Streak</span>
          </div>
          <div className="stat">
            <b>{p.stats.games}</b>
            <span>Games</span>
          </div>
        </div>

        <div className="controls">
          <button className="btn" onClick={p.onFlip}>
            ⟲ Flip
          </button>
          {p.mode === "watch" ? (
            <button className="btn" onClick={p.onPause}>
              {p.running ? "❚❚ Pause" : "▶ Resume"}
            </button>
          ) : (
            <button className="btn" onClick={p.onResign} disabled={!!p.over}>
              ⚑ Resign
            </button>
          )}
          <button className="btn" onClick={p.onMenu}>
            ☰ Menu
          </button>
        </div>
      </aside>
    </main>
  );
}

const GLYPH_WHITE: Record<string, string> = { q: "♕", r: "♖", b: "♗", n: "♘" };

function Row({ n, w, b }: { n: number; w?: string; b?: string }) {
  return (
    <>
      <div className="n">{n}.</div>
      <div className="m">{w || ""}</div>
      <div className="m">{b || ""}</div>
    </>
  );
}

function PlayerStrip({ cfg, color, clock, active }: { cfg: PlayerCfg; color: Color; clock: number; active: boolean }) {
  const low = isFinite(clock) && clock < 20000;
  return (
    <div className="player" data-active={active}>
      <div className="who">
        <div className="nm">
          <span>{color === "white" ? "♔" : "♚"}</span>
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

/* ── Footer ─────────────────────────────────────────────────────────────── */
function Footer({ theme }: { theme: Theme }) {
  return (
    <footer className="footer">
      <span>
        Board state is sent to models as <code>FEN + ASCII</code> — no vision, pure text.
      </span>
      <span>Skin: {theme.name} · scores saved to this browser</span>
    </footer>
  );
}
