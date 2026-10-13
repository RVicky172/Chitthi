// The video editor's Transitions (206 §6, AC-8, AC-10): the tool-rail panel that puts a transition on a cut, and the
// inspector for the selected one. The panel's previews are drawn with the same ops as the preview and the export
// (transitionOps), on two coloured cards.
import { useEffect, useRef } from 'react';
import { DIRECTIONS, TRANSITION_KINDS, TRANSITION_LIMITS, roomFor, transitionOps, type Direction, type TransitionKind } from '../../engine/transitions';
import { toast } from '../../lib/toast';
import { getVideo, removeTransition, selectTransition, setTransition, transitionEveryCut, useVideo, type VClip } from '../../state/video';
import { Seg } from '../common';
import { LpRange } from '../ig/LayerPanel';
import { TRANSITION_NAMES, panelCut } from './timelineRows';

const DIRECTION_NAMES: Record<Direction, string> = { left: 'Left', right: 'Right', up: 'Up', down: 'Down' };

/** Shows a refusal instead of dropping it. */
const tell = (refusal: string | null) => refusal && toast(refusal);

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Draws a kind at `progress` on a small canvas: an orange card turning into a blue one, with the kind's ops. */
function drawCard(context: CanvasRenderingContext2D, kind: TransitionKind, progress: number): void {
  const { width, height } = context.canvas;
  context.clearRect(0, 0, width, height);
  for (const [role, colour] of [
    ['from', '#f59e0b'],
    ['to', '#3b82f6'],
  ] as const) {
    const { op, colour: dip } = transitionOps({ kind, progress, role, dir: 'left', colour: 'black' }, width, height);
    context.save();
    context.globalAlpha = op.alpha;
    context.globalCompositeOperation = op.composite;
    if (op.clip) {
      context.beginPath();
      context.rect(op.clip.x, op.clip.y, op.clip.w, op.clip.h);
      context.clip();
    }
    context.translate(width / 2 + op.dx, height / 2 + op.dy);
    context.scale(op.scale, op.scale);
    context.fillStyle = colour;
    context.fillRect(-width / 2, -height / 2, width, height);
    context.restore();
    if (dip && dip.alpha > 0) {
      context.save();
      context.globalAlpha = dip.alpha;
      context.fillStyle = dip.css;
      context.fillRect(0, 0, width, height);
      context.restore();
    }
  }
}

/** A kind's small preview: looping over 1.6 s (0.4 s held at each end), a still halfway with reduced motion. */
function KindPreview({ kind }: { kind: TransitionKind }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (!context) return;
    if (reducedMotion()) {
      drawCard(context, kind, 0.5);
      return;
    }
    let frame = 0;
    const tick = (now: number) => {
      const phase = (now % 2400) / 2400;
      drawCard(context, kind, Math.min(1, Math.max(0, (phase - 0.17) / 0.66)));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [kind]);
  return <canvas ref={canvas} className="tr-preview" width={64} height={40} aria-hidden="true" />;
}

/**
 * The Transitions panel: the five kinds; choosing one puts it on the panel's cut (the selected cut, else the one at
 * the selected clip's end, or its start for the last clip); Apply to every cut puts the kind of that cut's transition
 * (a cross-dissolve if it has none) on every cut of its track.
 */
export function TransitionPanel() {
  // Read field by field (a selector returning a new object would change on every read).
  const clips = useVideo((s) => s.clips),
    tracks = useVideo((s) => s.tracks),
    selected = useVideo((s) => s.selected),
    transitionSel = useVideo((s) => s.transitionSel);
  const target = panelCut({ clips, tracks, selected, transitionSel });
  const current = 'clip' in target ? clips.find((c) => c.id === target.clip)?.transition : undefined;
  const choose = (kind: TransitionKind) => {
    if (!('clip' in target)) return;
    const refusal = setTransition(target.clip, { kind });
    if (refusal) toast(refusal);
    else selectTransition(target.clip);
  };
  return (
    <div className="ig-group tr-panel">
      <h3>Transitions</h3>
      {'why' in target ? (
        <p className="hint">{target.why}</p>
      ) : (
        <p className="hint">Choose one for the cut after {clipName(target.clip)}.</p>
      )}
      <div className="tr-kinds" role="group" aria-label="Transitions">
        {TRANSITION_KINDS.map((kind) => (
          <button key={kind} type="button" className="tr-kind" aria-pressed={current?.kind === kind} disabled={'why' in target} onClick={() => choose(kind)}>
            <KindPreview kind={kind} />
            <span>{TRANSITION_NAMES[kind]}</span>
          </button>
        ))}
      </div>
      {'clip' in target && (
        <button type="button" className="btn" onClick={() => tell(transitionEveryCut(target.track, current?.kind ?? 'dissolve'))}>
          Apply {TRANSITION_NAMES[current?.kind ?? 'dissolve'].toLowerCase()} to every cut
        </button>
      )}
    </div>
  );
}

/** A clip's name in the panel's sentence. */
function clipName(id: string): string {
  const clip = getVideo().clips.find((c) => c.id === id);
  return clip ? `“${clip.name}”` : 'this clip';
}

/**
 * The inspector for the selected cut's transition: its kind, direction (wipe, slide) or colour (dip), its length in
 * whole frames up to its room, and Remove transition. Each change is one undo step; a length drag is one step.
 */
export function TransitionInspector({ clip }: { clip: VClip }) {
  const transition = clip.transition;
  const fps = useVideo((s) => s.fps);
  const clips = useVideo((s) => s.clips);
  if (!transition) {
    return (
      <div className="lp">
        <div className="ig-group">
          <h3>Cut</h3>
          <p className="hint">A hard cut. Choose a transition for it from Transitions in the tool rail.</p>
        </div>
      </div>
    );
  }
  const next = clips.find((c) => c.id === transition.to);
  const room = next ? roomFor({ ...clip, transition: undefined }, next, clips.map((c) => (c.id === clip.id ? { ...c, transition: undefined } : c))) : transition.dur;
  const most = Math.max(TRANSITION_LIMITS.min, Math.floor(Math.min(TRANSITION_LIMITS.max, room) * fps + 1e-6) / fps);
  return (
    <div className="lp">
      <div className="ig-group">
        <h3>{TRANSITION_NAMES[transition.kind]}</h3>
        <div className="ig-slider">
          <label htmlFor="tr-kind">Kind</label>
          <select id="tr-kind" value={transition.kind} onChange={(e) => tell(setTransition(clip.id, { kind: e.target.value as TransitionKind }))}>
            {TRANSITION_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {TRANSITION_NAMES[kind]}
              </option>
            ))}
          </select>
        </div>
        {(transition.kind === 'wipe' || transition.kind === 'slide') && (
          <Seg<Direction>
            label="Direction"
            value={transition.dir ?? 'left'}
            options={DIRECTIONS.map((dir) => [dir, DIRECTION_NAMES[dir]])}
            onChange={(dir) => tell(setTransition(clip.id, { dir }))}
          />
        )}
        {transition.kind === 'dip' && (
          <Seg<'black' | 'white'>
            label="Colour"
            value={transition.colour ?? 'black'}
            options={[
              ['black', 'Black'],
              ['white', 'White'],
            ]}
            onChange={(colour) => tell(setTransition(clip.id, { colour }))}
          />
        )}
        <LpRange
          id="tr-length"
          label="Length"
          value={transition.dur}
          min={TRANSITION_LIMITS.min}
          max={most}
          step={1 / fps}
          show={`${transition.dur.toFixed(2)} s`}
          onChange={(dur) => tell(setTransition(clip.id, { dur }, `tr-length:${clip.id}`))}
        />
        <button
          type="button"
          className="btn"
          onClick={() => {
            tell(removeTransition(clip.id));
            selectTransition(null);
          }}
        >
          Remove transition
        </button>
      </div>
    </div>
  );
}
