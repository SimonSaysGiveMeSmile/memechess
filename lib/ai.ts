// Client helper that asks the serverless route for the AI's move.
import type { Skill } from "./models";

export interface AiMoveRequest {
  fen: string;
  ascii: string;
  legalMoves: string[]; // SAN
  color: "white" | "black";
  moveNumber: number;
  model: string;
  skill: Skill;
  persona: string;
  timeoutMs: number;
  byoKey?: string; // player's own key, overrides server default
  byoBaseUrl?: string;
  /** "assist" switches the server to a deeper, deterministic analysis prompt */
  purpose?: "play" | "assist";
}

export interface AiMoveResponse {
  move: string; // SAN, guaranteed legal (falls back to a random legal move)
  quip: string;
  model: string;
  fallback: boolean; // true if the model failed and we picked for it
  error?: string;
}

export async function requestAiMove(req: AiMoveRequest): Promise<AiMoveResponse> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (req.byoKey) headers["x-user-key"] = req.byoKey;
  if (req.byoBaseUrl) headers["x-user-base-url"] = req.byoBaseUrl;

  const res = await fetch("/api/ai-move", {
    method: "POST",
    headers,
    body: JSON.stringify(req),
  });
  const data = (await res.json()) as AiMoveResponse;
  return data;
}
