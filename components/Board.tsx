"use client";

import type { Color, PieceSymbol, Square } from "chess.js";
import { GLYPHS } from "@/lib/pieces";

type Cell = { square: Square; type: PieceSymbol; color: Color } | null;

interface BoardProps {
  board: Cell[][];
  orientation: "white" | "black";
  selected: Square | null;
  targets: Set<string>;
  lastMove: { from: string; to: string } | null;
  hint?: { from: string; to: string } | null;
  checkSquare: string | null;
  interactive: boolean;
  onSquare: (sq: Square) => void;
}

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

export default function Board({
  board,
  orientation,
  selected,
  targets,
  lastMove,
  hint,
  checkSquare,
  interactive,
  onSquare,
}: BoardProps) {
  // board()[0] is rank 8, file a..h. Flip both axes for black orientation.
  const rows = orientation === "white" ? board : [...board].reverse().map((r) => [...r].reverse());

  return (
    <div className="board" role="grid" aria-label="chess board">
      {rows.map((row, r) =>
        row.map((cell, c) => {
          // recover the true square name regardless of orientation
          const rank = orientation === "white" ? 8 - r : r + 1;
          const fileIdx = orientation === "white" ? c : 7 - c;
          const square = (FILES[fileIdx] + rank) as Square;
          const isLight = (fileIdx + rank) % 2 === 1;
          const isTarget = targets.has(square);
          const isSel = selected === square;
          const isLast = lastMove && (lastMove.from === square || lastMove.to === square);
          const isHint = hint && (hint.from === square || hint.to === square);
          const isCheck = checkSquare === square;
          const showFile = orientation === "white" ? r === 7 : r === 7;
          const showRank = orientation === "white" ? c === 0 : c === 0;

          return (
            <div
              key={square}
              role="gridcell"
              className={`sq ${isLight ? "lt" : "dk"} ${interactive ? "clickable" : ""}`}
              data-sel={isSel || undefined}
              data-last={isLast || undefined}
              data-hint={isHint || undefined}
              data-check={isCheck || undefined}
              onClick={interactive ? () => onSquare(square) : undefined}
            >
              {showRank && <span className="coord r">{rank}</span>}
              {showFile && <span className="coord f">{FILES[fileIdx]}</span>}
              {isTarget && (cell ? <span className="ring" /> : <span className="dot" />)}
              {cell && (
                <span className={`piece ${cell.color}`} aria-label={`${cell.color} ${cell.type}`}>
                  {GLYPHS[cell.color][cell.type]}
                </span>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
