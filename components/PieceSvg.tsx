// MemeChess piece set — a custom flat-Staunton silhouette set, generated as
// inline SVG (no external assets, nothing to 404). One set of clean geometric
// forms; each skin restyles it via CSS vars (fill, stroke, glow).
// ViewBox convention: 45×45, baseline ~38.5.

const BASE = "M11.5 33.5h22a2.5 2.5 0 0 1 0 5h-22a2.5 2.5 0 0 1 0-5z";

const BODIES: Record<string, string> = {
  p: `M22.5 9a5.8 5.8 0 0 1 3.6 10.3c3.9 2 6.4 6 6.4 10.7v4H12.5v-4c0-4.7 2.5-8.7 6.4-10.7A5.8 5.8 0 0 1 22.5 9z ${BASE}`,
  r: `M12 9h4.6v3.6h3.8V9h4.2v3.6h3.8V9H33v7.4l-2.4 2.4v11.4l2.4 2.6v1.2H12v-1.2l2.4-2.6V18.8L12 16.4V9z ${BASE}`,
  b: `M22.5 5.6a2.4 2.4 0 1 1 0 4.8 2.4 2.4 0 0 1 0-4.8z M22.5 11.6c4.7 3.3 7.4 7.5 7.4 11.7 0 4.5-2.9 8.3-6 10.7h-2.8c-3.1-2.4-6-6.2-6-10.7 0-4.2 2.7-8.4 7.4-11.7z ${BASE}`,
  n: `M15.5 34.5c.3-7.7 2.7-12.5 7.1-15.5-2 .6-4 .3-5.2-1-.9-1-1.1-2.4-.4-3.5 1.6-3 4.6-5.5 8.4-6.5l.7-2.9 2.1 2.4c6.3 1 11 6.4 11 13.2v13.8H15.5z ${BASE}`,
  q: `M7.5 11.8a1.9 1.9 0 1 1 0 3.8 1.9 1.9 0 0 1 0-3.8z M15 8.4a1.9 1.9 0 1 1 0 3.8 1.9 1.9 0 0 1 0-3.8z M22.5 7.2a1.9 1.9 0 1 1 0 3.8 1.9 1.9 0 0 1 0-3.8z M30 8.4a1.9 1.9 0 1 1 0 3.8 1.9 1.9 0 0 1 0-3.8z M37.5 11.8a1.9 1.9 0 1 1 0 3.8 1.9 1.9 0 0 1 0-3.8z M8.7 17.2l4 16.8h19.6l4-16.8-6.9 4.5-3.5-8.5-3.4 7.3-3.4-7.3-3.5 8.5z ${BASE}`,
  k: `M21.2 4h2.6v3.4H27V10h-3.2v3.4h-2.6V10H18V7.4h3.2V4z M22.5 14.6c5.7 0 10.2 4.2 10.2 9.8 0 3.6-1.8 6.9-4.5 9.6h-11.4c-2.7-2.7-4.5-6-4.5-9.6 0-5.6 4.5-9.8 10.2-9.8z ${BASE}`,
};

// small contrasting details drawn with the stroke color
const DETAILS: Record<string, string> = {
  b: "M22.5 16.5v7.5 M19 20.5h7",
  n: "M25.8 14.6a1 1 0 1 0 .1 0",
  k: "M17.5 24.5h10",
};

export type PieceType = "p" | "r" | "b" | "n" | "q" | "k";

export default function PieceSvg({
  type,
  color,
  className,
}: {
  type: PieceType | string;
  color: "w" | "b";
  className?: string;
}) {
  const d = BODIES[type] ?? BODIES.p;
  const detail = DETAILS[type];
  return (
    <svg
      viewBox="0 0 45 45"
      className={`pcs ${color} ${className ?? ""}`}
      aria-hidden
      focusable="false"
    >
      <path className="body" d={d} fillRule="evenodd" />
      {detail && <path className="detail" d={detail} fill="none" />}
    </svg>
  );
}
