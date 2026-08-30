"use client";

import type { Color, PieceSymbol, Square } from "chess.js";
import PieceSvg from "./PieceSvg";
import { PIECE_NAME } from "@/lib/pieces";

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
  /** increments every half-move — re-keys the destination piece so its slide replays */
  moveTick: number;
  /** transient capture burst at a square */
  boom?: { square: string; color: "w" | "b"; type: string; tick: number } | null;
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
  moveTick,
  boom,
  onSquare,
}: BoardProps) {
  const rows = orientation === "white" ? board : [...board].reverse().map((r) => [...r].reverse());

  // displayed grid coords for an algebraic square, honoring orientation
  const displayed = (sq: string): { x: number; y: number } => {
    const f = FILES.indexOf(sq[0]);
    const rk = Number(sq[1]);
    return orientation === "white" ? { x: f, y: 8 - rk } : { x: 7 - f, y: rk - 1 };
  };

  return (
    <div className="board" role="grid" aria-label="chess board">
      {rows.map((row, r) =>
        row.map((cell, c) => {
          const rank = orientation === "white" ? 8 - r : r + 1;
          const fileIdx = orientation === "white" ? c : 7 - c;
          const square = (FILES[fileIdx] + rank) as Square;
          const isLight = (fileIdx + rank) % 2 === 1;
          const isTarget = targets.has(square);
          const isSel = selected === square;
          const isLast = lastMove && (lastMove.from === square || lastMove.to === square);
          const isHint = hint && (hint.from === square || hint.to === square);
          const isCheck = checkSquare === square;
          const showFile = r === 7;
          const showRank = c === 0;

          // slide-in: the piece that just landed animates from its origin square
          const isDest = !!cell && !!lastMove && lastMove.to === square;
          let slideStyle: React.CSSProperties | undefined;
          if (isDest && lastMove) {
            const from = displayed(lastMove.from);
            const to = displayed(lastMove.to);
            slideStyle = {
              ["--fx" as string]: `${(from.x - to.x) * 100}%`,
              ["--fy" as string]: `${(from.y - to.y) * 100}%`,
            };
          }

          const showBoom = boom && boom.square === square;

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
                <span
                  key={isDest ? `${square}-${moveTick}` : square}
                  className={`piece ${cell.color}`}
                  data-slide={isDest || undefined}
                  style={slideStyle}
                  aria-label={`${cell.color === "w" ? "white" : "black"} ${PIECE_NAME[cell.type]}`}
                >
                  <PieceSvg type={cell.type} color={cell.color} />
                </span>
              )}
              {showBoom && (
                <span key={`boom-${boom.tick}`} className="boom" aria-hidden>
                  <PieceSvg type={boom.type} color={boom.color} />
                </span>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
