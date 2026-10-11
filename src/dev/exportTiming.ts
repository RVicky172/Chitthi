/*
 * Development only: export timings for A/B runs against another build (204 T022, AC-10), run with
 * `CHITTHI_TEST_ONLY=timing npm test`. Self-contained on purpose (only the export, the timeline and videoChecks.ts),
 * so the same file can be dropped into a worktree of `main` and timed back to back with this branch.
 */
import { makeTestClip, testPhoto } from './videoChecks';

const fastest = (xs: number[]) => Math.min(...xs);
const secs = (ms: number) => (ms / 1000).toFixed(2);

/** AC-10: 201's 60-clip 1080p project and 30 video clips of 4 s at 1080p (textured sources, 2 s key frames), each
 * exported in memory 3 times; the fastest run is the number to compare. */
export async function exportTiming(): Promise<string[]> {
  const { encodeVideo } = await import('../engine/videoExport');
  const { DEFAULT_EDIT } = await import('../engine/instagram');
  const { MAIN_VIDEO, defaultTracks, pack } = await import('../engine/timeline');
  const W = 1920,
    H = 1080;
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
        width: W,
        height: H,
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
  const photos = await Promise.all(Array.from({ length: 6 }, (_, i) => testPhoto(i)));
  if (clip) {
    const clips = pack(
      Array.from({ length: 60 }, (_, i) => {
        const video = i % 10 === 9;
        return {
          id: `c${i}`,
          track: MAIN_VIDEO,
          start: 0,
          kind: (video ? 'video' : 'photo') as 'photo' | 'video',
          dur: video ? 0 : 0.4,
          in: 0,
          out: video ? 0.4 : 0,
          edit: { ...DEFAULT_EDIT },
          motion: (video ? 'none' : 'zoom-in') as 'none' | 'zoom-in',
          fade: i % 7 === 0,
          file: video ? clip : photos[i % photos.length].blob,
          volume: 1,
        };
      }),
    );
    const runs = await time(clips, true);
    out.push(`timing: 201's 60-clip export fastest ${secs(fastest(runs))} s (runs ${runs.map(secs).join(', ')})`);
  }

  // 30 video clips of 4 s from 3 textured 1080p sources.
  const srcs = await Promise.all([0, 1, 2].map(() => makeTestClip(10, W, H, 2, true)));
  if (srcs.every(Boolean)) {
    const clips = pack(
      Array.from({ length: 30 }, (_, i) => {
        const inT = (i * 1.7) % 6;
        return {
          id: `v${i}`,
          track: MAIN_VIDEO,
          start: 0,
          kind: 'video' as const,
          dur: 0,
          in: inT,
          out: inT + 4,
          edit: { ...DEFAULT_EDIT },
          motion: 'none' as const,
          fade: false,
          file: srcs[i % 3]!,
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
