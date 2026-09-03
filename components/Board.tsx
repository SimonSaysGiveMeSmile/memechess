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
  /** increments every new game — re-keys every piece so the entrance stagger replays */
  gameTick: number;
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
  gameTick,
  boom,
  onSquare,
}: BoardProps) {
  const rows = orientation === "white" ? board : [...board].reverse().map((r) => [...r].reverse());
  const rankLabels = orientation === "white" ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
  const fileLabels = orientation === "white" ? FILES : [...FILES].reverse();

  // displayed grid coords for an algebraic square, honoring orientation
  const displayed = (sq: string): { x: number; y: number } => {
    const f = FILES.indexOf(sq[0]);
    const rk = Number(sq[1]);
    return orientation === "white" ? { x: f, y: 8 - rk } : { x: 7 - f, y: rk - 1 };
  };

  // fresh position → pieces pop in with a wave that runs from the far side toward the player
  const entering = moveTick === 0;

  return (
    <div className="board-frame" data-flip={orientation === "black" || undefined}>
      <div className="ranks" aria-hidden>
        {rankLabels.map((r) => (
          <span key={r}>{r}</span>
        ))}
      </div>
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

            // slide-in: the piece that just landed animates from its origin square
            const isDest = !!cell && !!lastMove && lastMove.to === square;
            let pieceStyle: React.CSSProperties | undefined;
            if (isDest && lastMove) {
              const from = displayed(lastMove.from);
              const to = displayed(lastMove.to);
              pieceStyle = {
                ["--fx" as string]: `${(from.x - to.x) * 100}%`,
                ["--fy" as string]: `${(from.y - to.y) * 100}%`,
              };
            } else if (entering && cell) {
              // wave: top rows first, slight left→right ripple
              pieceStyle = { ["--d" as string]: `${r * 55 + c * 14}ms` };
            }

            const showBoom = boom && boom.square === square;
            const pieceKey = isDest ? `${square}-m${moveTick}` : `${square}-g${gameTick}`;

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
                {isTarget && (cell ? <span className="ring" /> : <span className="dot" />)}
                {cell && (
                  <span
                    key={pieceKey}
                    className={`piece ${cell.color}`}
                    data-slide={isDest || undefined}
                    data-enter={(entering && !isDest) || undefined}
                    style={pieceStyle}
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
      <div className="files" aria-hidden>
        {fileLabels.map((f) => (
          <span key={f}>{f}</span>
        ))}
      </div>
    </div>
  );
}
