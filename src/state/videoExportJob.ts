import { speedFields } from '../engine/speed';
import { bitrateFor, vFormat } from '../engine/videoFormats';
import { canStreamToDisk, openFileSink } from '../lib/fileSink';
import { getVideo, musicClips, setVideo } from './videoStore';

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
      tracks: current.tracks,
      clips: current.clips.map((clip) => ({ id: clip.id, track: clip.track, start: clip.start, kind: clip.kind, dur: clip.dur, in: clip.in, out: clip.out, edit: clip.edit, motion: clip.motion, fade: clip.fade, file: clip.file, volume: clip.volume, ...speedFields(clip) })),
      audio: musicClips(),
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
