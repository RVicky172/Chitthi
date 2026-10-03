import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import {
  IDENTITY,
  isIdentity,
  MAX_POINTS,
  MIN_GAP,
  spline,
  type CurveChannel,
  type CurvePoint,
  type ToneCurve,
} from '../../engine/curve';
import { Seg } from '../common';

/*
 * The tone curve editor (P1.2): one curve per channel (RGB, red, green, blue) on a square graph, inputs along the
 * bottom, outputs up the side, both 0–255. Click the graph to add a point and drag it; drag points to move them; double-
 * click a point to remove it. Every point can also be reached with Tab, moved with the arrow keys (Shift for bigger
 * steps) and removed with Delete, so the curve works without a pointer.
 */

const CHANNELS: [CurveChannel, string][] = [
  ['rgb', 'RGB'],
  ['r', 'Red'],
  ['g', 'Green'],
  ['b', 'Blue'],
];
const STROKE: Record<CurveChannel, string> = { rgb: 'var(--text)', r: '#d6453d', g: '#3a9a4b', b: '#3d6fd6' };
const SIZE = 240,
  PAD = 9; // room around the graph so the end points show whole
const lv = (v: number) => Math.round(v * 255);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function CurveEditor({ curve, onChange }: { curve: ToneCurve; onChange: (c: ToneCurve) => void }) {
  const [ch, setCh] = useState<CurveChannel>('rgb');
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<number | null>(null);
  const pts = curve[ch];
  const f = spline(pts);
  const set = (next: CurvePoint[]) => onChange({ ...curve, [ch]: next });

  /** Moves point i to (x, y), keeping it between its neighbours. */
  const move = (list: readonly CurvePoint[], i: number, x: number, y: number): CurvePoint[] => {
    const lo = i > 0 ? list[i - 1][0] + MIN_GAP : 0,
      hi = i < list.length - 1 ? list[i + 1][0] - MIN_GAP : 1;
    return list.map((p, k) => (k === i ? ([Math.min(hi, Math.max(lo, clamp01(x))), clamp01(y)] as CurvePoint) : p));
  };
  const at = (e: PointerEvent): [number, number] => {
    const r = svg.current!.getBoundingClientRect(),
      full = SIZE + 2 * PAD;
    return [
      ((e.clientX - r.left) / r.width) * (full / SIZE) - PAD / SIZE,
      1 - (((e.clientY - r.top) / r.height) * (full / SIZE) - PAD / SIZE),
    ];
  };

  const down = (e: PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const [x, y] = at(e);
    const near = pts.findIndex(([px, py]) => Math.hypot((px - x) * SIZE, (py - y) * SIZE) < 10);
    if (near >= 0) drag.current = near;
    else if (pts.length < MAX_POINTS && pts.every(([px]) => Math.abs(px - x) >= MIN_GAP)) {
      // A new point on the curve where it was clicked, ready to drag.
      const next = [...pts, [clamp01(x), f(clamp01(x))] as CurvePoint].sort((a, b) => a[0] - b[0]);
      drag.current = next.findIndex(([px]) => px === clamp01(x));
      set(next);
    } else return;
    svg.current?.setPointerCapture(e.pointerId);
  };
  const moveTo = (e: PointerEvent<SVGSVGElement>) => {
    if (drag.current === null) return;
    const [x, y] = at(e);
    set(move(pts, drag.current, x, y));
  };
  const up = () => (drag.current = null);
  const remove = (i: number) => pts.length > 2 && set(pts.filter((_, k) => k !== i));

  const key = (i: number) => (e: KeyboardEvent<SVGCircleElement>) => {
    const step = (e.shiftKey ? 10 : 1) / 255,
      [x, y] = pts[i];
    const to: Record<string, [number, number]> = {
      ArrowUp: [x, y + step],
      ArrowDown: [x, y - step],
      ArrowRight: [x + step, y],
      ArrowLeft: [x - step, y],
    };
    if (to[e.key]) set(move(pts, i, ...to[e.key]));
    else if (e.key === 'Delete' || e.key === 'Backspace') remove(i);
    else return;
    e.preventDefault();
  };
  /** Adds a point in the middle of the widest gap, on the curve. */
  const addPoint = () => {
    let best = 0;
    for (let k = 1; k < pts.length - 1; k++) if (pts[k + 1][0] - pts[k][0] > pts[best + 1][0] - pts[best][0]) best = k;
    const x = (pts[best][0] + pts[best + 1][0]) / 2;
    set([...pts.slice(0, best + 1), [x, f(x)], ...pts.slice(best + 1)]);
  };

  const path = Array.from({ length: 65 }, (_, k) => {
    const x = k / 64;
    return `${k ? 'L' : 'M'}${(x * SIZE).toFixed(1)},${((1 - f(x)) * SIZE).toFixed(1)}`;
  }).join('');
  const label = CHANNELS.find(([c]) => c === ch)![1];
  return (
    <div className="curve">
      <Seg<CurveChannel> label="Curve channel" value={ch} options={CHANNELS.map(([v, l]) => [v, l])} onChange={setCh} />
      <svg
        ref={svg}
        className="curve-graph"
        viewBox={`${-PAD} ${-PAD} ${SIZE + 2 * PAD} ${SIZE + 2 * PAD}`}
        role="group"
        aria-label={`Tone curve, ${label}: ${pts.length} points. Click to add a point; Tab to a point and use the arrow keys to move it, Delete to remove it.`}
        onPointerDown={down}
        onPointerMove={moveTo}
        onPointerUp={up}
        onPointerCancel={up}
      >
        <rect className="curve-area" x={0} y={0} width={SIZE} height={SIZE} />
        {[0.25, 0.5, 0.75].map((g) => (
          <g key={g} className="curve-grid">
            <line x1={g * SIZE} y1={0} x2={g * SIZE} y2={SIZE} />
            <line x1={0} y1={g * SIZE} x2={SIZE} y2={g * SIZE} />
          </g>
        ))}
        <line className="curve-diag" x1={0} y1={SIZE} x2={SIZE} y2={0} />
        <path d={path} fill="none" stroke={STROKE[ch]} strokeWidth={2} />
        {pts.map(([x, y], i) => (
          <circle
            key={i}
            className="curve-pt"
            cx={x * SIZE}
            cy={(1 - y) * SIZE}
            r={6}
            tabIndex={0}
            role="button"
            aria-label={`Point ${i + 1} of ${pts.length}: input ${lv(x)}, output ${lv(y)}`}
            onKeyDown={key(i)}
            onDoubleClick={() => remove(i)}
          />
        ))}
      </svg>
      <div className="inline ig-tools">
        <button type="button" className="sbtn" disabled={pts.length >= MAX_POINTS} onClick={addPoint}>
          Add point
        </button>
        <button type="button" className="sbtn" disabled={isIdentity(pts)} onClick={() => set([...IDENTITY])}>
          Reset {label}
        </button>
      </div>
    </div>
  );
}
