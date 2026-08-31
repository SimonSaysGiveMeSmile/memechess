// Models offered to players. Transparency is a core rule of MemeChess:
// the model each side uses is always shown to both players.
export interface ModelOption {
  id: string;
  label: string;
  note: string;
}

// Every id below is verified working against the configured provider
// (probed one-by-one 2026-08-31 against the provider's model square).
export const MODELS: ModelOption[] = [
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", note: "fastest & cheapest — great default" },
  { id: "claude-sonnet-4-5-20250929", label: "Claude Sonnet 4.5", note: "steady mid-tier" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", note: "balanced tactician" },
  { id: "claude-sonnet-5", label: "Claude Sonnet 5", note: "new-gen, quick & sharp" },
  { id: "claude-opus-4-5-20251101", label: "Claude Opus 4.5", note: "strong" },
  { id: "claude-opus-4-6", label: "Claude Opus 4.6", note: "strong & steady" },
  { id: "claude-opus-4-7", label: "Claude Opus 4.7", note: "strong (slower on this provider)" },
  { id: "claude-opus-4-8", label: "Claude Opus 4.8", note: "strongest 4.x" },
  { id: "claude-opus-5", label: "Claude Opus 5", note: "flagship — most deliberate" },
];

export const DEFAULT_MODEL = MODELS[0].id;

/** Coerce a stored/unknown model id to one that exists in the list. */
export function validModel(id: string | undefined | null, fallback = DEFAULT_MODEL): string {
  return MODELS.some((m) => m.id === id) ? (id as string) : fallback;
}

export function modelLabel(id: string): string {
  return MODELS.find((m) => m.id === id)?.label ?? id;
}

export type Skill = "chill" | "sharp" | "ruthless";

export const SKILLS: { id: Skill; label: string; note: string }[] = [
  { id: "chill", label: "Chill", note: "casual, makes human mistakes" },
  { id: "sharp", label: "Sharp", note: "solid, punishes blunders" },
  { id: "ruthless", label: "Ruthless", note: "plays the best move it can find" },
];
