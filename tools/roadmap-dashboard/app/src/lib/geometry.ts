// The road's shape (405 §4): a smooth path through the stops' anchor points. Each stretch between two stops is a cubic
// Bézier with Catmull-Rom handles (the line through a stop keeps its direction, so the road bends without kinks: T001
// found vertical handles made S-bends with flat middles). Coordinates are rounded to 0.1 px.

export interface Point {
  x: number;
  y: number;
}

const n = (v: number) => String(Math.round(v * 10) / 10);
const at = (p: Point) => `${n(p.x)},${n(p.y)}`;

/** The curve from points[i] to points[i + 1] for every i, as "C…" commands. */
function stretches(points: Point[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i],
      p1 = points[i],
      p2 = points[i + 1],
      p3 = points[i + 2] ?? p2;
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    out.push(`C${at(c1)} ${at(c2)} ${at(p2)}`);
  }
  return out;
}

/** SVG path data through every point, in order. */
export function roadPath(points: Point[]): string {
  if (!points.length) return '';
  return [`M${at(points[0])}`, ...stretches(points)].join(' ');
}

/**
 * The road split at the current stop: travelled from the start to it, ahead from it to the end, with the same curves
 * as the whole road (so they meet without a seam). index -1 (no current stop: all done) puts the whole road travelled.
 */
export function splitAt(points: Point[], index: number): { travelled: string; ahead: string } {
  if (index < 0) return { travelled: roadPath(points), ahead: '' };
  const s = stretches(points);
  return {
    travelled: [`M${at(points[0])}`, ...s.slice(0, index)].join(' '),
    ahead: [`M${at(points[index])}`, ...s.slice(index)].join(' '),
  };
}
