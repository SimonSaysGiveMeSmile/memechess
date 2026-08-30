// Models offered to players. Transparency is a core rule of MemeChess:
// the model each side uses is always shown to both players.
export interface ModelOption {
  id: string;
  label: string;
  note: string;
}

export const MODELS: ModelOption[] = [
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", note: "fast & cheap — great default" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", note: "balanced tactician" },
  { id: "claude-opus-4-8", label: "Claude Opus 4.8", note: "strongest, most deliberate" },
  { id: "claude-fable-5", label: "Claude Fable 5", note: "creative & unpredictable" },
];

export const DEFAULT_MODEL = MODELS[0].id;

export function modelLabel(id: string): string {
  return MODELS.find((m) => m.id === id)?.label ?? id;
}

export type Skill = "chill" | "sharp" | "ruthless";

export const SKILLS: { id: Skill; label: string; note: string }[] = [
  { id: "chill", label: "Chill", note: "casual, makes human mistakes" },
  { id: "sharp", label: "Sharp", note: "solid, punishes blunders" },
  { id: "ruthless", label: "Ruthless", note: "plays the best move it can find" },
];
