// The video stage's paused picture (204 §3, AC-4), outside React so the self-test drives the stage's own path: which
// clip shows at a time, its picture from a PreviewSource, and the drawing. VideoStage uses exactly these.
import { DecodePool, frameTime, poolLimits, type FrameSourceFactory, type PoolClip } from '../../engine/decodePool';
import { videoAt, type Project, type TimedClip } from '../../engine/timeline';
import { NO_PICTURE, renderFrame, type FrameClip } from '../../engine/video';
import type { Layer } from '../../engine/layers';
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
/** What the stage draws: the time on the frame grid, the clip showing then (and its local time) and its picture. */
export interface StageFrame<C extends FrameClip = FrameClip> {
  at: number;
  shown: { clip: C; local: number } | null;
  pic: Picture | null;
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
      if (pool.fallback(c.id)) return fallback.frame(c, srcTime);
      try {
        const f = await pool.frame(poolClip(clip), srcTime);
        return f ? { image: f.image, w: f.width, h: f.height } : null;
      } catch {
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
 * `frameTime`), the clip showing then and its local time. The time the editor shows stays the playhead's.
 */
export function pausedAt<C extends PreviewClip>(
  project: Project<C>,
  t: number,
  fps: number,
): { at: number; shown: { clip: C; local: number } | null } {
  const at = frameTime(t, fps);
  return { at, shown: videoAt(project, at) };
}

/** The paused stage's picture at `t`: the clip that shows and its frame (a photo's still, a video's frame). */
export async function pausedFrame<C extends PreviewClip>(project: Project<C>, t: number, fps: number, source: PreviewSource) {
  const { at, shown } = pausedAt(project, t, fps);
  let pic: Picture | null = null;
  if (shown?.clip.kind === 'photo' && shown.clip.still)
    pic = { image: shown.clip.still, w: shown.clip.still.width, h: shown.clip.still.height };
  else if (shown?.clip.kind === 'video') pic = await source.frame(shown.clip, shown.clip.in + shown.local);
  return { at, shown, pic };
}

/** Draws the stage: the clip's picture with its edit and motion, the layers, the fades (renderFrame, as the export). */
export function drawPreview(
  x: CanvasRenderingContext2D,
  W: number,
  H: number,
  view: { layers: Layer[]; total: number; fadeOut: boolean },
  frame: StageFrame,
) {
  const { at, shown, pic } = frame;
  // No clip shows when the video track is hidden: black with the layers, as the export draws it.
  renderFrame(
    x,
    W,
    H,
    shown?.clip ?? NO_PICTURE,
    pic?.image ?? null,
    pic?.w ?? 0,
    pic?.h ?? 0,
    shown ? shown.local : at,
    view.layers,
    at,
    view.total,
    view.fadeOut,
  );
}

/** Mediabunny loads with the first clip the pool opens, not with the editor. */
const lazyMediabunny: FrameSourceFactory = async (file, opts) => (await import('../../engine/frameSource')).mediabunnySource(file, opts);

/**
 * The stage's picture source: the decoder pool where the browser has WebCodecs' VideoDecoder, with <video> elements for
 * clips it can't decode; <video> elements alone where it hasn't (Q7: Firefox before 130, Safari before 26). The
 * elements also play each clip's sound until 204 T034.
 */
export function stageSource(onFrame: () => void = () => undefined) {
  const elements = videoElementSource(onFrame);
  const pool = typeof VideoDecoder === 'undefined' ? null : new DecodePool(lazyMediabunny, poolLimits(1, isDesktop));
  const source: PreviewSource = pool ? poolSource(pool, elements) : elements;
  return {
    source,
    pool,
    element: elements.element,
    dispose() {
      pool?.dispose();
      elements.dispose();
    },
  };
}
