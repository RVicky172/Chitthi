import { duckCurves, type DuckCurves } from '../engine/ducking';
import type { SoundJob } from '../engine/exportSound';
import type { ExportClip } from '../engine/videoExport';
import { audioPlan } from '../engine/soundPlan';
import { speedFields } from '../engine/speed';
import { bitrateFor, vFormat } from '../engine/videoFormats';
import { canStreamToDisk, openFileSink } from '../lib/fileSink';
import { scanOf } from './soundScan';
import { getVideo, projectOf, setVideo, type VState } from './videoStore';

/*
 * The video's export: encoded with engine/videoExport.ts (loaded on export), in memory for Reels (so they can be
 * shared) or streamed to a file for YouTube videos, with progress in the store and a way to cancel.
 */

let running: AbortController | null = null;

/** What an export gave: an MP4 in memory, the name it was saved under, or nothing (cancelled). */
export type ExportOutcome = { kind: 'file'; file: File } | { kind: 'saved'; name: string } | null;

/**
 * The exported file's name.
 * @returns e.g. "chitthi-youtube-2026-10-14.mp4"
 */
function exportName(): string {
  const video = getVideo();
  return `chitthi-${video.kind === 'vlog' ? 'youtube' : video.format}-${new Date().toISOString().slice(0, 10)}.mp4`;
}

/**
 * The duck curves the export and the preview apply (208 AC-6, AC-7): from the scans, so both duck alike. A voice
 * still being scanned counts as silent.
 * @param video the video's state
 * @returns the curves by track id
 */
export function soundDucks(video: VState): DuckCurves {
  const project = projectOf(video);
  const media = new Map(video.clips.map((clip) => [clip.id, clip.url]));
  for (const sound of video.sounds) media.set(sound.id, sound.url);
  return duckCurves(project, audioPlan(project), (ref) => {
    const url = media.get(ref);
    return url === undefined ? undefined : scanOf(url);
  }).curves;
}

/**
 * The clips as the export takes them: their timing, look, speed, file and sound's volume.
 * @param video the video's state
 * @returns the clips
 */
const exportClips = (video: VState): ExportClip[] =>
  video.clips.map((clip) => ({ id: clip.id, track: clip.track, start: clip.start, kind: clip.kind, dur: clip.dur, in: clip.in, out: clip.out, edit: clip.edit, motion: clip.motion, fade: clip.fade, file: clip.file, volume: clip.volume, ...speedFields(clip) }));

/**
 * The export's sound (208): its tracks, clips, sound clips, duck curves and loudness target, as the export and the
 * background measurement both take it, so they measure the same mix.
 * @param video the video's state
 * @returns the sound job
 */
export function soundJob(video: VState): SoundJob & { clips: ExportClip[] } {
  return {
    tracks: video.tracks,
    clips: exportClips(video),
    audio: video.sounds,
    layers: video.layers,
    fadeOut: video.fadeOut,
    ducks: soundDucks(video),
    ...(video.loudness === 'off' ? {} : { loudness: video.loudness }),
  };
}

/**
 * Encodes the video. Reels are built in memory (so they can be shared); YouTube videos stream to a file the user
 * picks (desktop, Chrome, Edge), or are built in memory where the browser can't stream. Call straight from a click:
 * the save picker needs it.
 * @returns the outcome, or null when cancelled
 */
export async function exportVideo(): Promise<ExportOutcome> {
  if (running) return null;
  const video = getVideo();
  const format = vFormat(video.format);
  const name = exportName();
  const stream = video.kind === 'vlog' && canStreamToDisk();
  const sink = stream ? await openFileSink(name) : null;
  if (stream && !sink) return null;
  const controller = new AbortController();
  running = controller;
  setVideo({ progress: { frac: 0, phase: 'Loading the video encoder…' }, result: null, savedTo: null });
  try {
    const { encodeVideo } = await import('../engine/videoExport');
    const current = getVideo();
    const blob = await encodeVideo({
      ...soundJob(current),
      ...(current.measure ? { measured: current.measure } : {}),
      layers: current.layers,
      width: format.w,
      height: format.h,
      fps: current.fps,
      bitrate: bitrateFor(format, current.fps, current.quality),
      fadeOut: current.fadeOut,
      sink: sink ? { kind: 'stream', writable: sink.writable } : { kind: 'memory' },
      signal: controller.signal,
      onProgress: (frac, phase) => {
        setVideo({ progress: { frac, phase } });
      },
    });
    if (sink) {
      const saved = await sink.finish(true);
      setVideo({ progress: null, savedTo: saved });
      return saved ? { kind: 'saved', name: saved } : null;
    }
    if (!blob) throw new Error('The encoder gave no file.');
    const file = new File([blob], name, { type: 'video/mp4' });
    setVideo({ progress: null, result: file });
    return { kind: 'file', file };
  } catch (error) {
    await sink?.finish(false).catch(() => undefined);
    setVideo({ progress: null });
    if (error instanceof DOMException && error.name === 'AbortError') return null;
    throw error;
  } finally {
    running = null;
  }
}

/** Cancels the export that is running. */
export const cancelExport = (): void => {
  running?.abort();
};
