import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import { lanePlan } from '../../engine/lanePlan';
import { layerAt, layersAt } from '../../engine/keyframes';
import { layerBox } from '../../engine/layerDraw';
import { isMissing } from '../../engine/mediaFile';
import { drawSelection } from '../../engine/layerPick';
import { frameSourceAt } from '../../engine/speed';
import { frameStack } from '../../engine/stack';
import { formatTime } from '../../engine/timeline';
import { halves } from '../../engine/transitions';
import { vFormat } from '../../engine/videoFormats';
import { logError } from '../../lib/errors';
import { toast } from '../../lib/toast';
import { setVLayers, updateLayerAt, removeVLayer } from '../../state/videoLayers';
import { endVStep, getVideo, projectOf, selectVLayer, setPlayhead, setPlaying, total as videoTotal, useVideo, videoLength, type VClip, type VState } from '../../state/videoStore';
import { masterGainDb } from '../../state/videoSound';
import { handleRadius, useFontsTick, useLayerPointer } from '../ig/useLayerPointer';
import { drawPreview, heldStageFrame, noteFallback, pausedAt, pausedFrame, photoPicture, poolClip, stageSource, type Picture, type StageFrame } from './previewFrame';
import { previewSound, soundPlan, type PreviewMix } from './previewSound';
import { chainGainAt } from '../../engine/mixGain';
import { audioPlan } from '../../engine/soundPlan';
import { soundDucks } from '../../state/videoExportJob';
import { useFit } from './Shell';
import { useClipTransform } from './useClipTransform';

/*
 * The video editor's stage: plays the timeline live on a canvas. Pictures come from the decoder pool (204), with
 * <video> elements for clips it can't decode; clip and sound clip sound from <audio> elements through one Web Audio
 * graph at the export's gains (previewSound.ts, 208). Paused, it draws at once with what is held, then the exact frame of the export's grid. Layers and the
 * selected overlay clip's box are edited on it directly.
 */

/** The stage's picture source (the decoder pool, with <video> fallbacks). */
type StageSource = ReturnType<typeof stageSource>;
/** Draws the stage: a given frame, or what is ready now. */
type DrawStage = (frame?: StageFrame<VClip>) => void;

/** The stage's sources, made on first use. */
interface StageSources {
  /** The picture source (made again after a cleanup). */
  stage: () => StageSource;
  /** A fallback clip's <video> element. */
  videoFor: (clip: VClip) => HTMLVideoElement;
  /** The clip sound player. */
  sound: () => ReturnType<typeof previewSound>;
  /** False once the stage has unmounted: the playback cleanup's last sync then makes nothing again. */
  mounted: RefObject<boolean>;
}

/**
 * The stage's picture and sound sources, made on first use and again after a cleanup: StrictMode runs effects twice in
 * development, and a source kept in useMemo would stay disposed (the stage drew nothing).
 * @param draw the stage's draw function (a new frame redraws)
 * @returns the sources
 */
function useStageSources(draw: RefObject<DrawStage>): StageSources {
  const stageRef = useRef<StageSource | null>(null);
  const stage = useCallback(() => (stageRef.current ??= stageSource(() => draw.current())), [draw]);
  useEffect(
    () => () => {
      stageRef.current?.dispose();
      stageRef.current = null;
    },
    [],
  );
  const videoFor = useCallback((clip: VClip) => stage().element(clip), [stage]);
  // Clip sound (204 §4, D1): <audio> elements for the clip under the playhead and the next ones; lazy like the stage.
  const soundRef = useRef<ReturnType<typeof previewSound> | null>(null);
  const mounted = useRef(false);
  const sound = useCallback(() => (soundRef.current ??= previewSound()), []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      soundRef.current?.dispose();
      soundRef.current = null;
    };
  }, []);
  // One object for the stage's lifetime: effects that depend on it must not restart on every render.
  return useMemo(() => ({ stage, videoFor, sound, mounted }), [stage, videoFor, sound]);
}

/**
 * The project as the preview's sound plays it: clips and sounds whose file is missing are silent (408 D4).
 * @param state the video's state
 * @returns the project without them
 */
const audibleProject = (state: VState): ReturnType<typeof projectOf> =>
  projectOf({ ...state, clips: state.clips.filter((clip) => !isMissing(clip.file)), sounds: state.sounds.filter((sound) => !isMissing(sound.file)) });

/**
 * Whether a clip's picture comes from the pool: not without one, nor for a clip it can't decode (noted on the clip),
 * nor for a missing file (408 D4: never opened).
 * @param stage the picture source
 * @param clip the clip
 * @returns true when the pool decodes it
 */
function usesPool(stage: StageSource, clip: VClip): boolean {
  if (isMissing(clip.file)) return false;
  const { pool } = stage;
  const why = pool?.fallback(clip.id);
  if (why) noteFallback(clip.file, why);
  return Boolean(pool && !why);
}

/**
 * A clip's picture without waiting (playback, and the paused stage until its exact frame lands).
 * @param sources the stage's sources
 * @param stackItem a clip showing now and the seconds into it
 * @returns a photo's still, the frame the pool has ready for a video, or a fallback clip's <video> once it has data;
 *   null when none is ready, or the file is missing (drawPreview draws its placeholder)
 */
function pictureNow(sources: StageSources, stackItem: { clip: VClip; local: number }): Picture | null {
  const { clip } = stackItem;
  if (isMissing(clip.file)) return null;
  if (clip.kind === 'photo') return photoPicture(clip);
  const stage = sources.stage();
  if (stage.pool && usesPool(stage, clip)) {
    const poolFrame = stage.pool.peek(poolClip(clip), frameSourceAt(clip, stackItem.local));
    return poolFrame ? { image: poolFrame.image, w: poolFrame.width, h: poolFrame.height } : null;
  }
  const videoElement = sources.videoFor(clip);
  return videoElement.readyState >= 2 ? { image: videoElement, w: videoElement.videoWidth, h: videoElement.videoHeight } : null;
}

/**
 * The frame to draw now: every visible clip's picture as the pool has it (playing), or, paused until the exact frame
 * lands, photos at once and each video's held picture while it's the same clip.
 * @param sources the stage's sources
 * @param last the frame drawn last
 * @returns the frame
 */
function frameNow(sources: StageSources, last: StageFrame<VClip> | null): StageFrame<VClip> {
  const state = getVideo();
  const nowPicture = (stackItem: { clip: VClip; local: number }) => pictureNow(sources, stackItem);
  if (state.playing) {
    const stack = frameStack(projectOf(state), state.t);
    return { at: state.t, items: stack.map((stackItem) => ({ ...stackItem, pic: nowPicture(stackItem) })) };
  }
  const { at, items: stack } = pausedAt(projectOf(state), state.t, state.fps);
  return heldStageFrame(at, stack, last, nowPicture, (clip: VClip) => usesPool(sources.stage(), clip));
}

/** What drawing the stage needs. */
interface StageDrawing {
  canvas: HTMLCanvasElement | null;
  /** The stage's size in CSS pixels. */
  width: number;
  height: number;
  sources: StageSources;
  /** The frame drawn last (paused: the exact one once it landed); held while the next one decodes. */
  last: RefObject<StageFrame<VClip> | null>;
  /** Draws the selected overlay clip's box. */
  drawBox: (context: CanvasRenderingContext2D, width: number, height: number) => void;
}

/**
 * Draws the stage: a frame (or what is ready now), the layers, and the selected layer's handles or the clip's box.
 * @param drawing the canvas, its size, the sources, the last frame and the box drawing
 * @param frame the frame to draw, if one landed
 */
function drawStage({ canvas, width, height, sources, last, drawBox }: StageDrawing, frame?: StageFrame<VClip>): void {
  const context = canvas?.getContext('2d');
  if (!canvas || !context || width <= 0) return;
  const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
  const pixelWidth = Math.round(width * pixelRatio);
  const pixelHeight = Math.round(height * pixelRatio);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  const state = getVideo();
  const frameToDraw = frame ?? frameNow(sources, last.current);
  if (!frameToDraw.items.length && !state.clips.length) return;
  last.current = frameToDraw;
  const view = { layers: state.layers, total: videoLength(state), fadeOut: state.fadeOut };
  try {
    drawPreview(context, pixelWidth, pixelHeight, view, frameToDraw);
  } catch {
    // A held frame the pool has since released (a clip removed): draw without pictures until the next frame.
    last.current = { ...frameToDraw, items: frameToDraw.items.map((stackItem) => ({ ...stackItem, pic: null })) };
    drawPreview(context, pixelWidth, pixelHeight, view, last.current);
  }
  const time = state.t;
  const selected = state.layerSel && state.layers.find((layer) => layer.id === state.layerSel && !layer.hidden && (layer.start ?? 0) <= time && time < (layer.end ?? Infinity));
  if (selected) drawSelection(context, layerBox(context, layerAt(selected, time), pixelWidth, pixelHeight), handleRadius(canvas));
  else drawBox(context, pixelWidth, pixelHeight);
}

/**
 * Keeps the media under the playhead in step: the clip sound (playing when playing, kept within a frame, the next
 * clip's pre-seeked) and the muted <video> of each clip the pool can't decode, for its picture: the one on screen at
 * the playhead, the rest paused. Fallback pictures follow what's on screen (frameStack: hidden tracks left out), not
 * the sound plan: a clip on a muted overlay track is still drawn (203 T034).
 * @param sources the stage's sources
 * @param isPlaying whether the video plays
 */
function syncMedia(sources: StageSources, isPlaying: boolean): void {
  if (!sources.mounted.current) return;
  const state = getVideo();
  sources.sound().update(soundPlan(audibleProject(state), state.t), isPlaying, state.fps, previewMix(state));
  const { pool } = sources.stage();
  const onScreen = frameStack(projectOf(state), state.t);
  for (const clip of state.clips) {
    if (clip.kind !== 'video' || isMissing(clip.file) || (pool && !pool.fallback(clip.id))) continue;
    const shown = onScreen.find((stackItem) => stackItem.clip.id === clip.id);
    syncFallbackVideo(sources.videoFor(clip), shown ? frameSourceAt(clip, shown.local) : null, isPlaying);
  }
}

/**
 * The tick's gains (208 AC-5, AC-9): each sound's from the export's chain at the playhead (its volume, keys, fades,
 * transitions, track volume and ducking) and the loudness gain, so the preview sounds as the export will.
 * @param state the video's state
 * @returns the gains
 */
function previewMix(state: VState): PreviewMix {
  const project = projectOf(state);
  const plan = new Map(audioPlan(project).map((source) => [source.ref, source]));
  const ducks = soundDucks(state);
  return {
    time: state.t,
    master: 10 ** (masterGainDb(state) / 20),
    limit: state.loudness !== 'off',
    gainOf: (ref) => {
      const source = plan.get(ref);
      return source ? chainGainAt(source, state.tracks, ducks, state.t) : null;
    },
  };
}

/**
 * Keeps a fallback clip's muted <video> on its picture: playing within 0.3 s while the video plays, paused on the
 * frame (within 0.02 s) while paused, and paused when the clip isn't on screen.
 * @param videoElement the clip's <video>
 * @param sourceTime the time in the source to show, or null when the clip isn't on screen
 * @param isPlaying whether the video plays
 */
function syncFallbackVideo(videoElement: HTMLVideoElement, sourceTime: number | null, isPlaying: boolean): void {
  videoElement.muted = true;
  if (sourceTime === null) {
    if (!videoElement.paused) videoElement.pause();
    return;
  }
  if (isPlaying) {
    if (Math.abs(videoElement.currentTime - sourceTime) > 0.3) videoElement.currentTime = sourceTime;
    if (videoElement.paused) void videoElement.play().catch(() => undefined);
    return;
  }
  videoElement.pause();
  if (Math.abs(videoElement.currentTime - sourceTime) > 0.02) videoElement.currentTime = sourceTime;
}

/**
 * Keeps open in the pool the clips showing at a time and the next to start within 2 s (Q10), primed from their
 * transition's first frame when one leads into them (206).
 * @param sources the stage's sources
 * @param time the playhead
 */
function lookAhead(sources: StageSources, time: number): void {
  const stage = sources.stage();
  const { pool } = stage;
  if (!pool) return;
  const plan = lanePlan(projectOf(getVideo()), time, 2);
  pool.want([...plan.visible, ...plan.next].map((clip) => clip.id));
  for (const clip of plan.next) if (usesPool(stage, clip)) pool.prepare(poolClip(clip, halves(clip, getVideo().clips).before));
}

/**
 * Playback: advances the playhead with the wall clock (from the start when at the end), keeps the clip media and the
 * music in step, and redraws each frame; stops at the end.
 * @param playing whether the video plays
 * @param sources the stage's sources
 * @param draw the stage's draw function
 */
function usePlayback(playing: boolean, sources: StageSources, draw: RefObject<DrawStage>): void {
  useEffect(() => {
    if (!playing) return;
    const startState = getVideo();
    const startTime = startState.t >= videoLength(startState) - 0.05 ? 0 : startState.t;
    const startWall = performance.now();
    setPlayhead(startTime);
    // Play is a user gesture: the browser lets the sound's AudioContext start now (208 D3).
    void sources.sound().resume();
    let animationFrame = 0;
    const loop = () => {
      const now = startTime + (performance.now() - startWall) / 1000;
      const end = videoTotal();
      if (now >= end) {
        setPlayhead(end);
        setPlaying(false);
        return;
      }
      setPlayhead(now);
      syncMedia(sources, true);
      lookAhead(sources, now);
      draw.current();
      animationFrame = requestAnimationFrame(loop);
    };
    animationFrame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(animationFrame);
      syncMedia(sources, false);
    };
  }, [playing, sources, draw]);
}

/**
 * The stage's layer editing: it edits the layers as shown at the playhead (205 §8), so hit tests and handles match
 * what is drawn; changes go through the router, so dragging an animated layer sets a keyframe there. A refusal is
 * shown once per drag; presses that miss every layer go to the selected clip's box.
 * @param canvas the stage's canvas
 * @param onBackground the clip box's press handler
 * @returns the canvas's pointer and key handlers
 */
function useStageLayers(canvas: RefObject<HTMLCanvasElement | null>, onBackground: Parameters<typeof useLayerPointer>[0]['onBackground']) {
  const layers = useVideo((state) => state.layers);
  const layerSel = useVideo((state) => state.layerSel);
  const tools = useVideo((state) => state.tools);
  const time = useVideo((state) => state.t);
  const lastRefusal = useRef<string | null>(null);
  const tellOnce = (refusal: string | null) => {
    if (refusal && refusal !== lastRefusal.current) toast(refusal);
    lastRefusal.current = refusal;
  };
  return useLayerPointer({
    canvas,
    layers: layersAt(layers, time),
    selected: layerSel,
    tools,
    t: time,
    onSelect: selectVLayer,
    onUpdate: (id, layer, key) => tellOnce(updateLayerAt(id, layer, key)),
    // A stroke changes only the drawing `sel`: the other layers are stored as they are, not as shown at the playhead.
    onSetLayers: (shown, key, drawingId) => {
      const stored = getVideo().layers;
      const drawing = shown.find((layer) => layer.id === drawingId);
      if (drawing && shown.length === stored.length && stored.some((layer) => layer.id === drawingId && layer.keys)) tellOnce(updateLayerAt(drawingId, drawing, key));
      else setVLayers(shown.map((layer) => (layer.id === drawingId ? layer : (stored.find((storedLayer) => storedLayer.id === layer.id) ?? layer))), key, drawingId);
    },
    onRemove: removeVLayer,
    onEndStep: () => {
      lastRefusal.current = null;
      endVStep();
    },
    onBackground,
  });
}

/** The video editor's stage (see the file's comment). */
export function VideoStage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const clips = useVideo((state) => state.clips);
  const layers = useVideo((state) => state.layers);
  const layerSel = useVideo((state) => state.layerSel);
  const selectedClip = useVideo((state) => state.selected);
  const snapping = useVideo((state) => state.snapping);
  const tools = useVideo((state) => state.tools);
  const formatId = useVideo((state) => state.format);
  const format = vFormat(formatId);
  const fadeOut = useVideo((state) => state.fadeOut);
  const tracks = useVideo((state) => state.tracks);
  const playing = useVideo((state) => state.playing);
  const time = useVideo((state) => state.t);
  const { width, height } = useFit(box, format.w, format.h, 56);
  const fontsTick = useFontsTick(layers);
  const draw = useRef<DrawStage>(() => undefined);
  // The selected clip's box on the stage (203 §11): presses that miss every layer, arrow keys, and its drawing.
  const clipBox = useClipTransform(canvasRef, () => draw.current());
  const sources = useStageSources(draw);
  const last = useRef<StageFrame<VClip> | null>(null);
  // Paused asks: only the newest one is drawn (latest wins).
  const asked = useRef(0);
  useLayoutEffect(() => {
    draw.current = (frame) => drawStage({ canvas: canvasRef.current, width, height, sources, last, drawBox: clipBox.drawBox }, frame);
  });

  // Clips removed from the project give their decoders and frames back.
  const known = useRef(new Set<string>());
  useEffect(() => {
    const now = new Set(clips.map((clip) => clip.id));
    for (const id of known.current) if (!now.has(id)) sources.stage().pool?.forget(id);
    known.current = now;
  }, [clips, sources]);

  // Paused or scrubbing: draw at once with what's held, then the exact frame of the export's grid when it lands.
  useEffect(() => {
    if (playing) return;
    syncMedia(sources, false);
    draw.current();
    const state = getVideo();
    const ask = ++asked.current;
    void pausedFrame(projectOf(state), state.t, state.fps, sources.stage().source)
      .then((frame) => {
        if (ask === asked.current && !getVideo().playing) draw.current(frame);
      })
      .catch((error: unknown) => logError('handled', error));
    lookAhead(sources, state.t);
  }, [clips, tracks, layers, layerSel, selectedClip, snapping, formatId, fadeOut, time, fontsTick, playing, width, height, sources]);

  usePlayback(playing, sources, draw);
  const handlers = useStageLayers(canvasRef, clipBox.background);

  return (
    <div className="mst-surface" ref={box}>
      <canvas
        ref={canvasRef}
        tabIndex={0}
        className={`mst-canvas${tools.tool === 'draw' ? ' drawing' : ''}`}
        style={{ width, height }}
        aria-label={`Video frame at ${formatTime(time)}, ${format.ratio}. Drag a layer or an overlay clip to move it, its corner handle to resize, its top handle to turn it; arrow keys move the selected one. Delete removes the selected layer. Space plays and pauses.`}
        onDoubleClick={() => document.getElementById('layer-text')?.focus()}
        {...handlers}
      />
      <p className="mst-hint">{tools.tool === 'draw' ? 'Drawing: drag on the frame' : 'Drag a layer or an overlay clip to move it · Space plays'}</p>
    </div>
  );
}
