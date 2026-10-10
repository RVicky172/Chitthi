import { describe, expect, it } from 'vitest';
import { roadPath, splitAt, type Point } from './geometry';

/** The numbers of an SVG path, as [command, ...coordinates] groups. */
function parse(d: string): [string, ...number[]][] {
  return [...d.matchAll(/([MC])([^MC]*)/g)].map((m) => [m[1], ...m[2].trim().split(/[\s,]+/).filter(Boolean).map(Number)]);
}
const zigzag = (n: number): Point[] => Array.from({ length: n }, (_, i) => ({ x: i % 2 ? 700 : 500, y: 100 + i * 170 }));

describe('roadPath', () => {
  it('no points: no path; one point: a move only', () => {
    expect(roadPath([])).toBe('');
    expect(roadPath([{ x: 5, y: 7 }])).toBe('M5,7');
  });

  it('two points: one curve from the first to the second', () => {
    const g = parse(roadPath([{ x: 0, y: 0 }, { x: 100, y: 200 }]));
    expect(g).toHaveLength(2);
    expect(g[0]).toEqual(['M', 0, 0]);
    expect(g[1][0]).toBe('C');
    expect(g[1].slice(5)).toEqual([100, 200]);
  });

  it('passes through every point, in order (26 stops)', () => {
    const pts = zigzag(26);
    const g = parse(roadPath(pts));
    expect(g).toHaveLength(26);
    const ends = g.map((c) => c.slice(-2));
    expect(ends).toEqual(pts.map((p) => [p.x, p.y]));
  });

  it('is smooth: at every inner point the incoming and outgoing handles are on one line through it', () => {
    const pts = zigzag(8);
    const g = parse(roadPath(pts));
    for (let i = 1; i < pts.length - 1; i++) {
      const [, , , c2x, c2y] = g[i] as [string, number, number, number, number, number, number];
      const [, c1x, c1y] = g[i + 1] as [string, number, number];
      const p = pts[i];
      const cross = (p.x - c2x) * (c1y - p.y) - (p.y - c2y) * (c1x - p.x);
      const scale = Math.hypot(p.x - c2x, p.y - c2y) * Math.hypot(c1x - p.x, c1y - p.y);
      expect(Math.abs(cross) / scale).toBeLessThan(0.02);
    }
  });
});

describe('splitAt', () => {
  const pts = zigzag(6);
  it('travelled ends and ahead starts at the current point, and together they are the whole road', () => {
    const { travelled, ahead } = splitAt(pts, 3);
    const t = parse(travelled),
      a = parse(ahead);
    expect(t.at(-1)!.slice(-2)).toEqual([pts[3].x, pts[3].y]);
    expect(a[0]).toEqual(['M', pts[3].x, pts[3].y]);
    const whole = parse(roadPath(pts));
    expect([...t, ...a.slice(1)]).toEqual(whole);
  });

  it('at the first point nothing is travelled; at the last nothing is ahead', () => {
    expect(splitAt(pts, 0)).toEqual({ travelled: `M${pts[0].x},${pts[0].y}`, ahead: roadPath(pts) });
    expect(splitAt(pts, 5)).toEqual({ travelled: roadPath(pts), ahead: `M${pts[5].x},${pts[5].y}` });
  });

  it('without a current point (all done) everything is travelled', () => {
    expect(splitAt(pts, -1)).toEqual({ travelled: roadPath(pts), ahead: '' });
  });
});
