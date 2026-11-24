import { NextRequest, NextResponse } from "next/server";
import { Chess } from "chess.js";
import { DEFAULT_MODEL, validModel } from "@/lib/models";
import { THEMES } from "@/lib/themes";

export const runtime = "nodejs";
export const maxDuration = 30;

// The board state is fed to the model as pure text (ASCII + FEN + legal SAN moves).
// No vision pipeline — exactly the design goal. The model must return one legal move.

interface Body {
  fen: string;
  ascii: string;
  legalMoves: string[];
  color: "white" | "black";
  moveNumber: number;
  model: string;
  skill: "chill" | "sharp" | "ruthless";
  persona: string;
  timeoutMs?: number;
  purpose?: "play" | "assist";
}

const SKILL_HINT: Record<Body["skill"], string> = {
  chill:
    "Play casually at roughly a 1200-rated club level. Make natural, human moves and it's fine to miss subtle tactics — do NOT hang your queen for free though.",
  sharp:
    "Play solid, principled chess around 1800 level. Develop, control the center, punish loose moves, and avoid blunders.",
  ruthless:
    "Play the strongest move you can calculate. Look for tactics, threats, and forcing lines. Be relentless.",
};

function normalize(san: string): string {
  return san.replace(/[+#!?]/g, "").replace(/\s+/g, "").toLowerCase();
}

function pickLegal(legal: string[], candidate: string | undefined): string | null {
  if (!candidate) return null;
  const target = normalize(candidate);
  for (const m of legal) if (normalize(m) === target) return m;
  // tolerate the model dropping the piece letter or castling notation quirks
  for (const m of legal) if (normalize(m).includes(target) && target.length >= 2) return m;
  return null;
}

/** https only, no credentials, no localhost or IP-literal hosts. */
function safeBaseUrl(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim());
    const host = u.hostname.toLowerCase();
    if (u.protocol !== "https:" || u.username || u.password) return null;
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) return null;
    if (/^[\d.]+$/.test(host) || host.includes(":") || host.startsWith("[")) return null;
    return u.origin + u.pathname;
  } catch {
    return null;
  }
}

// Best-effort per-IP limit on server-key calls (per instance). Players with
// their own key are not limited.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
const hits = new Map<string, number[]>();
function rateLimited(req: NextRequest): boolean {
  const ip = req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > MAX_PER_WINDOW;
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  // Rebuild the position on the server: the prompt only ever contains a real
  // board, its legal moves and an allowlisted persona, so this route can't be
  // used as a general-purpose LLM proxy.
  let chess: Chess;
  try {
    if (typeof body.fen !== "string" || body.fen.length > 100) throw new Error("bad fen");
    chess = new Chess(body.fen);
  } catch {
    return NextResponse.json({ error: "bad position" }, { status: 400 });
  }
  const fen = chess.fen();
  const ascii = chess.ascii();
  const legalMoves = chess.moves();
  const color: Body["color"] = chess.turn() === "w" ? "white" : "black";
  const moveNumber = chess.moveNumber();
  const skill: Body["skill"] = body.skill in SKILL_HINT ? body.skill : "sharp";
  const persona = THEMES.some((t) => t.persona === body.persona) ? body.persona : THEMES[0].persona;
  if (!legalMoves.length) {
    return NextResponse.json({ error: "no legal moves" }, { status: 400 });
  }

  const randomLegal = legalMoves[Math.floor(Math.random() * legalMoves.length)];

  // A custom base URL is only honoured together with the player's own key.
  // The server's key always goes to the server's configured provider and
  // nowhere else.
  const userKey = req.headers.get("x-user-key")?.trim() || "";
  const userBaseUrl = userKey ? safeBaseUrl(req.headers.get("x-user-base-url")) : null;
  if (userKey && req.headers.get("x-user-base-url") && !userBaseUrl) {
    return NextResponse.json({ error: "base URL must be a public https URL" }, { status: 400 });
  }
  const usingServerKey = !userKey;
  if (usingServerKey && rateLimited(req)) {
    return NextResponse.json({ error: "too many requests" }, { status: 429 });
  }
  const baseUrl = (
    userBaseUrl ||
    process.env.ANTHROPIC_BASE_URL ||
    "https://api.anthropic.com"
  ).replace(/\/+$/, "");
  const apiKey = userKey || process.env.ANTHROPIC_AUTH_TOKEN || "";
  // Only listed models; each request is billed to whoever's key it uses.
  const modelUsed = validModel(body.model, DEFAULT_MODEL); // may downgrade on 503

  if (!apiKey) {
    // No key anywhere — degrade gracefully to a random-but-legal move so the game never stalls.
    return NextResponse.json({
      move: randomLegal,
      quip: "(no API key configured — playing a random legal move)",
      model: modelUsed,
      fallback: true,
    });
  }

  const isAssist = body.purpose === "assist";

  const system = isAssist
    ? [
        `You are a strong chess coach analyzing a position for the player of the ${color} pieces.`,
        `You will receive the board as ASCII, the FEN, and the exact list of legal moves in SAN.`,
        `Analyze methodically before answering:`,
        `1. List every forcing move available: checks, captures, and direct threats.`,
        `2. Check what the opponent threatens if ${color} does nothing — are any pieces hanging?`,
        `3. Pick the 3 strongest candidate moves and compare them concretely (what does the opponent reply?).`,
        `4. Choose the single best move. Never choose a move that hangs a piece for nothing.`,
        `Write your analysis briefly (a few lines), then on the FINAL line output ONLY this JSON:`,
        `{"move":"<one SAN move copied verbatim from the legal-move list>","quip":"<why it's best, max 12 words, plain text>"}`,
        `Never use emojis anywhere in the quip.`,
      ].join("\n")
    : [
        `You are a chess engine playing the ${color} pieces in a game of standard chess.`,
        `Your on-screen persona: ${persona}. Stay fully in character in the "quip" field.`,
        SKILL_HINT[skill] ?? SKILL_HINT.sharp,
        `You will receive the board as ASCII, the FEN, and the exact list of legal moves in SAN.`,
        `You MUST choose exactly one move from the provided legal-move list — copy it verbatim.`,
        `Respond with ONLY a compact JSON object and nothing else:`,
        `{"move":"<one SAN move copied from the list>","quip":"<max 12 words, in persona>"}`,
        `Never use emojis anywhere in the quip — plain text only.`,
      ].join("\n");

  const user = [
    `Move ${moveNumber}. You are ${color} to move.`,
    ``,
    `Board (uppercase = white, lowercase = black):`,
    ascii,
    ``,
    `FEN: ${fen}`,
    ``,
    `Legal moves (SAN): ${legalMoves.join(", ")}`,
    ``,
    `Pick your move now.`,
  ].join("\n");

  const FALLBACK_MODEL = "claude-haiku-4-5-20251001";
  let finalModel = modelUsed; // may be downgraded mid-request
  let providerError: string | undefined;

  const callProvider = async (mdl: string, timeoutMs: number): Promise<Response> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(`${baseUrl}/v1/messages`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          authorization: `Bearer ${apiKey}`,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: mdl,
          // assists get room to actually analyze; play moves stay snappy
          max_tokens: isAssist ? 1000 : 400,
          temperature: isAssist ? 0 : skill === "ruthless" ? 0.2 : skill === "sharp" ? 0.5 : 0.8,
          system,
          messages: [{ role: "user", content: user }],
        }),
      });
    } finally {
      clearTimeout(timeout);
    }
  };

  try {
    let resp = await callProvider(modelUsed, Math.min(Number(body.timeoutMs) || 20000, 28000));

    // requested model unavailable (dead channel etc.) → retry once on the
    // known-good default before ever degrading to a random move
    if (!resp.ok && modelUsed !== FALLBACK_MODEL) {
      const detail = await resp.text().catch(() => "");
      providerError = usingServerKey
        ? `${modelUsed} failed — downgraded to ${FALLBACK_MODEL}`
        : `${modelUsed} failed (${resp.status}: ${detail.slice(0, 140)}) — downgraded to ${FALLBACK_MODEL}`;
      finalModel = FALLBACK_MODEL;
      resp = await callProvider(FALLBACK_MODEL, 15000);
    }

    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      return NextResponse.json({
        move: randomLegal,
        quip: "(model unreachable — random legal move)",
        model: finalModel,
        fallback: true,
        error: providerError || `provider ${resp.status}`,
      });
    }

    const data = await resp.json();
    const text: string =
      data?.content?.map((c: { text?: string }) => c?.text || "").join("") ?? "";

    // assist mode emits analysis prose before the JSON — take the LAST json object
    let parsed: { move?: string; quip?: string } = {};
    const matches = text.match(/\{[^{}]*\}/g);
    if (matches) {
      for (let i = matches.length - 1; i >= 0; i--) {
        try {
          const candidate = JSON.parse(matches[i]);
          if (candidate && typeof candidate.move === "string") {
            parsed = candidate;
            break;
          }
        } catch {
          /* try earlier match */
        }
      }
    }

    const legal = pickLegal(legalMoves, parsed.move);
    const chosen = legal ?? randomLegal;
    const quip = (parsed.quip || "").toString().slice(0, 120);

    return NextResponse.json({
      move: chosen,
      quip: quip || "…",
      model: finalModel,
      fallback: legal === null,
      error: providerError,
    });
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return NextResponse.json({
      move: randomLegal,
      quip: aborted ? "(ran out of time — random legal move)" : "(error — random legal move)",
      model: finalModel,
      fallback: true,
      error: usingServerKey ? "provider error" : err instanceof Error ? err.message : "unknown error",
    });
  }
}
