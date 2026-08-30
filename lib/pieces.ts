// Unicode chess glyphs — render identically across every modern browser & phone,
// no image assets, no broken links. Meme identity comes from the skin (color/font/board),
// layered on top of these rock-solid glyphs.
import type { Piece } from "chess.js";

export const GLYPHS: Record<"w" | "b", Record<string, string>> = {
  w: { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" },
  b: { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" },
};

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
