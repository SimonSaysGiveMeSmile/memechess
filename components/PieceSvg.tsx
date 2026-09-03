// MemeChess piece set — a hand-drawn Staunton silhouette set, generated as
// inline SVG (no external assets, nothing to 404). One clean set of forms;
// each skin restyles it via CSS vars (fill, stroke, glow, sheen).
//
// Rendering: every piece is a stack of overlapping sub-shapes. They're painted
// twice — first a thick stroke pass (the outline), then a fill pass on top —
// so the union gets one continuous outline with no interior seams. A sheen
// gradient sits over the fill for a hint of volume; skins can dial it to 0.
// ViewBox convention: 45×45, baseline ≈ 39.5.

const BASE = "M9.5 35.3h26a2 2 0 0 1 2 2v0.4a2 2 0 0 1-2 2h-26a2 2 0 0 1-2-2v-0.4a2 2 0 0 1 2-2z";

const PARTS: Record<string, string[]> = {
  p: [
    "M22.5 8.2a4.7 4.7 0 1 1 0 9.4 4.7 4.7 0 0 1 0-9.4z",
    "M18.3 18.2h8.4l-1.1 3.3h-6.2z",
    "M19.6 20.9h5.8c.4 4.6 2.6 8.3 5.6 10.7H14c3-2.4 5.2-6.1 5.6-10.7z",
    "M12.5 31.2h20l1.6 4.6H10.9z",
    BASE,
  ],
  r: [
    "M12.5 8h4.6v3.6h3.5V8h3.8v3.6h3.5V8h4.6v7.5l-2.3 2.6h-15.4l-2.3-2.6z",
    "M15.3 17.6h14.4l1.1 14H14.2z",
    "M12.5 31h20l1.6 4.7H10.9z",
    BASE,
  ],
  b: [
    "M22.5 4.6a2.3 2.3 0 1 1 0 4.6 2.3 2.3 0 0 1 0-4.6z",
    "M22.5 8.9c5.1 3.6 7.6 8.2 7.6 12.7 0 3.6-2 6.3-4.1 8.3h-7c-2.1-2-4.1-4.7-4.1-8.3 0-4.5 2.5-9.1 7.6-12.7z",
    "M16.4 29.2h12.2l1.1 3.4H15.3z",
    "M17.6 32h9.8l1.5 3.9H16.1z",
    BASE,
  ],
  n: [
    "M32.6 33C33.4 24 31.4 14.6 26.3 10.9L27.6 5.6 24.7 9.2 21.7 5.2 20.4 9.6C16.2 11.2 12.4 15 9.6 19.8c-1.1 1.9-.4 3.1 1.6 3 1.9-.1 3.4-1.1 4.6-2.2 1.2 1.2.6 3.3-1 5-2.3 2.5-2.9 4.9-3 7.4z",
    "M12.5 31h20l1.6 4.7H10.9z",
    BASE,
  ],
  q: [
    "M7.6 11.6a1.9 1.9 0 1 1 0 3.8 1.9 1.9 0 0 1 0-3.8z",
    "M14.6 8.2a1.9 1.9 0 1 1 0 3.8 1.9 1.9 0 0 1 0-3.8z",
    "M22.5 6.6a1.9 1.9 0 1 1 0 3.8 1.9 1.9 0 0 1 0-3.8z",
    "M30.4 8.2a1.9 1.9 0 1 1 0 3.8 1.9 1.9 0 0 1 0-3.8z",
    "M37.4 11.6a1.9 1.9 0 1 1 0 3.8 1.9 1.9 0 0 1 0-3.8z",
    "M8.4 16.2l4.4 14.8h19.4l4.4-14.8-6.6 5.4-3.7-8.7-3.8 8.2-3.8-8.2-3.7 8.7z",
    "M12.5 30.4h20l1.6 5.3H10.9z",
    BASE,
  ],
  k: [
    "M21.2 3.2h2.6v3.1h3v2.5h-3v3.4h-2.6V8.8h-3V6.3h3z",
    "M22.5 9.4a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z",
    "M19.3 12.6h6.4c.4 3 1.6 5.2 3.5 7.1 3 3 4.5 5.6 4.5 8.5 0 1.3-.5 2.4-1.5 3.2H12.8c-1-.8-1.5-1.9-1.5-3.2 0-2.9 1.5-5.5 4.5-8.5 1.9-1.9 3.1-4.1 3.5-7.1z",
    "M13 30.6h19l1.6 5.1H11.4z",
    BASE,
  ],
};

// contrasting line-work drawn over the body in the stroke colour
const DETAILS: Record<string, string[]> = {
  p: [],
  r: ["M15.4 18h14.2", "M14.6 30.7h15.8"],
  b: ["M22.5 13.6v7.4", "M19.4 18.2h6.2", "M16.4 29.5h12.2"],
  n: ["M27.4 13.2c-1.4 2.6-1.8 5.8-1.3 9", "M11.8 21.4l1.2-.4", "M13.6 30.8h17.8"],
  q: ["M13 30.7h19"],
  k: ["M15.4 22.6c3.2 2.2 11 2.2 14.2 0", "M13.4 30.9h18.2"],
};

const DOTS: Record<string, [number, number, number][]> = {
  n: [[19.4, 12.6, 1.15]],
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
  const parts = PARTS[type] ?? PARTS.p;
  const details = DETAILS[type] ?? [];
  const dots = DOTS[type] ?? [];
  const sheenId = `pcs-sheen-${color}`;
  return (
    <svg
      viewBox="0 0 45 45"
      className={`pcs ${color} ${className ?? ""}`}
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient id={sheenId} x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity={color === "w" ? 0.55 : 0.22} />
          <stop offset="0.55" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g className="ol">
        {parts.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
      <g className="body">
        {parts.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
      <g className="sheen" fill={`url(#${sheenId})`}>
        {parts.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
      <g className="detail">
        {details.map((d, i) => (
          <path key={i} d={d} />
        ))}
        {dots.map(([cx, cy, r], i) => (
          <circle key={`d${i}`} cx={cx} cy={cy} r={r} />
        ))}
      </g>
    </svg>
  );
}
