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

const CHANNEL_NAMES: Record<CurveChannel, string> = { rgb: 'RGB', r: 'Red', g: 'Green', b: 'Blue' };
const CHANNEL_ORDER: CurveChannel[] = ['rgb', 'r', 'g', 'b'];
const CHANNELS: [CurveChannel, string][] = CHANNEL_ORDER.map((channel) => [channel, CHANNEL_NAMES[channel]]);
const STROKE: Record<CurveChannel, string> = { rgb: 'var(--text)', r: '#d6453d', g: '#3a9a4b', b: '#3d6fd6' };
const SIZE = 240,
  PAD = 9; // room around the graph so the end points show whole
const toLevel = (share: number) => Math.round(share * 255);
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/**
 * Moves one point to (x, y), keeping it between its neighbours.
 * @param list the curve's points, sorted by input
 * @param index the point to move
 * @param x the new input, 0–1
 * @param y the new output, 0–1
 * @returns the moved list
 */
function movePoint(list: readonly CurvePoint[], index: number, x: number, y: number): CurvePoint[] {
  const previous = index > 0 ? list.at(index - 1) : undefined,
    next = list.at(index + 1);
  const low = previous ? previous[0] + MIN_GAP : 0,
    high = next ? next[0] - MIN_GAP : 1;
  return list.map((point, pointIndex): CurvePoint =>
    pointIndex === index ? [Math.min(high, Math.max(low, clamp01(x))), clamp01(y)] : point,
  );
}

/**
 * Where a pointer is on the graph, in curve units (0–1 inside the square; the padding lies outside).
 * @param event the pointer event on the graph
 * @returns the input and output under the pointer
 */
function graphPosition(event: PointerEvent<SVGSVGElement>): [number, number] {
  const box = event.currentTarget.getBoundingClientRect(),
    full = SIZE + 2 * PAD;
  return [
    ((event.clientX - box.left) / box.width) * (full / SIZE) - PAD / SIZE,
    1 - (((event.clientY - box.top) / box.height) * (full / SIZE) - PAD / SIZE),
  ];
}

/**
 * The start of the widest gap between neighbouring points (the first one when gaps tie).
 * @param list the curve's points, sorted by input, at least two
 * @returns the index of the point before the gap
 */
function widestGap(list: readonly CurvePoint[]): number {
  const gapAfter = (index: number) => (list.at(index + 1)?.[0] ?? 1) - (list.at(index)?.[0] ?? 0);
  let best = 0;
  for (let index = 1; index < list.length - 1; index++) if (gapAfter(index) > gapAfter(best)) best = index;
  return best;
}

/** The tone curve and where changes go. */
interface CurveEditorProps {
  curve: ToneCurve;
  onChange: (curve: ToneCurve) => void;
}

/**
 * The tone curve editor: a channel switch, the graph with its points, and Add point / Reset.
 * @param props the curve and its change handler
 */
export function CurveEditor({ curve, onChange }: Readonly<CurveEditorProps>) {
  const [channel, setChannel] = useState<CurveChannel>('rgb');
  const dragging = useRef<number | null>(null);
  const points = curve[channel];
  const curveAt = spline(points);
  const setPoints = (next: CurvePoint[]) => onChange({ ...curve, [channel]: next });

  const onDown = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    const [x, y] = graphPosition(event);
    const near = points.findIndex(([pointX, pointY]) => Math.hypot((pointX - x) * SIZE, (pointY - y) * SIZE) < 10);
    if (near >= 0) dragging.current = near;
    else if (points.length < MAX_POINTS && points.every(([pointX]) => Math.abs(pointX - x) >= MIN_GAP)) {
      // A new point on the curve where it was clicked, ready to drag.
      const added: CurvePoint = [clamp01(x), curveAt(clamp01(x))];
      const next = [...points, added].sort((left, right) => left[0] - right[0]);
      dragging.current = next.findIndex(([pointX]) => pointX === clamp01(x));
      setPoints(next);
    } else return;
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onMove = (event: PointerEvent<SVGSVGElement>) => {
    if (dragging.current === null) return;
    const [x, y] = graphPosition(event);
    setPoints(movePoint(points, dragging.current, x, y));
  };
  const onUp = () => {
    dragging.current = null;
  };
  const remove = (index: number) => {
    if (points.length > 2) setPoints(points.filter((_, pointIndex) => pointIndex !== index));
  };

  const onPointKey =
    (index: number, [x, y]: CurvePoint) =>
    (event: KeyboardEvent<SVGCircleElement>) => {
      const step = (event.shiftKey ? 10 : 1) / 255;
      const moves: Partial<Record<string, [number, number]>> = {
        ArrowUp: [x, y + step],
        ArrowDown: [x, y - step],
        ArrowRight: [x + step, y],
        ArrowLeft: [x - step, y],
      };
      const target = moves[event.key];
      if (target) setPoints(movePoint(points, index, ...target));
      else if (event.key === 'Delete' || event.key === 'Backspace') remove(index);
      else return;
      event.preventDefault();
    };
  /** Adds a point in the middle of the widest gap, on the curve. */
  const addPoint = () => {
    const best = widestGap(points);
    const x = ((points.at(best)?.[0] ?? 0) + (points.at(best + 1)?.[0] ?? 1)) / 2;
    setPoints([...points.slice(0, best + 1), [x, curveAt(x)], ...points.slice(best + 1)]);
  };

  const path = Array.from({ length: 65 }, (_, step) => {
    const x = step / 64;
    return `${step ? 'L' : 'M'}${(x * SIZE).toFixed(1)},${((1 - curveAt(x)) * SIZE).toFixed(1)}`;
  }).join('');
  const label = CHANNEL_NAMES[channel];
  return (
    <div className="curve">
      <Seg<CurveChannel> label="Curve channel" value={channel} options={CHANNELS} onChange={setChannel} />
      <svg
        className="curve-graph"
        viewBox={`${-PAD} ${-PAD} ${SIZE + 2 * PAD} ${SIZE + 2 * PAD}`}
        role="group"
        aria-label={`Tone curve, ${label}: ${points.length} points. Click to add a point; Tab to a point and use the arrow keys to move it, Delete to remove it.`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <rect className="curve-area" x={0} y={0} width={SIZE} height={SIZE} />
        {[0.25, 0.5, 0.75].map((grid) => (
          <g key={grid} className="curve-grid">
            <line x1={grid * SIZE} y1={0} x2={grid * SIZE} y2={SIZE} />
            <line x1={0} y1={grid * SIZE} x2={SIZE} y2={grid * SIZE} />
          </g>
        ))}
        <line className="curve-diag" x1={0} y1={SIZE} x2={SIZE} y2={0} />
        <path d={path} fill="none" stroke={STROKE[channel]} strokeWidth={2} />
        {points.map((point, index) => (
          <circle
            key={index}
            className="curve-pt"
            cx={point[0] * SIZE}
            cy={(1 - point[1]) * SIZE}
            r={6}
            tabIndex={0}
            role="button"
            aria-label={`Point ${index + 1} of ${points.length}: input ${toLevel(point[0])}, output ${toLevel(point[1])}`}
            onKeyDown={onPointKey(index, point)}
            onDoubleClick={() => remove(index)}
          />
        ))}
      </svg>
      <div className="inline ig-tools">
        <button type="button" className="sbtn" disabled={points.length >= MAX_POINTS} onClick={addPoint}>
          Add point
        </button>
        <button type="button" className="sbtn" disabled={isIdentity(points)} onClick={() => setPoints([...IDENTITY])}>
          Reset {label}
        </button>
      </div>
    </div>
  );
}
