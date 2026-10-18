import { useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import { rampSpeedAt, type RampPoint } from '../../engine/speed';
import { addRampPoint, moveRampPoint, removeRampPoint } from '../../state/videoSpeed';
import type { VClip } from '../../state/videoStore';
import { describePoint, rampKeyStep, speedText, speedToY, yToSpeed } from './speedUi';
import { tellSpeed as said } from './timelineActions';

/*
 * The speed ramp's curve editor (207 §8, AC-11, AC-12): the clip along the bottom, its speed up the side on a log scale
 * (10× at the top, 1× in the middle, 0.1× at the bottom). Drag a point to move it; double-click the graph to add one;
 * every point can be reached with Tab, moved with the arrow keys (← / → along, ↑ / ↓ speed, Shift for larger steps)
 * and removed with Delete. Each change is announced. A ramp kept over a wider span than the clip (D-050) shows the part
 * inside the clip.
 */

const WIDTH = 240,
  HEIGHT = 120,
  PAD = 9; // room around the graph so the end points show whole

/** A ramp's span on the clip: where its shares 0 and 1 fall, as shares of the clip's in–out. */
interface SpanOnClip {
  from: number;
  width: number;
}

/**
 * Where a ramped clip's span lies on the clip (D-050): share 0 of the span at `from`, `width` clip-widths long.
 * @param clip the ramped clip
 * @returns its span in shares of the clip
 */
function spanOnClip(clip: VClip): SpanOnClip {
  const part = clip.out - clip.in;
  const [start, end] = clip.rampSpan ?? [clip.in, clip.out];
  return { from: (start - clip.in) / part, width: (end - start) / part };
}

/** The ramped clip. */
interface RampEditorProps {
  clip: VClip;
  points: readonly RampPoint[];
}

/**
 * The ramp's curve with its points (drag, double-click to add, keys, Delete) and a live region saying each change.
 * @param props the clip and its ramp's points
 */
export function RampEditor({ clip, points }: Readonly<RampEditorProps>) {
  const dragging = useRef<number | null>(null);
  const [heard, setHeard] = useState('');
  const span = spanOnClip(clip);
  const toX = (share: number) => (span.from + share * span.width) * WIDTH;
  const toShare = (x: number) => (x / WIDTH - span.from) / span.width;

  /**
   * The graph position under a pointer: the span share along, and the speed.
   * @param event the pointer event on the graph
   * @returns the share and the speed there
   */
  const under = (event: MouseEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * (WIDTH + 2 * PAD) - PAD;
    const y = ((event.clientY - box.top) / box.height) * (HEIGHT + 2 * PAD) - PAD;
    return { at: toShare(x), v: yToSpeed(y, HEIGHT), x, y };
  };
  /**
   * Announces a point after a change (read from the store's new state by the next render's points).
   * @param list the points after the change
   * @param index the point
   */
  const announce = (list: readonly RampPoint[], index: number) => {
    setHeard(describePoint(list, index));
  };

  const onDown = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    const { x, y } = under(event);
    const near = points.findIndex((point) => Math.hypot(toX(point.at) - x, speedToY(point.v, HEIGHT) - y) < 10);
    if (near < 0) return;
    dragging.current = near;
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onMove = (event: PointerEvent<SVGSVGElement>) => {
    const index = dragging.current;
    if (index === null) return;
    const { at, v } = under(event);
    if (said(moveRampPoint(clip.id, index, { at, v }))) announce(points, index);
  };
  const onUp = () => {
    dragging.current = null;
  };
  const onDoubleClick = (event: MouseEvent<SVGSVGElement>) => {
    const { at } = under(event);
    if (said(addRampPoint(clip.id, at))) setHeard(`Point added at ${Math.round(at * 100)} % along, ${speedText(rampSpeedAt(points, at))}`);
  };
  const onPointKey = (index: number) => (event: KeyboardEvent<SVGCircleElement>) => {
    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (said(removeRampPoint(clip.id, index))) setHeard(`Point ${index + 1} removed, ${points.length - 1} left`);
      event.preventDefault();
      return;
    }
    const target = rampKeyStep(points, index, event.key, event.shiftKey);
    if (!target) return;
    event.preventDefault();
    if (said(moveRampPoint(clip.id, index, target, `ramp:${clip.id}:${index}`)))
      announce(points.map((point, place) => (place === index ? target : point)), index);
  };

  // The curve across the clip, sampled in shares of the clip and looked up in shares of the span.
  const path = Array.from({ length: 97 }, (_, step) => {
    const x = (step / 96) * WIDTH;
    return `${step ? 'L' : 'M'}${x.toFixed(1)},${speedToY(rampSpeedAt(points, toShare(x)), HEIGHT).toFixed(1)}`;
  }).join('');
  return (
    <div className="ramp">
      <svg
        className="curve-graph ramp-graph"
        viewBox={`${-PAD} ${-PAD} ${WIDTH + 2 * PAD} ${HEIGHT + 2 * PAD}`}
        role="group"
        aria-label={`Speed ramp: ${points.length} points. Double-click to add a point; Tab to a point and use ← and → to move it along the clip, ↑ and ↓ to change its speed (Shift for larger steps), Delete to remove it.`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onDoubleClick={onDoubleClick}
      >
        <defs>
          <clipPath id={`ramp-clip-${clip.id}`}>
            <rect x={0} y={-PAD} width={WIDTH} height={HEIGHT + 2 * PAD} />
          </clipPath>
        </defs>
        <rect className="curve-area" x={0} y={0} width={WIDTH} height={HEIGHT} />
        {[2, 0.5].map((speed) => (
          <line key={speed} className="ramp-grid" x1={0} y1={speedToY(speed, HEIGHT)} x2={WIDTH} y2={speedToY(speed, HEIGHT)} />
        ))}
        <line className="ramp-one" x1={0} y1={speedToY(1, HEIGHT)} x2={WIDTH} y2={speedToY(1, HEIGHT)} />
        <g clipPath={`url(#ramp-clip-${clip.id})`}>
          <path d={path} fill="none" stroke="var(--text)" strokeWidth={2} />
          {points.map((point, index) => (
            <circle
              key={index}
              className="curve-pt"
              cx={toX(point.at)}
              cy={speedToY(point.v, HEIGHT)}
              r={6}
              tabIndex={0}
              role="button"
              aria-label={describePoint(points, index)}
              onKeyDown={onPointKey(index)}
            />
          ))}
        </g>
        <text className="ramp-axis" x={2} y={10}>
          10×
        </text>
        <text className="ramp-axis" x={2} y={speedToY(1, HEIGHT) - 3}>
          1×
        </text>
        <text className="ramp-axis" x={2} y={HEIGHT - 3}>
          0.1×
        </text>
      </svg>
      <p className="vh" aria-live="polite">
        {heard}
      </p>
    </div>
  );
}
