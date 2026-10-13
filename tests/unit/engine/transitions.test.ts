import { describe, expect, it, vi } from 'vitest';
import { valueAt } from '@/engine/keyframes';
import { renderStack, type StackDraw } from '@/engine/video';
import { MAIN_VIDEO, type TimedClip } from '@/engine/timeline';
import { DIRECTIONS, TRANSITION_LIMITS, cutsOf, defaultTransition, halves, progressAt, roomFor, tidyTransitions, transitionOps, type DrawOp, type Transition } from '@/engine/transitions';

/** A video clip on a track: `len` seconds from `start`. */
const clip = (id: string, start: number, len: number, extra: Partial<TimedClip> = {}): TimedClip => ({
  id,
  track: MAIN_VIDEO,
  start,
  kind: 'video',
  dur: 0,
  in: 0,
  out: len,
  ...extra,
});
/** A transition of `dur` seconds into clip `to`. */
const into = (to: string, dur: number, kind: Transition['kind'] = 'dissolve'): Transition => ({ kind, dur, to });
/** The eased progress 205's Ease in and out gives at linear progress `p`. */
const easeInOut = (p: number) => valueAt([{ t: 0, v: 0, ease: 'ease-in-out' }, { t: 1, v: 1, ease: 'ease-in-out' }], p);

describe('defaults and limits (Q1, Q3)', () => {
  it('a new transition is 0.5 s; wipes and slides go left, dips go to black', () => {
    expect(TRANSITION_LIMITS).toEqual({ min: 0.1, max: 3, default: 0.5 });
    expect(defaultTransition('dissolve', 'b')).toEqual({ kind: 'dissolve', dur: 0.5, to: 'b' });
    expect(defaultTransition('wipe', 'b')).toEqual({ kind: 'wipe', dur: 0.5, to: 'b', dir: 'left' });
    expect(defaultTransition('slide', 'b')).toEqual({ kind: 'slide', dur: 0.5, to: 'b', dir: 'left' });
    expect(defaultTransition('dip', 'b')).toEqual({ kind: 'dip', dur: 0.5, to: 'b', colour: 'black' });
    expect(defaultTransition('zoom', 'b')).toEqual({ kind: 'zoom', dur: 0.5, to: 'b' });
  });
});

describe('cutsOf and halves', () => {
  const clips = [clip('a', 0, 2, { transition: into('b', 1) }), clip('b', 2, 3, { transition: into('c', 0.6) }), clip('c', 5, 2), clip('d', 8, 1)];

  it('lists each pair of touching clips on a track in time order (not across a gap)', () => {
    expect(cutsOf(clips, MAIN_VIDEO).map(([a, b]) => `${a.id}-${b.id}`)).toEqual(['a-b', 'b-c']);
    expect(cutsOf([clip('x', 0, 1), clip('y', 1 + 5e-7, 1)], MAIN_VIDEO)).toHaveLength(1);
    expect(cutsOf([clip('x', 0, 1), clip('y', 1, 1, { track: 'O1' })], MAIN_VIDEO)).toHaveLength(0);
  });

  it('a clip’s halves: the transition leading into it (before its start) and its own (after its end)', () => {
    expect(halves(clips[0], clips)).toEqual({ before: 0, after: 0.5 });
    expect(halves(clips[1], clips)).toEqual({ before: 0.5, after: 0.3 });
    expect(halves(clips[2], clips)).toEqual({ before: 0.3, after: 0 });
  });
});

describe('progressAt (Q2, Q12): centred on the cut, eased in and out', () => {
  const tr = into('b', 1);
  it('is null outside [cut − d/2, cut + d/2)', () => {
    expect(progressAt(tr, 4, 3.49)).toBeNull();
    expect(progressAt(tr, 4, 4.5)).toBeNull();
  });
  it('runs 0 → 1 with 205’s Ease in and out', () => {
    expect(progressAt(tr, 4, 3.5)).toBe(0);
    expect(progressAt(tr, 4, 4)).toBeCloseTo(0.5, 12);
    for (const p of [0.25, 0.75]) expect(progressAt(tr, 4, 3.5 + p)).toBeCloseTo(easeInOut(p), 12);
    expect(progressAt(tr, 4, 4.5 - 1e-9)).toBeCloseTo(1, 6);
  });
});

describe('roomFor (AC-3): what fits between two clips', () => {
  it('twice the shorter of what is left of each clip, at most 3 s', () => {
    const a = clip('a', 0, 2),
      b = clip('b', 2, 0.8);
    expect(roomFor(a, b, [a, b])).toBeCloseTo(1.6, 12);
    const long = [clip('a', 0, 10), clip('b', 10, 10)];
    expect(roomFor(long[0], long[1], long)).toBe(3);
  });
  it('leaves room for the clip’s other transition', () => {
    const clips = [clip('a', 0, 2, { transition: into('b', 1.2) }), clip('b', 2, 1), clip('c', 3, 4)];
    // b already gives 0.6 s to the transition from a: 0.4 s left on its side.
    expect(roomFor(clips[1], clips[2], clips)).toBeCloseTo(0.8, 12);
  });
});

describe('tidyTransitions (AC-4): the one rule', () => {
  it('keeps transitions between touching clips and returns the same array when nothing changes', () => {
    const clips = [clip('a', 0, 2, { transition: into('b', 0.5) }), clip('b', 2, 2)];
    const tidy = tidyTransitions(clips, 30);
    expect(tidy.clips).toBe(clips);
    expect(tidy.dropped).toEqual([]);
  });

  it('drops one whose clip doesn’t start where its own ends: a gap, another track, a missing clip', () => {
    for (const clips of [
      [clip('a', 0, 2, { transition: into('b', 0.5) }), clip('b', 2.5, 2)],
      [clip('a', 0, 2, { transition: into('b', 0.5) }), clip('b', 2, 2, { track: 'O1' })],
      [clip('a', 0, 2, { transition: into('gone', 0.5) }), clip('b', 2, 2)],
      // Not its neighbour any more (a reorder): c now follows a.
      [clip('a', 0, 2, { transition: into('b', 0.5) }), clip('c', 2, 1), clip('b', 3, 2)],
    ]) {
      const tidy = tidyTransitions(clips, 30);
      expect(tidy.clips[0].transition).toBeUndefined();
      expect(tidy.dropped).toEqual(['a']);
    }
  });

  it('shortens one that no longer fits, in time order, so each clip’s two halves fit in it', () => {
    const clips = [clip('a', 0, 2, { transition: into('b', 2) }), clip('b', 2, 1.2, { transition: into('c', 2) }), clip('c', 3.2, 4)];
    const tidy = tidyTransitions(clips, 30);
    // a → b: b is 1.2 s, so at most 2.4; a's 2 s fits. b → c: b has 1.2 − 1 = 0.2 s left, so 0.4 s.
    expect(tidy.clips[0].transition!.dur).toBeCloseTo(2, 9);
    expect(tidy.clips[1].transition!.dur).toBeCloseTo(0.4, 9);
    expect(tidy.dropped).toEqual([]);
  });

  it('puts lengths on whole frames (rounding down) at 30 and 60 fps, and caps them at 3 s', () => {
    const clips = (dur: number) => [clip('a', 0, 10, { transition: into('b', dur) }), clip('b', 10, 10)];
    expect(tidyTransitions(clips(0.51), 30).clips[0].transition!.dur).toBeCloseTo(15 / 30, 12);
    expect(tidyTransitions(clips(0.51), 60).clips[0].transition!.dur).toBeCloseTo(30 / 60, 12);
    expect(tidyTransitions(clips(5), 30).clips[0].transition!.dur).toBe(3);
  });

  it('drops one with less than 0.1 s of room', () => {
    // z → a takes 1 s of a's 1.04 s: 0.04 s left for a → b, so 0.08 s of room.
    const clips = [clip('z', 0, 2, { transition: into('a', 2) }), clip('a', 2, 1.04, { transition: into('b', 1) }), clip('b', 3.04, 2)];
    const tidy = tidyTransitions(clips, 30);
    expect(tidy.clips[0].transition!.dur).toBeCloseTo(2, 9);
    expect(tidy.clips[1].transition).toBeUndefined();
    expect(tidy.dropped).toEqual(['a']);
  });

  it('works on overlay tracks and on clips of any type, keeping their other fields', () => {
    const clips = [
      { ...clip('a', 1, 2, { track: 'O1' }), name: 'first', transition: into('b', 0.5) },
      { ...clip('b', 3, 2, { track: 'O1' }), name: 'second' },
    ];
    const tidy = tidyTransitions(clips, 30);
    expect(tidy.clips[0]).toEqual(clips[0]);
    expect(tidy.clips[0].name).toBe('first');
  });
});

/* ---------- 206 T030: how each clip of a transition is drawn (AC-1) ---------- */

describe('transitionOps (AC-1, D3)', () => {
  const W = 1080,
    H = 1920;
  /** The ops of the outgoing and incoming clip at progress p. */
  const ops = (kind: Transition['kind'], p: number, extra: Partial<Transition> = {}) => ({
    from: transitionOps({ kind, progress: p, role: 'from', ...extra }, W, H),
    to: transitionOps({ kind, progress: p, role: 'to', ...extra }, W, H),
  });
  const PROGRESS = [0, 0.25, 0.5, 0.75, 1];
  const ALL: [Transition['kind'], Partial<Transition>][] = [
    ['dissolve', {}],
    ['zoom', {}],
    ['dip', { colour: 'black' }],
    ['dip', { colour: 'white' }],
    ...DIRECTIONS.flatMap((dir) => [['wipe', { dir }] as [Transition['kind'], Partial<Transition>], ['slide', { dir }] as [Transition['kind'], Partial<Transition>]]),
  ];
  /** Whether an op draws its clip at all (visible, inside the frame). */
  const shows = (op: DrawOp) =>
    op.alpha > 0 &&
    (!op.clip || (op.clip.w > 0 && op.clip.h > 0)) &&
    Math.abs(op.dx) < W &&
    Math.abs(op.dy) < H;
  /** Exactly the clip as drawn alone: full alpha, in place, unscaled, unclipped (or clipped to the whole frame). */
  const alone = (op: DrawOp) =>
    op.alpha === 1 && op.dx === 0 && op.dy === 0 && op.scale === 1 && (!op.clip || (op.clip.x <= 0 && op.clip.y <= 0 && op.clip.w >= W && op.clip.h >= H));

  it.each(ALL)('%s %o: the outgoing clip alone at 0, the incoming alone at 1', (kind, extra) => {
    const start = ops(kind, 0, extra),
      end = ops(kind, 1, extra);
    expect(alone(start.from.op)).toBe(true);
    expect(shows(start.to.op)).toBe(false);
    expect(start.to.colour?.alpha ?? 0).toBe(0);
    expect(alone(end.to.op)).toBe(true);
    expect(shows(end.from.op)).toBe(false);
    expect(end.to.colour?.alpha ?? 0).toBe(0);
  });

  it('a cross-dissolve adds the two clips: the outgoing at 1 − p, the incoming at p', () => {
    for (const p of PROGRESS) {
      const { from, to } = ops('dissolve', p);
      expect(from.op).toEqual({ alpha: 1 - p, composite: 'lighter', dx: 0, dy: 0, scale: 1 });
      expect(to.op).toEqual({ alpha: p, composite: 'lighter', dx: 0, dy: 0, scale: 1 });
    }
    // At 0.5 an even mix.
    expect(ops('dissolve', 0.5).from.op.alpha + ops('dissolve', 0.5).to.op.alpha).toBe(1);
  });

  it('Zoom: a dissolve with the outgoing clip growing 1× → 1.3× about the centre (D3)', () => {
    for (const p of PROGRESS) {
      const { from, to } = ops('zoom', p);
      expect(from.op).toEqual({ alpha: 1 - p, composite: 'lighter', dx: 0, dy: 0, scale: 1 + 0.3 * p });
      expect(to.op).toEqual({ alpha: p, composite: 'lighter', dx: 0, dy: 0, scale: 1 });
    }
  });

  it('Dip: the outgoing clip to the middle, the incoming after, under the colour at 1 − |2p − 1|', () => {
    for (const colour of ['black', 'white'] as const)
      for (const p of PROGRESS) {
        const { from, to } = ops('dip', p, { colour });
        expect(from.op.alpha).toBe(p < 0.5 ? 1 : 0);
        expect(to.op.alpha).toBe(p < 0.5 ? 0 : 1);
        expect(from.colour).toBeUndefined();
        expect(to.colour).toEqual({ css: colour === 'black' ? '#000000' : '#ffffff', alpha: 1 - Math.abs(2 * p - 1) });
      }
  });

  it('Wipe: an edge moves the way of `dir`, the incoming clip in the part it has passed', () => {
    const p = 0.25;
    expect(ops('wipe', p, { dir: 'left' }).to.op.clip).toEqual({ x: W * 0.75, y: 0, w: W * 0.25, h: H });
    expect(ops('wipe', p, { dir: 'left' }).from.op.clip).toEqual({ x: 0, y: 0, w: W * 0.75, h: H });
    expect(ops('wipe', p, { dir: 'right' }).to.op.clip).toEqual({ x: 0, y: 0, w: W * 0.25, h: H });
    expect(ops('wipe', p, { dir: 'up' }).to.op.clip).toEqual({ x: 0, y: H * 0.75, w: W, h: H * 0.25 });
    expect(ops('wipe', p, { dir: 'down' }).to.op.clip).toEqual({ x: 0, y: 0, w: W, h: H * 0.25 });
    for (const dir of DIRECTIONS) {
      const { from, to } = ops('wipe', p, { dir });
      expect([from.op.alpha, to.op.alpha, from.op.composite, to.op.composite]).toEqual([1, 1, 'source-over', 'source-over']);
      // The two parts tile the frame.
      expect(from.op.clip!.w * from.op.clip!.h + to.op.clip!.w * to.op.clip!.h).toBeCloseTo(W * H, 6);
    }
  });

  it('Slide: the incoming clip pushes the outgoing one out the way of `dir`', () => {
    const p = 0.25;
    expect([ops('slide', p, { dir: 'left' }).from.op.dx, ops('slide', p, { dir: 'left' }).to.op.dx]).toEqual([-W * 0.25, W * 0.75]);
    expect([ops('slide', p, { dir: 'right' }).from.op.dx, ops('slide', p, { dir: 'right' }).to.op.dx]).toEqual([W * 0.25, -W * 0.75]);
    expect([ops('slide', p, { dir: 'up' }).from.op.dy, ops('slide', p, { dir: 'up' }).to.op.dy]).toEqual([-H * 0.25, H * 0.75]);
    expect([ops('slide', p, { dir: 'down' }).from.op.dy, ops('slide', p, { dir: 'down' }).to.op.dy]).toEqual([H * 0.25, -H * 0.75]);
    for (const dir of DIRECTIONS) {
      const { from, to } = ops('slide', p, { dir });
      expect([from.op.alpha, to.op.alpha, from.op.scale, to.op.scale, from.op.clip, to.op.clip]).toEqual([1, 1, 1, 1, undefined, undefined]);
    }
  });
});

/* ---------- 206 T031: renderStack draws a transition pair (the steps; pixels are 290’s golden frames) ---------- */

describe('renderStack with a transition pair (plan §3)', () => {
  /** A 2D context that records what is set and called on it (by canvas name), enough for renderStack’s pair path. */
  function recordingCanvas(name: string, logs: Map<string, string[]>) {
    const log: string[] = [];
    logs.set(name, log);
    const canvas = { name, width: 0, height: 0, getContext: () => context };
    const show = (value: unknown) => (value && typeof value === 'object' ? ((value as { name?: string }).name ?? 'object') : String(value));
    const context: CanvasRenderingContext2D = new Proxy({ canvas } as Record<string | symbol, unknown>, {
      get: (target, prop) => (prop in target ? target[prop] : (...args: unknown[]) => void log.push(`${String(prop)}(${args.map(show).join(',')})`)),
      set: (target, prop, value) => {
        log.push(`${String(prop)}=${show(value)}`);
        target[prop] = value;
        return true;
      },
    }) as unknown as CanvasRenderingContext2D;
    return { canvas, context };
  }

  const pairItems = (kind: Transition['kind'], progress: number, extra: Partial<Transition> = {}): StackDraw[] =>
    (['from', 'to'] as const).map((role, index) => ({
      clip: { id: `c${index}`, kind: 'photo', dur: 2, in: 0, out: 0, edit: {} as StackDraw['clip']['edit'], motion: 'none', fade: false, overlay: false },
      src: null,
      sw: 0,
      sh: 0,
      local: index ? -0.25 : 1.75,
      mix: { kind, progress, role, ...extra },
    }));

  function draw(items: StackDraw[]) {
    const logs = new Map<string, string[]>();
    let scratches = 0;
    vi.stubGlobal('document', { createElement: () => recordingCanvas(`scratch${++scratches}`, logs).canvas });
    try {
      const main = recordingCanvas('main', logs);
      renderStack(main.context, 100, 200, items, [], 1, 4, false);
      return logs;
    } finally {
      vi.unstubAllGlobals();
    }
  }
  /** The pair canvas’s log (the second scratch canvas made: slot 2 after the layer’s slot 1). */
  const pairLog = (logs: Map<string, string[]>) => [...logs.entries()].find(([name, log]) => name !== 'main' && log.some((line) => line.startsWith('drawImage(')))![1];

  it('a dissolve lays both clips onto the pair with `lighter` at 1 − p and p, then the pair onto the frame once', () => {
    const logs = draw(pairItems('dissolve', 0.25));
    const pair = pairLog(logs).filter((line) => /^(globalAlpha|globalCompositeOperation|drawImage)/.test(line));
    expect(pair).toEqual([
      'globalAlpha=0.75',
      'globalCompositeOperation=lighter',
      expect.stringMatching(/^drawImage\(scratch\d,0,0\)$/),
      'globalAlpha=0.25',
      'globalCompositeOperation=lighter',
      expect.stringMatching(/^drawImage\(scratch\d,0,0\)$/),
    ]);
    expect(logs.get('main')!.filter((line) => line.startsWith('drawImage('))).toHaveLength(1);
  });

  it('a dip draws only the visible clip and the colour over the clips’ own pixels (source-atop)', () => {
    const pair = pairLog(draw(pairItems('dip', 0.75, { colour: 'white' })));
    expect(pair.filter((line) => line.startsWith('drawImage('))).toHaveLength(1);
    const atop = pair.indexOf('globalCompositeOperation=source-atop');
    expect(atop).toBeGreaterThan(-1);
    expect(pair.slice(atop)).toEqual(expect.arrayContaining(['globalAlpha=0.5', 'fillStyle=#ffffff', 'fillRect(0,0,100,200)']));
  });

  it('a wipe clips each clip to its part of the frame; a slide moves it', () => {
    const wipe = pairLog(draw(pairItems('wipe', 0.25, { dir: 'left' })));
    expect(wipe).toEqual(expect.arrayContaining(['rect(0,0,75,200)', 'rect(75,0,25,200)']));
    const slide = pairLog(draw(pairItems('slide', 0.25, { dir: 'up' })));
    expect(slide).toEqual(expect.arrayContaining(['translate(50,50)', 'translate(50,250)']));
  });
});
