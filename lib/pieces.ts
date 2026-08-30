// Piece rendering per skin. Three styles:
//  - "glyph": classic Unicode chess glyphs (♔…♟) tinted by theme vars
//  - "text":  monospace letters (terminal skin — K Q R vs k q r)
//  - "emoji": full meme piece sets — each side is a faction in a meme war.
// Emoji pieces sit on a team-colored plate (CSS) so sides stay instantly legible.
import type { Piece } from "chess.js";

export type PieceStyle = "glyph" | "text" | "emoji";

type SideSet = Record<string, string>; // k q r b n p

export const GLYPHS: Record<"w" | "b", SideSet> = {
  w: { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" },
  b: { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" },
};

interface PieceSet {
  style: PieceStyle;
  w?: SideSet;
  b?: SideSet;
}

// Meme-war matchups per theme id. Anything unlisted falls back to glyphs.
export const PIECE_SETS: Record<string, PieceSet> = {
  classic: { style: "glyph" },
  terminal: {
    style: "text",
    w: { k: "K", q: "Q", r: "R", b: "B", n: "N", p: "P" },
    b: { k: "k", q: "q", r: "r", b: "b", n: "n", p: "p" },
  },
  skibidi: {
    // cameramen alliance vs the toilets
    style: "emoji",
    w: { k: "📺", q: "🔊", r: "📹", b: "💻", n: "📸", p: "📷" },
    b: { k: "🚽", q: "🪠", r: "🧻", b: "🪥", n: "🪰", p: "💩" },
  },
  "six-seven": {
    // six vs seven — the eternal question
    w: { k: "6️⃣", q: "🏀", r: "🎲", b: "🫳", n: "⛹️", p: "🤷" },
    b: { k: "7️⃣", q: "🎳", r: "🎰", b: "🫴", n: "🤾", p: "💁" },
    style: "emoji",
  },
  "huh-cat": {
    // house cats vs big cats
    style: "emoji",
    w: { k: "🐱", q: "😻", r: "😾", b: "🙀", n: "😼", p: "😽" },
    b: { k: "🦁", q: "🐯", r: "🐅", b: "🐆", n: "🐈‍⬛", p: "🐾" },
  },
  "italian-brainrot": {
    // Tralalero's crew vs Bombardiro's crew
    style: "emoji",
    w: { k: "🦈", q: "☕", r: "🥥", b: "🌵", n: "🐘", p: "🍌" },
    b: { k: "🐊", q: "🍝", r: "🍕", b: "🐒", n: "🦓", p: "🍅" },
  },
  doge: {
    // doge vs cate — the original war
    style: "emoji",
    w: { k: "🐕", q: "🦮", r: "🐶", b: "🐩", n: "🐺", p: "🦴" },
    b: { k: "🐈", q: "🐈‍⬛", r: "🧶", b: "🦁", n: "🐯", p: "🐟" },
  },
  gigachad: {
    // chads vs wojaks
    style: "emoji",
    w: { k: "🗿", q: "💪", r: "🏛️", b: "🧔", n: "🦍", p: "🏋️" },
    b: { k: "🤓", q: "😭", r: "📉", b: "🥲", n: "🐀", p: "😩" },
  },
  autobahn: {
    // race day vs the pit
    style: "emoji",
    w: { k: "🏆", q: "🏎️", r: "🚙", b: "🛞", n: "🏍️", p: "⛽" },
    b: { k: "🏁", q: "🚓", r: "🚚", b: "🔧", n: "🛵", p: "🛢️" },
  },
  vaporwave: {
    // sunset mall vs midnight grid
    style: "emoji",
    w: { k: "🌅", q: "🦩", r: "🏛️", b: "🗿", n: "🐬", p: "🌴" },
    b: { k: "🌃", q: "🌙", r: "🏙️", b: "📼", n: "🛸", p: "💾" },
  },
  stonks: {
    // bulls vs bears
    style: "emoji",
    w: { k: "📈", q: "💰", r: "🏦", b: "💼", n: "🐂", p: "🪙" },
    b: { k: "📉", q: "💸", r: "🏚️", b: "🧾", n: "🐻", p: "💳" },
  },
  labubu: {
    // cute-core vs menace-core
    style: "emoji",
    w: { k: "🧸", q: "🎀", r: "🍭", b: "🧁", n: "🦄", p: "🌸" },
    b: { k: "👹", q: "🕷️", r: "🍫", b: "🔪", n: "🦇", p: "🥀" },
  },
  nyan: {
    // rainbow side vs void side
    style: "emoji",
    w: { k: "🐱", q: "🌈", r: "🧁", b: "🍰", n: "🚀", p: "⭐" },
    b: { k: "🌚", q: "🌌", r: "🛸", b: "☄️", n: "👾", p: "🌑" },
  },
  royale: {
    // the crown vs the house
    style: "emoji",
    w: { k: "👑", q: "💎", r: "🏰", b: "🎩", n: "🐎", p: "🥂" },
    b: { k: "🃏", q: "🖤", r: "🗝️", b: "🕯️", n: "🐈‍⬛", p: "🎲" },
  },
};

export function pieceStyle(themeId: string): PieceStyle {
  return PIECE_SETS[themeId]?.style ?? "glyph";
}

export function charFor(themeId: string, color: "w" | "b", type: string): string {
  const set = PIECE_SETS[themeId];
  const side = set?.[color];
  return side?.[type] ?? GLYPHS[color][type];
}

export const PIECE_NAME: Record<string, string> = {
  k: "King",
  q: "Queen",
  r: "Rook",
  b: "Bishop",
  n: "Knight",
  p: "Pawn",
};

export function glyphFor(piece: Piece): string {
  return GLYPHS[piece.color][piece.type];
}
