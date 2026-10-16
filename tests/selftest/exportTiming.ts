/*
 * Development only: export timings for A/B runs against another build (204 T022, AC-10), run with
 * `CHITTHI_TEST_ONLY=timing npm test`. Self-contained on purpose (only the export, the timeline and videoChecks.ts),
 * so the same file can be dropped into a worktree of `main` and timed back to back with this branch.
 */
import { cycleOf } from './helpers';
import { makeTestClip, testPhoto } from './videoChecks';

/**
 * The fastest of some runs.
 * @param runs times in milliseconds
 * @returns the smallest
 */
const fastest = (runs: number[]) => Math.min(...runs);
/**
 * Milliseconds as seconds with two decimals.
 * @param ms a time in milliseconds
 * @returns e.g. `2.69`
 */
const secs = (ms: number) => (ms / 1000).toFixed(2);

/**
 * AC-10: 201's 60-clip 1080p project and 30 video clips of 4 s at 1080p (textured sources, 2 s key frames), each
 * exported in memory 3 times; the fastest run is the number to compare.
 * @returns one report line per project
 */
export async function exportTiming(): Promise<string[]> {
  const { encodeVideo } = await import('@/engine/videoExport');
  const { DEFAULT_EDIT } = await import('@/engine/instagram');
  const { MAIN_VIDEO, defaultTracks } = await import('@/engine/tracks');
  const { pack } = await import('@/engine/timeline');
  const width = 1920,
    height = 1080;
  const out: string[] = [];
  const time = async (clips: Parameters<typeof encodeVideo>[0]['clips'], fadeOut: boolean) => {
    const runs: number[] = [];
    for (let run = 0; run < 3; run++) {
      const s0 = performance.now();
      await encodeVideo({
        tracks: defaultTracks(),
        clips,
        audio: [],
        layers: [],
        width,
        height,
        fps: 30,
        bitrate: 8e6,
        fadeOut,
        sink: { kind: 'memory' },
      });
      runs.push(performance.now() - s0);
    }
    return runs;
  };

  // 201's timing project: 0.4 s photos with motion, every tenth clip a 0.4 s video.
  const clip = await makeTestClip();
  const photos = await Promise.all(Array.from({ length: 6 }, (_, index) => testPhoto(index)));
  if (clip) {
    const clips = pack(
      Array.from({ length: 60 }, (_, index) => {
        const video = index % 10 === 9;
        return {
          id: `c${index}`,
          track: MAIN_VIDEO,
          start: 0,
          kind: video ? ('video' as const) : ('photo' as const),
          dur: video ? 0 : 0.4,
          in: 0,
          out: video ? 0.4 : 0,
          edit: { ...DEFAULT_EDIT },
          motion: video ? ('none' as const) : ('zoom-in' as const),
          fade: index % 7 === 0,
          file: video ? clip : cycleOf(photos, index, 'test photo').blob,
          volume: 1,
        };
      }),
    );
    const runs = await time(clips, true);
    out.push(`timing: 201's 60-clip export fastest ${secs(fastest(runs))} s (runs ${runs.map(secs).join(', ')})`);
  }

  // 30 video clips of 4 s from 3 textured 1080p sources.
  const srcs = await Promise.all([0, 1, 2].map(() => makeTestClip(10, width, height, 2, true)));
  const sources = srcs.filter((source) => source !== null);
  if (sources.length === srcs.length) {
    const clips = pack(
      Array.from({ length: 30 }, (_, index) => {
        const inT = (index * 1.7) % 6;
        return {
          id: `v${index}`,
          track: MAIN_VIDEO,
          start: 0,
          kind: 'video' as const,
          dur: 0,
          in: inT,
          out: inT + 4,
          edit: { ...DEFAULT_EDIT },
          motion: 'none' as const,
          fade: false,
          file: cycleOf(sources, index, 'test clip'),
          volume: 1,
        };
      }),
    );
    const runs = await time(clips, false);
    out.push(
      `timing: 30 × 4 s 1080p video export fastest ${secs(fastest(runs))} s (runs ${runs.map(secs).join(', ')})`,
    );
  }
  return out;
}
