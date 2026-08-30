import { NextRequest, NextResponse } from "next/server";

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
      model,
      fallback: true,
    });
  }

  const system = [
    `You are a chess engine playing the ${color} pieces in a game of standard chess.`,
    `Your on-screen persona: ${persona}. Stay fully in character in the "quip" field.`,
    SKILL_HINT[skill] ?? SKILL_HINT.sharp,
    `You will receive the board as ASCII, the FEN, and the exact list of legal moves in SAN.`,
    `You MUST choose exactly one move from the provided legal-move list — copy it verbatim.`,
    `Respond with ONLY a compact JSON object and nothing else:`,
    `{"move":"<one SAN move copied from the list>","quip":"<max 12 words, in persona>"}`,
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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(body.timeoutMs ?? 20000, 28000));

  try {
    const resp = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        authorization: `Bearer ${apiKey}`,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 400,
        temperature: skill === "ruthless" ? 0.2 : skill === "sharp" ? 0.5 : 0.8,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      return NextResponse.json({
        move: randomLegal,
        quip: "(model unreachable — random legal move)",
        model,
        fallback: true,
        error: `provider ${resp.status}: ${detail.slice(0, 200)}`,
      });
    }

    const data = await resp.json();
    const text: string =
      data?.content?.map((c: { text?: string }) => c?.text || "").join("") ?? "";

    let parsed: { move?: string; quip?: string } = {};
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        /* fall through to fallback */
      }
    }

    const legal = pickLegal(legalMoves, parsed.move);
    const chosen = legal ?? randomLegal;
    const quip = (parsed.quip || "").toString().slice(0, 120);

    return NextResponse.json({
      move: chosen,
      quip: quip || "…",
      model,
      fallback: legal === null,
    });
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return NextResponse.json({
      move: randomLegal,
      quip: aborted ? "(ran out of time — random legal move)" : "(error — random legal move)",
      model,
      fallback: true,
      error: err instanceof Error ? err.message : "unknown error",
    });
  } finally {
    clearTimeout(timeout);
  }
}
