// The video stage's paused picture (204 §3, AC-4), outside React so the self-test drives the stage's own path: which
// clip shows at a time, its picture from a PreviewSource, and the drawing. VideoStage uses exactly these.
import { useSyncExternalStore } from 'react';
import { DecodePool, frameTime, poolLimits, type FrameSourceFactory, type PoolClip } from '../../engine/decodePool';
import { frameStack } from '../../engine/stack';
import { MAIN_VIDEO, type Project, type TimedClip } from '../../engine/timeline';
import { limitsFor, renderStack, type FrameClip } from '../../engine/video';
import type { Layer } from '../../engine/layers';
import { logError } from '../../lib/errors';
import { isDesktop } from '../../platform/desktop';

export interface PreviewClip extends FrameClip, TimedClip {
  url: string;
  still?: HTMLCanvasElement | null;
}
export interface Picture {
  image: CanvasImageSource;
  w: number;
  h: number;
}
/** A clip the stage draws: the clip, seconds into it, and its picture (null until it has one). */
export interface StageItem<C extends FrameClip = FrameClip> {
  clip: C;
  local: number;
  pic: Picture | null;
}
/** What the stage draws (203 §5): the time on the frame grid and the clips showing then, bottom first. */
export interface StageFrame<C extends FrameClip = FrameClip> {
  at: number;
  items: StageItem<C>[];
}
/** Where a video clip's pictures come from: the frame showing at a source time (resolves when it can be drawn). */
export interface PreviewSource {
  frame(clip: PreviewClip, srcTime: number): Promise<Picture | null>;
  dispose(): void;
}

/** One <video> per clip, seeked to the asked time (the stage as it was before the pool). `onFrame` runs when a seek
 * lands or data arrives, so the stage can redraw. */
export function videoElementSource(
  onFrame: () => void = () => undefined,
): PreviewSource & { element(clip: PreviewClip): HTMLVideoElement } {
  const els = new Map<string, HTMLVideoElement>();
  const element = (c: PreviewClip) => {
    let v = els.get(c.id);
    if (!v) {
      v = document.createElement('video');
      v.preload = 'auto';
      v.playsInline = true;
      v.muted = true;
      v.src = c.url;
      v.addEventListener('seeked', onFrame);
      v.addEventListener('loadeddata', onFrame);
      els.set(c.id, v);
    }
    return v;
  };
  return {
    element,
    async frame(c, srcTime) {
      const v = element(c);
      if (v.readyState < 1) await new Promise((r) => v.addEventListener('loadedmetadata', r, { once: true }));
      if (Math.abs(v.currentTime - srcTime) > 0.02) {
        const landed = new Promise((r) => v.addEventListener('seeked', r, { once: true }));
        v.currentTime = srcTime;
        await landed;
      }
      if (v.readyState < 2) await new Promise((r) => v.addEventListener('loadeddata', r, { once: true }));
      return { image: v, w: v.videoWidth, h: v.videoHeight };
    },
    dispose() {
      for (const v of els.values()) {
        v.pause();
        v.removeAttribute('src');
        v.load();
      }
      els.clear();
    },
  };
}

export const poolClip = (c: PreviewClip & { file: Blob }): PoolClip => ({ id: c.id, file: c.file, in: c.in, out: c.out, start: c.start, track: c.track });

/**
 * Pictures from the decoder pool (204 §3): exact frames, latest wins (a superseded ask resolves to null). A clip the
 * pool can't decode (its fallback reason is set) is drawn from `fallback`, the <video> path, as it previews today
 * (Q6). The pool keeps the frame until a newer one replaces it, so the picture can be drawn as soon as it resolves.
 */
export function poolSource(pool: DecodePool, fallback: PreviewSource): PreviewSource {
  return {
    async frame(c, srcTime) {
      const clip = c as PreviewClip & { file: Blob };
      const why = pool.fallback(c.id);
      if (why) {
        noteFallback(clip.file, why);
        return fallback.frame(c, srcTime);
      }
      try {
        const f = await pool.frame(poolClip(clip), srcTime);
        return f ? { image: f.image, w: f.width, h: f.height } : null;
      } catch (e) {
        noteFallback(clip.file, pool.fallback(c.id) ?? (e instanceof Error ? e.message : String(e)));
        return fallback.frame(c, srcTime);
      }
    },
    dispose() {
      fallback.dispose();
    },
  };
}

/**
 * What the paused stage shows at playhead `t`: the frame the export encodes for it (D3: the time on the frame grid,
 * `frameTime`) and the clips showing then, bottom first (frameStack). The time the editor shows stays the playhead's.
 */
export function pausedAt<C extends PreviewClip>(
  project: Project<C>,
  t: number,
  fps: number,
): { at: number; items: { clip: C; local: number }[] } {
  const at = frameTime(t, fps);
  return { at, items: frameStack(project, at) };
}

/** A photo's still as a picture (null before it's made). */
export const stillOf = (c: PreviewClip): Picture | null => (c.still ? { image: c.still, w: c.still.width, h: c.still.height } : null);

/**
 * The paused stage's pictures at `t`: every clip of the stack with its frame (a photo's still, a video's frame from
 * `source`), all resolved together, so a frame is drawn whole. A video ask superseded by a newer one (latest wins per
 * lane) leaves its picture null.
 */
export async function pausedFrame<C extends PreviewClip>(
  project: Project<C>,
  t: number,
  fps: number,
  source: PreviewSource,
): Promise<StageFrame<C>> {
  const { at, items } = pausedAt(project, t, fps);
  const pics = await Promise.all(
    items.map(({ clip, local }) => (clip.kind === 'video' ? source.frame(clip, clip.in + local) : stillOf(clip))),
  );
  return { at, items: items.map((it, k) => ({ clip: it.clip, local: it.local, pic: pics[k] })) };
}

/**
 * The paused stage until its exact frame lands: each clip's picture from `now` where it needn't wait (a photo, a clip
 * the pool can't decode: `fromPool` false), else the picture `last` held for the same clip, else none. Kept per clip,
 * so an overlay arriving doesn't blank the main clip.
 */
export function withHeld<C extends PreviewClip>(
  at: number,
  items: { clip: C; local: number }[],
  last: StageFrame<C> | null,
  now: (it: { clip: C; local: number }) => Picture | null,
  fromPool: (c: C) => boolean,
): StageFrame<C> {
  return {
    at,
    items: items.map((it) => ({
      ...it,
      pic:
        it.clip.kind === 'photo' || !fromPool(it.clip)
          ? now(it)
          : (last?.items.find((h) => h.clip.id === it.clip.id)?.pic ?? null),
    })),
  };
}

/** Draws the stage: the stack's pictures with their edits, motion and boxes, the layers, the fades (renderStack, as
 * the export). No items (a hidden or empty main track at a gap): black with the layers, as the export draws it. */
export function drawPreview(
  x: CanvasRenderingContext2D,
  W: number,
  H: number,
  view: { layers: Layer[]; total: number; fadeOut: boolean },
  frame: StageFrame<PreviewClip>,
) {
  renderStack(
    x,
    W,
    H,
    frame.items.map(({ clip, local, pic }) => ({
      clip: { ...clip, overlay: clip.track !== MAIN_VIDEO },
      src: pic?.image ?? null,
      sw: pic?.w ?? 0,
      sh: pic?.h ?? 0,
      local,
    })),
    view.layers,
    frame.at,
    view.total,
    view.fadeOut,
  );
}

/** Mediabunny loads with the first clip the pool opens, not with the editor. */
const lazyMediabunny: FrameSourceFactory = async (file, opts) => (await import('../../engine/frameSource')).mediabunnySource(file, opts);

/**
 * The stage's picture source: the decoder pool where the browser has WebCodecs' VideoDecoder, with <video> elements for
 * clips it can't decode; <video> elements alone where it hasn't (Q7: Firefox before 130, Safari before 26). Clip
 * sound plays from previewSound.ts's <audio> elements (204 T034); these <video> elements stay muted.
 */
export function stageSource(onFrame: () => void = () => undefined) {
  const elements = videoElementSource(onFrame);
  // Room for the videos a frame may show at once (203 §5; decoders = that limit + 2).
  const limits = poolLimits(limitsFor('reel', isDesktop).videosAtOnce, isDesktop);
  const pool = typeof VideoDecoder === 'undefined' ? null : new DecodePool(lazyMediabunny, limits);
  const source: PreviewSource = pool ? poolSource(pool, elements) : elements;
  const stage = {
    source,
    pool,
    limits,
    element: elements.element,
    dispose() {
      liveStages.delete(stage);
      pool?.dispose();
      elements.dispose();
    },
  };
  liveStages.add(stage);
  return stage;
}

/** The stage sources alive now (the editor's), so self-tests can read their pool's stats (holds, decoders). */
export const liveStages = new Set<ReturnType<typeof stageSource>>();

/*
 * Files the pool couldn't decode (204 §7, Q6): such a clip previews from its <video>, but the export can't use it, so
 * the clip says so (timeline title and accessible name, inspector). Kept per file, so a split or a duplicate of the
 * clip says it at once; each file is logged once for reports.
 */
const cantDecode = new WeakMap<Blob, string>();
const noteListeners = new Set<() => void>();
let notesVersion = 0;

/** Records that the pool can't decode `file`, with the reason (which names the file). */
export function noteFallback(file: Blob, reason: string): void {
  if (cantDecode.get(file) === reason) return;
  cantDecode.set(file, reason);
  logError('handled', new Error(reason));
  notesVersion++;
  for (const l of noteListeners) l();
}

/** The note for a clip on `file`: "This clip can’t be exported here: <reason>", or null. */
export function fallbackNote(file: Blob): string | null {
  const why = cantDecode.get(file);
  return why ? `This clip can’t be exported here: ${why}` : null;
}

const subscribeNotes = (l: () => void) => {
  noteListeners.add(l);
  return () => void noteListeners.delete(l);
};

/** A clip's note, redrawn when the pool finds it can't decode the file. */
export function useFallbackNote(file: Blob): string | null {
  useSyncExternalStore(subscribeNotes, () => notesVersion);
  return fallbackNote(file);
}
