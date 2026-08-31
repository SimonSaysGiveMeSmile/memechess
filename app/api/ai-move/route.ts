import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_MODEL } from "@/lib/models";

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

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const { fen, ascii, legalMoves, color, moveNumber, model, skill, persona } = body;
  if (!legalMoves?.length) {
    return NextResponse.json({ error: "no legal moves" }, { status: 400 });
  }

  const randomLegal = legalMoves[Math.floor(Math.random() * legalMoves.length)];
  const modelUsed = model || DEFAULT_MODEL; // track which model actually ran (may downgrade on 503)

  const baseUrl = (
    req.headers.get("x-user-base-url") ||
    process.env.ANTHROPIC_BASE_URL ||
    "https://api.anthropic.com"
  ).replace(/\/+$/, "");
  const apiKey = req.headers.get("x-user-key") || process.env.ANTHROPIC_AUTH_TOKEN || "";

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
    let resp = await callProvider(modelUsed, Math.min(body.timeoutMs ?? 20000, 28000));

    // requested model unavailable (dead channel etc.) → retry once on the
    // known-good default before ever degrading to a random move
    if (!resp.ok && modelUsed !== FALLBACK_MODEL) {
      const detail = await resp.text().catch(() => "");
      providerError = `${modelUsed} failed (${resp.status}: ${detail.slice(0, 140)}) — downgraded to ${FALLBACK_MODEL}`;
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
      error: err instanceof Error ? err.message : "unknown error",
    });
  }
}
