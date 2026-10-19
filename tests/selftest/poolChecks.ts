/*
 * Development only: the decoder pool's self-test checks on the real decoder (specs/features/204-decoder-pool). Test
 * clips are made in memory (videoChecks.ts makeTestClip: a flat colour per frame that tells its source time).
 */
import { ALL_FORMATS, CanvasSink, Input } from 'mediabunny';
import { clipColour, codeColour, decodedColours, makeTestClip, testPhoto } from './videoChecks';
import type { LegacyProject } from '../support/timeline.testkit';
import { blobFile } from '../support/blobFile';
import type { PoolClip, PoolFrame } from '@/engine/decodePool';
import { mediaInput, type MediaFile } from '@/engine/mediaFile';
import type { ExportClip, ExportJob } from '@/engine/videoExport';
import { context2d, cycleOf, entryAt, firstFew, meanRgb, messageOf, sleep } from './helpers';

/** Records one check: passed when `ok` is truthy, described by `what`. */
type Check = (ok: unknown, what: string) => void;

const FPS = 30;
/**
 * The frame showing at a source time in a 30 fps test clip.
 * @param time the source time, seconds
 * @returns the frame's start time, seconds
 */
const frameAt = (time: number) => Math.floor(time * FPS + 1e-6) / FPS;

/**
 * The mean colour of a 16 × 16 patch in the middle of a frame.
 * @param poolFrame the frame
 * @returns its mean red, green and blue
 */
function colourOf(poolFrame: PoolFrame): [number, number, number] {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 16;
  const x = context2d(canvas, { willReadFrequently: true });
  x.drawImage(poolFrame.image, poolFrame.width / 2 - 8, poolFrame.height / 2 - 8, 16, 16, 0, 0, 16, 16);
  return meanRgb(x.getImageData(0, 0, 16, 16).data);
}

/**
 * Whether a frame is the one for a source time of a test clip: the right frame, and its colour within ±8.
 * @param poolFrame the frame the pool gave, or null
 * @param time the source time asked for, seconds
 * @param dur the clip's length, seconds
 * @returns what is wrong, or null when it is exact
 */
function exact(poolFrame: PoolFrame | null, time: number, dur: number): string | null {
  if (!poolFrame) return `no frame at ${time.toFixed(3)} s`;
  const want = frameAt(time);
  if (Math.abs(poolFrame.time - want) > 1e-3)
    return `frame ${poolFrame.time.toFixed(3)} s for ${time.toFixed(3)} s (want ${want.toFixed(3)})`;
  const got = colourOf(poolFrame),
    exp = clipColour(want, dur);
  if (!exp.every((channel, channelIndex) => Math.abs(channel - (got.at(channelIndex) ?? NaN)) <= 8))
    return `colour ${got.map(Math.round).join('/')} at ${time.toFixed(3)} s (want ${exp.join('/')})`;
  return null;
}

/**
 * A small seeded random number generator (Mulberry32), so the random seeks are the same on every run.
 * @param seed the seed
 * @returns a function giving the next number in [0, 1)
 */
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let mixed = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A promise, or a failure naming `what` after `ms`: a pool that never answers fails its check instead of stalling the
 * run.
 * @param promise what to wait for
 * @param what what it is, for the failure
 * @param ms how long to wait, in milliseconds
 * @returns the promise's value
 */
export function within<T>(promise: Promise<T>, what: string, ms = 5000): Promise<T> {
  let timer = 0;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise<never>((_, reject) => {
      timer = window.setTimeout(() => reject(new Error(`no answer in ${ms / 1000} s: ${what}`)), ms);
    }),
  ]);
}

/**
 * Runs one group of checks; if it throws (or times out) that is one failed check, and the others still run.
 * @param check records a check
 * @param name the group's name, for the failure
 * @param body the group's checks
 */
async function group(check: Check, name: string, body: () => Promise<void>): Promise<void> {
  try {
    await body();
  } catch (error) {
    check(false, `pool: ${name} threw: ${messageOf(error)}`);
  }
}

/**
 * Waits until every frame and decoder is closed (readers stop asynchronously), at most `ms`.
 * @param open reads the open frames, decoders and bytes
 * @param ms how long to wait at most, in milliseconds
 * @returns the last counts read
 */
async function drained(open: () => { decoders: number; frames: number; bytes: number }, ms = 1000) {
  const end = performance.now() + ms;
  let counts = open();
  while ((counts.decoders || counts.frames || counts.bytes) && performance.now() < end) {
    await sleep(20);
    counts = open();
  }
  return counts;
}

/**
 * AC-1, AC-2 and AC-3 (204) through a pool on Mediabunny, then the export, preview and editor groups.
 * @param check records a check
 * @returns notes for the report
 */
export async function poolChecks(check: Check): Promise<string[]> {
  const { DecodePool, poolLimits } = await import('@/engine/decodePool');
  const { mediabunnySource, openFrames } = await import('@/engine/frameSource');
  const DUR = 10;
  const [clipA, clipB] = await Promise.all([makeTestClip(DUR, 640, 360, 2), makeTestClip(DUR, 640, 360, 2)]);
  if (!clipA || !clipB) return ['pool: this engine cannot encode H.264; pool checks skipped'];
  const notes: string[] = [];
  const clip = (id: string, file: Blob, inT: number, outT: number, start: number, track = 'V1'): PoolClip => ({
    id,
    file,
    in: inT,
    out: outT,
    start,
    track,
  });
  const src = (poolClip: PoolClip, time: number) => poolClip.in + (time - poolClip.start);
  const t0 = performance.now();

  // AC-1: three clips overlapping in time, two of them from the same file at different source times.
  await group(check, 'AC-1', async () => {
    const pool = new DecodePool(mediabunnySource, poolLimits(6, true));
    const cs = [clip('a1', clipA, 1, 7, 0), clip('a2', clipA, 3, 9, 1, 'V2'), clip('b', clipB, 0, 6, 0.5, 'V3')];
    const end = (poolClip: PoolClip) => poolClip.start + (poolClip.out - poolClip.in);
    // Each clip's first and last frame, then evenly through the span where all three show.
    const firstLast = cs.flatMap((poolClip) => [poolClip.start, end(poolClip) - 1 / FPS]);
    const times = [...firstLast, ...Array.from({ length: 30 - firstLast.length }, (_, step) => 1 + (step / 23) * 4.9)];
    const bad: string[] = [];
    let frames = 0;
    for (const time of times) {
      const on = cs.filter((poolClip) => time >= poolClip.start - 1e-9 && time < end(poolClip) - 1e-9);
      const got = await within(
        Promise.all(on.map((poolClip) => pool.frame(poolClip, src(poolClip, time)))),
        `AC-1 frames at ${time.toFixed(3)} s`,
      );
      on.forEach((poolClip, index) => {
        const problem = exact(got.at(index) ?? null, src(poolClip, time), DUR);
        if (problem) bad.push(`${poolClip.id} at ${time.toFixed(3)} s: ${problem}`);
        frames++;
      });
    }
    const stats = pool.stats();
    pool.dispose();
    check(
      !bad.length && frames >= 60,
      `pool: 3 overlapping clips (2 from one file) give their exact frames at 30 times (${frames} frames, ${stats.decoders} decoders)${firstFew(bad)}`,
    );
  });

  // AC-2: the last 15 frames of one clip and the first 15 of the next, at the same moments (a 0.5 s transition).
  await group(check, 'AC-2', async () => {
    const pool = new DecodePool(mediabunnySource, poolLimits(6, true));
    const c1 = clip('c1', clipA, 0, 3, 0),
      c2 = clip('c2', clipB, 2, 5, 3);
    const bad: string[] = [];
    for (let pair = 0; pair < 15; pair++) {
      const s1 = c1.out - (15 - pair) / FPS + 1e-4,
        s2 = c2.in + pair / FPS + 1e-4;
      const [f1, f2] = await within(Promise.all([pool.frame(c1, s1), pool.frame(c2, s2)]), `AC-2 pair ${pair}`);
      const e1 = exact(f1, s1, DUR),
        e2 = exact(f2, s2, DUR);
      if (e1) bad.push(`out ${pair}: ${e1}`);
      if (e2) bad.push(`in ${pair}: ${e2}`);
    }
    pool.dispose();
    check(
      !bad.length,
      `pool: the last 15 frames of a clip and the first 15 of the next decode together, all 30 exact${firstFew(bad)}`,
    );
  });

  // AC-3: 50 random times within 3 clips, backwards and forwards across key frames.
  await group(check, 'AC-3', async () => {
    const pool = new DecodePool(mediabunnySource, poolLimits(6, true));
    const cs = [clip('r1', clipA, 0, 10, 0), clip('r2', clipA, 2, 8, 0, 'V2'), clip('r3', clipB, 1, 9, 0, 'V3')];
    const rnd = mulberry32(2043);
    const bad: string[] = [];
    let back = 0,
      prev = 0;
    for (let seek = 0; seek < 50; seek++) {
      const poolClip = entryAt(cs, Math.floor(rnd() * cs.length), 'clip');
      const sourceTime = poolClip.in + rnd() * (poolClip.out - poolClip.in - 1 / FPS);
      if (sourceTime < prev) back++;
      prev = sourceTime;
      const problem = exact(
        await within(pool.frame(poolClip, sourceTime), `AC-3 ${poolClip.id} at ${sourceTime.toFixed(3)} s`),
        sourceTime,
        DUR,
      );
      if (problem) bad.push(`${poolClip.id}: ${problem}`);
    }
    pool.dispose();
    check(
      !bad.length && back >= 10,
      `pool: 50 random seeks (${back} backwards) across 3 clips are exact${firstFew(bad)}`,
    );
  });

  const left = await drained(openFrames);
  check(
    !left.decoders && !left.frames && !left.bytes,
    `pool: no frame or decoder left open after dispose (${left.decoders} decoders, ${left.frames} frames)`,
  );
  notes.push(
    `pool: AC-1–AC-3 on 2 × 10 s 640×360 clips (2 s key frames) in ${((performance.now() - t0) / 1000).toFixed(1)} s`,
  );
  await group(check, 'export AC-9', async () => {
    notes.push(await exportSameFrames(check, clipA, clipB));
  });
  await group(check, 'export AC-11', async () => {
    notes.push(await exportNoLeaks(check));
  });
  await group(check, 'preview AC-4', async () => {
    notes.push(await pausedPreviewIsExport(check));
  });
  await group(check, 'the editor stage', async () => {
    notes.push(await editorStageShowsVideo(check));
  });
  await group(check, 'fallback AC-14', async () => {
    notes.push(await fallbackOnTheEditor(check));
  });
  await group(check, 'drawing a closed frame (203)', async () => {
    notes.push(await closedFrameKeepsCanvas(check));
  });
  await group(check, 'fallback on a muted overlay (203)', async () => {
    notes.push(await fallbackOnMutedOverlay(check));
  });
  await group(check, 'stage stacks (203)', async () => {
    notes.push(await stageDrawsStacks(check));
  });
  await group(check, 'the editor stage overlay (203)', async () => {
    notes.push(await editorStageShowsOverlay(check));
  });
  return notes;
}

/**
 * 203 §5 on the stage's own paused path (previewFrame.ts: pausedFrame with the stage's source, then drawPreview), on
 * the AC-6 overlay fixture at 9:16 and 16:9 at its 8 times:
 * - every clip of a paused stack has its picture when the frame resolves (they resolve together), and the drawn frame
 *   matches the colour-code reference (each clip's box, rotation, corners, opacity) as renderStack's golden frames do;
 * - two asks in a row: the newer one is complete (latest wins per lane) and the older one still resolves;
 * - the held picture is per clip (heldStageFrame): an overlay arriving keeps the main clip's picture, the new clips wait.
 * @param check records a check
 * @returns a note for the report
 */
async function stageDrawsStacks(check: Check): Promise<string> {
  const { compareWithReference, makeOverlayProject } = await import('./videoChecks');
  const { drawPreview, heldStageFrame, pausedAt, pausedFrame, stageSource } =
    await import('@/components/studio/previewFrame');
  const { projectLength } = await import('@/engine/timeline');
  let framesCompared = 0;
  for (const format of ['9:16', '16:9'] as const) {
    const fixture = await makeOverlayProject(format);
    if (!fixture) return 'pool: 203 stage stacks skipped (no H.264 encoder)';
    const { width, height, fps } = fixture;
    const objectUrls: string[] = [];
    const project = {
      ...fixture.project,
      clips: fixture.project.clips.map((clip) => {
        const url = URL.createObjectURL(blobFile(clip.file));
        objectUrls.push(url);
        return { ...clip, url };
      }),
    };
    const total = projectLength(project);
    const context = context2d(document.createElement('canvas'), { willReadFrequently: true });
    context.canvas.width = width;
    context.canvas.height = height;
    const stage = stageSource();
    const problems: string[] = [];
    try {
      for (const time of fixture.times) {
        const frameNumber = Math.round(time * fps);
        const frame = await within(pausedFrame(project, time, fps, stage.source), `203 stage at ${time.toFixed(3)} s`);
        const withoutPicture = frame.items.filter((stackItem) => !stackItem.pic).map((stackItem) => stackItem.clip.id);
        if (withoutPicture.length) problems.push(`no picture for ${withoutPicture.join(', ')} at frame ${frameNumber}`);
        drawPreview(context, width, height, { layers: [], total, fadeOut: false }, frame);
        const reference = frame.items.map((stackItem) => {
          const expected = fixture.clips.find((fixtureClip) => fixtureClip.id === stackItem.clip.id);
          const rgb = fixture.colourAt(stackItem.clip.id, frame.at);
          if (!expected || !rgb) throw new Error(`no reference for ${stackItem.clip.id} at frame ${frameNumber}`);
          return { tf: expected.tf, rgb };
        });
        const result = compareWithReference(context.getImageData(0, 0, width, height).data, width, height, reference);
        framesCompared++;
        if (result.max > 8 || result.mean > 2 || result.n < width * height * 0.95)
          problems.push(
            `frame ${frameNumber}: worst ${result.max.toFixed(0)} at ${result.where}, mean ${result.mean.toFixed(2)}`,
          );
      }
      check(
        !problems.length,
        `pool: the paused stage draws the ${format} overlay stack as the golden reference at 8 times${firstFew(problems)}`,
      );

      // Latest wins: frame 37 (m1, B-roll, face-cam) then frame 59 at once; the newer has every picture.
      const [olderFrame, newerFrame] = await within(
        Promise.all([
          pausedFrame(project, 37 / fps, fps, stage.source),
          pausedFrame(project, 59 / fps, fps, stage.source),
        ]),
        '203 two asks in a row',
      );
      const newerPictures = newerFrame.items.filter((stackItem) => stackItem.pic).length;
      check(
        newerFrame.items.length === 3 && newerPictures === 3 && olderFrame.items.length === 3,
        `pool: of two paused asks in a row (${format}) the newer has all 3 pictures and the older resolves (newer ${newerPictures} of ${newerFrame.items.length})`,
      );

      // Held per clip: frame 12 shows m1 alone; at frame 37 the B-roll and face-cam arrive, m1 keeps its picture.
      const frameBefore = await within(pausedFrame(project, 12 / fps, fps, stage.source), '203 frame 12');
      const { at, items: stack } = pausedAt(project, 37 / fps, fps);
      const held = heldStageFrame(
        at,
        stack,
        frameBefore,
        () => null,
        (clip) => clip.kind === 'video',
      );
      const mainItem = held.items.find((stackItem) => stackItem.clip.id === 'm1');
      check(
        held.items.length === 3 &&
          !!mainItem?.pic &&
          mainItem.pic === frameBefore.items[0]?.pic &&
          held.items.filter((stackItem) => stackItem.pic).length === 1,
        `pool: the held picture is per clip: an overlay arriving keeps the main clip's picture (${format})`,
      );
    } finally {
      stage.dispose();
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    }
  }
  return `pool: 203 stage compared ${framesCompared} paused stacks with the golden reference`;
}

/**
 * Drawing a video frame that was closed after it was handed out (a held picture the pool has since released) throws;
 * the canvas must come back unchanged: no transform, clip or alpha left behind, so the stage's next draw lands where it
 * should. Tried full frame and in a rotated see-through box (renderStack's two drawing paths).
 * @param check records a check
 * @returns a note for the report
 */
async function closedFrameKeepsCanvas(check: Check): Promise<string> {
  if (typeof VideoFrame === 'undefined') return 'pool: closed-frame check skipped (no VideoFrame)';
  const { renderStack } = await import('@/engine/video');
  const { DEFAULT_EDIT } = await import('@/engine/instagram');
  const width = 320,
    height = 180;
  const source = document.createElement('canvas');
  source.width = width;
  source.height = height;
  context2d(source).fillRect(0, 0, width, height);
  const results: string[] = [];
  let allRestored = true;
  for (const [name, transform] of [
    ['full frame', undefined],
    ['rotated see-through box', { x: 0.5, y: 0.5, w: 0.5, rot: 20, opacity: 0.5, radius: 0.1 }],
  ] as const) {
    const closedFrame = new VideoFrame(source, { timestamp: 0 });
    closedFrame.close();
    const context = context2d(document.createElement('canvas'));
    context.canvas.width = width;
    context.canvas.height = height;
    let threw = false;
    try {
      renderStack(
        context,
        width,
        height,
        [
          {
            clip: {
              kind: 'video',
              dur: 0,
              in: 0,
              out: 1,
              edit: { ...DEFAULT_EDIT },
              motion: 'none',
              fade: false,
              overlay: true,
              tf: transform,
            },
            src: closedFrame,
            sw: width,
            sh: height,
            local: 0,
          },
        ],
        [],
        0,
        1,
        false,
      );
    } catch {
      threw = true;
    }
    const restored = context.getTransform().isIdentity && context.globalAlpha === 1;
    allRestored &&= restored;
    const canvasState = restored
      ? 'unchanged'
      : `left at ${context.getTransform().toString()} alpha ${context.globalAlpha}`;
    results.push(`${name}: ${threw ? 'threw' : 'did not throw'}, canvas ${canvasState}`);
  }
  check(allRestored, `pool: drawing a closed video frame leaves the canvas unchanged (${results.join('; ')})`);
  return 'pool: a closed frame leaves the canvas as it was';
}

/**
 * 203 T034 on the real editor (StrictMode): a clip the pool can't decode, full frame on an overlay track over a main
 * clip with another colour code. Its picture comes from its <video>, which must follow the playhead whether the track
 * is muted or not: Mute is about sound, so a muted track's clip is still drawn. (Before T034 the <video> was driven
 * from the sound plan, which leaves a muted track's clips out, so the picture stayed put; and drawing a released frame
 * left the stage canvas moved to the picture's centre, so later frames were drawn in its bottom-right quarter.)
 * A <video> seek can land one frame early, so the frame shown may be one before the one asked for (as in 204 AC-14).
 * @param check records a check
 * @returns a note for the report
 */
async function fallbackOnMutedOverlay(check: Check): Promise<string> {
  const React = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { VideoWorkspace } = await import('@/components/studio/VideoWorkspace');
  // The video store and the actions these checks use.
  const video = {
    ...(await import('@/state/videoStore')),
    ...(await import('@/state/videoTracks')),
    ...(await import('@/state/videoClips')),
    ...(await import('@/state/videoBox')),
    ...(await import('@/state/videoMedia')),
  };
  const { refuseDecodingForTests, allowDecodingForTests } = await import('@/engine/frameSource');
  const [mainBlob, overlayBlob] = await Promise.all([
    makeTestClip(3, 640, 360, 1, false, 2),
    makeTestClip(3, 640, 360, 1, false, true),
  ]);
  if (!mainBlob || !overlayBlob) return 'pool: muted-overlay fallback check skipped (no H.264 encoder)';
  const undecodable = new File([overlayBlob], 'overlay-cant-decode.mp4', { type: 'video/mp4' });
  refuseDecodingForTests(undecodable);
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#fff';
  document.body.append(host);
  const root = createRoot(host);
  root.render(
    React.createElement(
      React.StrictMode,
      null,
      React.createElement(VideoWorkspace, { mode: 'vlog', onMode: () => undefined }),
    ),
  );

  /**
   * The overlay's frame number named by the colour at the stage's centre (codeColour without a clip code, ±10).
   * @returns the frame number, or -1
   */
  const frameAtCentre = (): number => {
    const stageCanvas = host.querySelector<HTMLCanvasElement>('canvas.mst-canvas');
    const context = stageCanvas?.getContext('2d', { willReadFrequently: true });
    if (!stageCanvas || !context || !stageCanvas.width) return -1;
    const mean = meanRgb(
      context.getImageData(Math.floor(stageCanvas.width / 2) - 4, Math.floor(stageCanvas.height / 2) - 4, 8, 8).data,
    );
    const frames = Array.from({ length: 90 }, (_, frame) => frame);
    return (
      frames.find((frame) =>
        codeColour(frame).every((want, channel) => Math.abs(want - (mean.at(channel) ?? NaN)) <= 10),
      ) ?? -1
    );
  };
  /**
   * Polls `isDone` every 16 ms until it holds or `timeoutMs` passes.
   * @param isDone the condition
   * @param timeoutMs how long to wait at most, in milliseconds
   * @returns its last answer
   */
  const waitFor = async (isDone: () => boolean, timeoutMs: number): Promise<boolean> => {
    const deadline = performance.now() + timeoutMs;
    while (!isDone() && performance.now() < deadline) await sleep(16);
    return isDone();
  };

  const tracksBefore = new Set(video.getVideo().tracks.map((track) => track.id));
  let addedIds: string[] = [];
  try {
    await sleep(300);
    const clipsBefore = new Set(video.getVideo().clips.map((clip) => clip.id));
    await video.addMedia([{ name: 'main.mp4', blob: mainBlob, type: 'video/mp4' }]);
    const mainClip = video.getVideo().clips.find((clip) => !clipsBefore.has(clip.id));
    if (!mainClip) throw new Error('the main clip was not added');
    await video.addMedia([{ name: undecodable.name, blob: undecodable, type: undecodable.type }], {
      track: video.NEW_TRACK,
      at: mainClip.start,
    });
    addedIds = video
      .getVideo()
      .clips.filter((clip) => !clipsBefore.has(clip.id))
      .map((clip) => clip.id);
    const overlayClip = video.getVideo().clips.find((clip) => addedIds.includes(clip.id) && clip.id !== mainClip.id);
    if (!overlayClip) throw new Error('the overlay clip was not added');
    // No fades, so the stage shows the overlay's exact colour.
    video.setVideoOptions({ fadeOut: false });
    for (const id of addedIds) video.updateClip(id, { fade: false });

    const results: string[] = [];
    let allShown = true;
    for (const [muted, wantedFrame] of [
      [false, 20],
      [false, 50],
      [true, 20],
      [true, 50],
    ] as const) {
      video.setTrack(overlayClip.track, { muted });
      video.setPlayhead(overlayClip.start + (wantedFrame + 0.5) / FPS);
      const isShown = () => frameAtCentre() === wantedFrame || frameAtCentre() === wantedFrame - 1;
      allShown = (await waitFor(isShown, 5000)) && allShown;
      results.push(`${muted ? 'muted' : 'unmuted'} frame ${frameAtCentre()} (want ${wantedFrame})`);
    }
    check(
      allShown,
      `pool: a fallback clip on an overlay track shows its frame where the playhead is, muted or not: ${results.join(', ')}`,
    );
  } finally {
    allowDecodingForTests(undecodable);
    video.setPlaying(false);
    for (const id of addedIds) video.removeClip(id);
    for (const track of video.getVideo().tracks) if (!tracksBefore.has(track.id)) video.deleteTrack(track.id);
    root.unmount();
    host.remove();
  }
  return 'pool: a fallback clip on a muted overlay track follows the playhead';
}

/**
 * 203 on the real editor (StrictMode, as `npm run dev`): a frame-coded main clip and, on a new overlay track, a clip
 * with its own code placed top-right by the preset. Paused, the stage shows the overlay inside its box and the main
 * clip outside it.
 * @param check records a check
 * @returns a note for the report
 */
async function editorStageShowsOverlay(check: Check): Promise<string> {
  const React = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { VideoWorkspace } = await import('@/components/studio/VideoWorkspace');
  // The video store and the actions these checks use.
  const video = {
    ...(await import('@/state/videoStore')),
    ...(await import('@/state/videoTracks')),
    ...(await import('@/state/videoClips')),
    ...(await import('@/state/videoBox')),
    ...(await import('@/state/videoMedia')),
  };
  const [mainBlob, overlayBlob] = await Promise.all([
    makeTestClip(4, 640, 360, 1, false, true),
    makeTestClip(4, 320, 240, 1, false, 3),
  ]);
  if (!mainBlob || !overlayBlob) return 'pool: overlay stage check skipped (no H.264 encoder)';
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#fff';
  document.body.append(host);
  const root = createRoot(host);
  root.render(
    React.createElement(
      React.StrictMode,
      null,
      React.createElement(VideoWorkspace, { mode: 'vlog', onMode: () => undefined }),
    ),
  );

  /**
   * The stage's mean colour in an 8 × 8 patch.
   * @param shareX the patch centre across the stage, 0–1
   * @param shareY the patch centre down the stage, 0–1
   * @returns the mean red, green and blue, or null before the stage canvas is drawn
   */
  const colourAt = (shareX: number, shareY: number): number[] | null => {
    const stageCanvas = host.querySelector<HTMLCanvasElement>('canvas.mst-canvas');
    const context = stageCanvas?.getContext('2d');
    if (!stageCanvas || !context || !stageCanvas.width) return null;
    return meanRgb(
      context.getImageData(
        Math.floor(stageCanvas.width * shareX) - 4,
        Math.floor(stageCanvas.height * shareY) - 4,
        8,
        8,
      ).data,
    );
  };
  /**
   * Whether every channel of a colour is within 8 levels of another.
   * @param colour the colour read, or null
   * @param wanted the colour wanted
   * @returns whether they match
   */
  const isNear = (colour: readonly number[] | null, wanted: readonly number[]) =>
    !!colour && wanted.every((value, channel) => Math.abs(value - (colour.at(channel) ?? NaN)) <= 8);
  /**
   * Polls `isDone` every 50 ms until it holds or `timeoutMs` passes.
   * @param isDone the condition
   * @param timeoutMs how long to wait at most, in milliseconds
   * @returns its last answer
   */
  const waitFor = async (isDone: () => boolean, timeoutMs: number): Promise<boolean> => {
    const deadline = performance.now() + timeoutMs;
    while (!isDone() && performance.now() < deadline) await sleep(50);
    return isDone();
  };
  /**
   * A colour for the report.
   * @param colour the colour, or null
   * @returns "r/g/b", or undefined
   */
  const describe = (colour: readonly number[] | null) => colour?.map(Math.round).join('/');

  const tracksBefore = new Set(video.getVideo().tracks.map((track) => track.id));
  let addedIds: string[] = [];
  try {
    await sleep(300);
    const clipsBefore = new Set(video.getVideo().clips.map((clip) => clip.id));
    await video.addMedia([{ name: 'main.mp4', blob: mainBlob, type: 'video/mp4' }]);
    const mainClip = video.getVideo().clips.find((clip) => !clipsBefore.has(clip.id));
    if (!mainClip) throw new Error('the main clip was not added');
    await video.addMedia([{ name: 'overlay.mp4', blob: overlayBlob, type: 'video/mp4' }], {
      track: video.NEW_TRACK,
      at: mainClip.start,
    });
    addedIds = video
      .getVideo()
      .clips.filter((clip) => !clipsBefore.has(clip.id))
      .map((clip) => clip.id);
    const overlayClip = video.getVideo().clips.find((clip) => addedIds.includes(clip.id) && clip.id !== mainClip.id);
    if (!overlayClip) throw new Error('the overlay clip was not added');
    const refusal = video.applyPreset(overlayClip.id, 'top-right');
    if (refusal) throw new Error(refusal);
    const box = video.getVideo().clips.find((clip) => clip.id === overlayClip.id)?.tf;
    if (!box) throw new Error('the overlay clip has no box after the preset');
    const playhead = mainClip.start + 0.5;
    video.setPlayhead(playhead);
    const wantedMain = codeColour(Math.floor((playhead - mainClip.start + mainClip.in) * FPS + 1e-6));
    const wantedOverlay = codeColour(Math.floor((playhead - overlayClip.start + overlayClip.in) * FPS + 1e-6), 3);
    const isShown = () => isNear(colourAt(box.x, box.y), wantedOverlay) && isNear(colourAt(0.25, 0.8), wantedMain);
    check(
      await waitFor(isShown, 5000),
      `pool: the editor (StrictMode) shows an overlay clip in its top-right box over the main clip (box ${describe(colourAt(box.x, box.y))}, want ${describe(wantedOverlay)}; outside ${describe(colourAt(0.25, 0.8))}, want ${describe(wantedMain)})`,
    );
  } finally {
    video.setPlaying(false);
    for (const id of addedIds) video.removeClip(id);
    for (const track of video.getVideo().tracks) if (!tracksBefore.has(track.id)) video.deleteTrack(track.id);
    root.unmount();
    host.remove();
  }
  return 'pool: the editor stage (StrictMode) shows an overlay clip';
}

/**
 * The mean colour of the 16 × 16 patch in the middle of a canvas.
 * @param context the canvas's context
 * @param width the canvas's width
 * @param height the canvas's height
 * @returns the mean red, green and blue
 */
function mean16(context: CanvasRenderingContext2D, width: number, height: number): [number, number, number] {
  return meanRgb(context.getImageData(Math.round(width / 2) - 8, Math.round(height / 2) - 8, 16, 16).data);
}

/**
 * AC-9 (204): the export shows the same source frames as it always did. 201's project shapes (video clips from the
 * test clips, photos from test photos) and 202's gap are exported at 16:9; at 10 frames each the decoded middle must
 * match (±8) that frame drawn by `renderFrame` from a source frame decoded on its own (`CanvasSink.getCanvas`, as the
 * export decoded before the pool): an oracle that holds on today's code and after.
 * @param check records a check
 * @param clipA a 10 s test clip
 * @param clipB another one
 * @returns a note for the report
 */
async function exportSameFrames(check: Check, clipA: Blob, clipB: Blob): Promise<string> {
  const { encodeVideo } = await import('@/engine/videoExport');
  const { renderFrame, NO_PICTURE } = await import('@/engine/video');
  const { legacyFixtures } = await import('../support/timeline.testkit');
  const { MAIN_VIDEO, defaultTracks } = await import('@/engine/tracks');
  const { framePlan, pack, projectLength } = await import('@/engine/timeline');
  const { DEFAULT_EDIT } = await import('@/engine/instagram');
  const { loadImage } = await import('@/engine/photo');
  const WIDTH = 480,
    HEIGHT = 270;
  const photos = await Promise.all([0, 1, 2].map((index) => testPhoto(index, 640, 427)));
  const images = new Map<MediaFile, HTMLImageElement>();
  for (const photo of photos) {
    const url = URL.createObjectURL(photo.blob);
    images.set(photo.blob, await loadImage(url));
    URL.revokeObjectURL(url);
  }
  const lf = legacyFixtures();
  const shapes = {
    videoOnly: lf.videoOnly,
    mixed: lf.mixed,
    musicOffset: lf.musicOffset,
    noFadeOut: lf.noFadeOut,
    tinyClips: lf.tinyClips,
    clips20: lf.clips20,
  };
  const base = { tracks: defaultTracks(), audio: [], width: WIDTH, height: HEIGHT, fps: FPS, bitrate: 1.5e6 };
  const jobs: [string, ExportJob][] = Object.entries(shapes).flatMap(
    ([name, lp]: [string, LegacyProject | undefined]) => {
      if (!lp) return [];
      let used = 0;
      const fileFor = (kind: 'photo' | 'video') => {
        const turn = used++;
        if (kind === 'photo') return cycleOf(photos, turn, 'test photo').blob;
        return turn % 2 ? clipB : clipA;
      };
      const clips = pack(
        lp.clips.map((legacyClip): ExportClip => ({
          ...legacyClip,
          track: MAIN_VIDEO,
          start: 0,
          file: fileFor(legacyClip.kind),
        })),
      );
      return [[name, { ...base, clips, layers: lp.layers, fadeOut: lp.fadeOut, sink: { kind: 'memory' } }]];
    },
  );
  // 202's gap: two 1 s photos 1.5 s apart.
  const gapClips = [0, 1].map((index): ExportClip => ({
    id: `g${index}`,
    track: MAIN_VIDEO,
    start: index ? 2.5 : 0,
    kind: 'photo',
    dur: 1,
    in: 0,
    out: 0,
    edit: { ...DEFAULT_EDIT },
    motion: 'none',
    fade: false,
    file: entryAt(photos, index, 'test photo').blob,
    volume: 0,
  }));
  jobs.push(['gap', { ...base, clips: gapClips, layers: [], fadeOut: false, sink: { kind: 'memory' } }]);

  const ox = document.createElement('canvas');
  ox.width = WIDTH;
  ox.height = HEIGHT;
  const octx = context2d(ox, { willReadFrequently: true });
  const bad: string[] = [];
  let compared = 0;
  for (const [name, job] of jobs) {
    const mp4 = await encodeVideo(job);
    if (!mp4) throw new Error(`${name}: no file`);
    const total = projectLength(job);
    const frames = Math.max(1, Math.round(total * FPS));
    const idx = Array.from({ length: 10 }, (_, sample) =>
      Math.min(frames - 1, Math.floor(((sample + 0.5) / 10) * frames)),
    );
    const got = await decodedColours(
      mp4,
      idx.map((frameIndex) => (frameIndex + 0.5) / FPS),
    );
    const plan = framePlan(job, FPS);
    const inputs = new Map<MediaFile, { input: Input; sink: CanvasSink }>();
    try {
      for (const [sample, frameIndex] of idx.entries()) {
        const span = plan.find((entry) => frameIndex >= entry.f0 && frameIndex < entry.f1);
        const time = frameIndex / FPS;
        const spanClip = span?.clip ?? null;
        if (!spanClip)
          renderFrame(
            octx,
            WIDTH,
            HEIGHT,
            NO_PICTURE,
            null,
            0,
            0,
            time - (span?.start ?? 0),
            job.layers,
            time,
            total,
            job.fadeOut,
          );
        else if (spanClip.kind === 'photo') {
          const img = images.get(spanClip.file);
          if (!img) throw new Error(`${name}: no image for photo ${spanClip.id}`);
          renderFrame(
            octx,
            WIDTH,
            HEIGHT,
            spanClip,
            img,
            img.naturalWidth,
            img.naturalHeight,
            time - spanClip.start,
            job.layers,
            time,
            total,
            job.fadeOut,
          );
        } else {
          let opened = inputs.get(spanClip.file);
          if (!opened) {
            const input = new Input({ source: mediaInput(spanClip.file), formats: ALL_FORMATS });
            const track = await input.getPrimaryVideoTrack();
            if (!track) throw new Error(`${name}: no video track in ${spanClip.id}`);
            const width = Math.min(await track.getDisplayWidth(), Math.round(Math.max(WIDTH, HEIGHT) * 1.8));
            opened = { input, sink: new CanvasSink(track, { width }) };
            inputs.set(spanClip.file, opened);
          }
          const wc = await opened.sink.getCanvas(spanClip.in + time - spanClip.start);
          const cv = wc?.canvas ?? null;
          renderFrame(
            octx,
            WIDTH,
            HEIGHT,
            spanClip,
            cv,
            cv?.width ?? 0,
            cv?.height ?? 0,
            time - spanClip.start,
            job.layers,
            time,
            total,
            job.fadeOut,
          );
        }
        const want = mean16(octx, WIDTH, HEIGHT);
        compared++;
        const decoded = got.at(sample);
        if (!decoded || !want.every((channel, ch) => Math.abs(channel - (decoded.at(ch) ?? NaN)) <= 8))
          bad.push(
            `${name} frame ${frameIndex}: ${decoded?.map(Math.round).join('/')} (want ${want.map(Math.round).join('/')})`,
          );
      }
    } finally {
      for (const opened of inputs.values()) opened.input.dispose();
    }
  }
  check(
    !bad.length,
    `pool: exports of 201's shapes and 202's gap show the expected source frames (${compared} frames)${firstFew(bad)}`,
  );
  return `pool: AC-9 compared ${compared} exported frames in ${jobs.length} projects`;
}

/**
 * AC-11 (204): a 2-minute 1080p 16:9 export (24 clips of 5 s from 3 source files, a hidden track's span, a 1.5 s gap)
 * decodes its frames through the pool and leaves no frame or decoder open: after it, after 3 in a row, after a cancel
 * at 50 % and after a clip that can't be read at about 1 minute.
 * @param check records a check
 * @returns a note for the report
 */
async function exportNoLeaks(check: Check): Promise<string> {
  const { encodeVideo, ExportError } = await import('@/engine/videoExport');
  const { openFrames } = await import('@/engine/frameSource');
  const { MAIN_VIDEO, defaultTracks } = await import('@/engine/tracks');
  const { DEFAULT_EDIT } = await import('@/engine/instagram');
  const t0 = performance.now();
  const srcs = await Promise.all([0, 1, 2].map(() => makeTestClip(10, 1920, 1080, 2)));
  const files = srcs.filter((source): source is Blob => !!source);
  if (files.length < 3) return 'pool: AC-11 skipped (no 1080p H.264 encoder)';
  const made = performance.now() - t0;
  let start = 0;
  const clips: ExportClip[] = Array.from({ length: 24 }, (_, index) => {
    const inT = (index * 1.3) % 5;
    const exportClip: ExportClip = {
      id: `l${index}`,
      track: MAIN_VIDEO,
      start,
      kind: 'video',
      dur: 0,
      in: inT,
      out: inT + 5,
      edit: { ...DEFAULT_EDIT },
      motion: 'none',
      fade: false,
      file: cycleOf(files, index, 'test clip'),
      volume: 1,
    };
    start += 5 + (index === 11 ? 1.5 : 0);
    return exportClip;
  });
  const overlay = { id: 'V2', kind: 'overlay' as const, name: 'Overlay', hidden: true, muted: false, locked: false };
  clips.push({ ...entryAt(clips, 3, 'clip'), id: 'hidden', track: 'V2', start: 30 });
  const job = (cs: ExportClip[], extra: Partial<ExportJob> = {}): ExportJob => ({
    tracks: [...defaultTracks(), overlay],
    clips: cs,
    audio: [],
    layers: [],
    fadeOut: false,
    width: 1920,
    height: 1080,
    fps: FPS,
    bitrate: 4e6,
    sink: { kind: 'memory' },
    ...extra,
  });
  const zero = async (what: string) => {
    const counts = await drained(openFrames);
    check(
      !counts.decoders && !counts.frames && !counts.bytes,
      `pool: no frame or decoder open after ${what} (${counts.decoders} decoders, ${counts.frames} frames, ${(counts.bytes / 2 ** 20).toFixed(0)} MB)`,
    );
  };
  const times: number[] = [];
  for (let run = 0; run < 3; run++) {
    const before = openFrames().made,
      s0 = performance.now();
    const mp4 = await encodeVideo(job(clips));
    times.push(performance.now() - s0);
    const through = openFrames().made - before;
    check(
      !!mp4 && mp4.size > 1e5 && through >= 24 * 5 * FPS,
      `pool: a 2-minute 1080p export decodes its video frames through the pool (run ${run + 1}: ${through} frames)`,
    );
    await zero(`a 2-minute export (run ${run + 1})`);
  }
  // Cancelled half way.
  const ac = new AbortController();
  let cancelled = false;
  try {
    await encodeVideo(
      job(clips, { signal: ac.signal, onProgress: (share) => (share >= 0.5 ? ac.abort() : undefined) }),
    );
  } catch (error) {
    cancelled = error instanceof DOMException && error.name === 'AbortError';
  }
  check(cancelled, 'pool: an export cancelled at 50 % stops with AbortError');
  await zero('an export cancelled at 50 %');
  // A clip that can't be read at about 1 minute.
  const broken = new File([new Uint8Array(4096).fill(7)], 'broken.mp4', { type: 'video/mp4' });
  let refused = '';
  try {
    await encodeVideo(
      job(clips.map((exportClip, index) => (index === 12 ? { ...exportClip, file: broken } : exportClip))),
    );
  } catch (error) {
    refused = error instanceof ExportError ? error.message : String(error);
  }
  check(
    refused.includes('broken.mp4'),
    `pool: an export refuses a clip it can't read, naming the file (${refused || 'no error'})`,
  );
  await zero('an export that failed at 1 minute');
  const secs = (ms: number) => (ms / 1000).toFixed(1);
  return `pool: AC-11 sources made in ${secs(made)} s; 2-minute 1080p exports ${times.map(secs).join(', ')} s; all in ${secs(performance.now() - t0)} s`;
}

/**
 * AC-4 (204): paused, the stage shows the frame the export encodes. Six frame-coded video clips (each frame's colour
 * names it) with lengths off the frame grid, at 9:16 and 16:9, paused at 20 playhead times off the grid: the stage's
 * own paused path (previewFrame.ts: pausedFrame with the stage's source, then drawPreview) and the decoded export frame
 * for that time (frame floor(t * fps)) must match within ±8 in the middle.
 * @param check records a check
 * @returns a note for the report
 */
async function pausedPreviewIsExport(check: Check): Promise<string> {
  const { encodeVideo } = await import('@/engine/videoExport');
  const { MAIN_VIDEO, defaultTracks } = await import('@/engine/tracks');
  const { pack, projectLength } = await import('@/engine/timeline');
  const { DEFAULT_EDIT } = await import('@/engine/instagram');
  const { drawPreview, pausedFrame, stageSource } = await import('@/components/studio/previewFrame');
  const files = (await Promise.all([0, 1].map(() => makeTestClip(4, 640, 360, 2, false, true)))).filter(
    (file): file is Blob => !!file,
  );
  if (files.length < 2) return 'pool: AC-4 skipped (no H.264 encoder)';
  const urls = files.map((file) => URL.createObjectURL(file));
  // Each clip's length and in point.
  const spans = [
    [1.37, 0.2],
    [0.9, 1.1],
    [1.53, 0.5],
    [1.11, 1.9],
    [0.77, 0.33],
    [1.29, 0.7],
  ] as const;
  const clips = pack(
    spans.map(([len, inPoint], index) => ({
      id: `p${index}`,
      track: MAIN_VIDEO,
      start: 0,
      kind: 'video' as const,
      dur: 0,
      in: inPoint,
      out: inPoint + len,
      edit: { ...DEFAULT_EDIT },
      motion: 'none' as const,
      fade: false,
      file: cycleOf(files, index, 'test clip'),
      url: cycleOf(urls, index, 'clip URL'),
      volume: 0,
    })),
  );
  const project = { tracks: defaultTracks(), clips, audio: [], layers: [], fadeOut: false };
  const total = projectLength(project);
  const times = Array.from({ length: 20 }, (_, sample) => ((sample + 0.37) * total) / 20);
  const bad: string[] = [];
  let compared = 0;
  try {
    for (const [ratio, width, height] of [
      ['9:16', 270, 480],
      ['16:9', 480, 270],
    ] as const) {
      const mp4 = await encodeVideo({
        ...project,
        audio: [],
        width,
        height,
        fps: FPS,
        bitrate: 4e6,
        sink: { kind: 'memory' },
      });
      if (!mp4) throw new Error('no export');
      const exported = await decodedColours(
        mp4,
        times.map((time) => (Math.floor(time * FPS + 1e-6) + 0.5) / FPS),
      );
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const x = context2d(canvas, { willReadFrequently: true });
      const stage = stageSource();
      try {
        for (const [sample, time] of times.entries()) {
          const frame = await within(
            pausedFrame(project, time, FPS, stage.source),
            `AC-4 preview at ${time.toFixed(3)} s`,
          );
          drawPreview(x, width, height, { layers: [], total, fadeOut: false }, frame);
          const shown = mean16(x, width, height),
            want = exported.at(sample);
          compared++;
          if (!want || !shown.every((channel, ch) => Math.abs(channel - (want.at(ch) ?? NaN)) <= 8))
            bad.push(
              `${ratio} at ${time.toFixed(3)} s: preview ${shown.map(Math.round).join('/')}, export ${want?.map(Math.round).join('/')}`,
            );
        }
      } finally {
        stage.dispose();
      }
    }
  } finally {
    urls.forEach((url) => URL.revokeObjectURL(url));
  }
  check(
    !bad.length,
    `pool: the paused preview shows the export's frame at 20 times, 9:16 and 16:9 (${compared - bad.length} of ${compared} match)${firstFew(bad)}`,
  );
  return `pool: AC-4 compared ${compared} paused frames with the export`;
}

/**
 * The real video editor, mounted in StrictMode on the dev server as `npm run dev` runs it (StrictMode runs effects
 * twice): a video clip added with the store's own addMedia shows on the stage, paused at its exact frame and moving
 * while playing. (204 T031: a source kept in useMemo was disposed by StrictMode's second run and the stage stayed black;
 * only development showed it.)
 * @param check records a check
 * @returns a note for the report
 */
async function editorStageShowsVideo(check: Check): Promise<string> {
  const React = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { VideoWorkspace } = await import('@/components/studio/VideoWorkspace');
  // The video store and the actions these checks use.
  const video = {
    ...(await import('@/state/videoStore')),
    ...(await import('@/state/videoTracks')),
    ...(await import('@/state/videoClips')),
    ...(await import('@/state/videoBox')),
    ...(await import('@/state/videoMedia')),
  };
  // 6 s, so playback is still running after a few of the hidden window's slow ticks (below).
  const clip = await makeTestClip(6, 640, 360, 1, false, true);
  if (!clip) return 'pool: stage check skipped (no H.264 encoder)';
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#fff';
  document.body.append(host);
  const root = createRoot(host);
  root.render(
    React.createElement(
      React.StrictMode,
      null,
      React.createElement(VideoWorkspace, { mode: 'vlog', onMode: () => undefined }),
    ),
  );
  const centre = () => {
    const canvas = host.querySelector<HTMLCanvasElement>('canvas.mst-canvas');
    const x = canvas?.getContext('2d');
    if (!canvas || !x || !canvas.width) return null;
    return meanRgb(x.getImageData(Math.floor(canvas.width / 2) - 4, Math.floor(canvas.height / 2) - 4, 8, 8).data);
  };
  const near = (colour: readonly number[] | null, want: readonly number[]) =>
    !!colour && want.every((wanted, channelIndex) => Math.abs(wanted - (colour.at(channelIndex) ?? NaN)) <= 8);
  const frameOf = (colour: readonly number[] | null) =>
    colour
      ? (Array.from({ length: 180 }, (_, index) => index).find((index) => near(colour, codeColour(index))) ?? -1)
      : -1;
  const waitFor = async (ok: () => boolean, ms: number) => {
    const end = performance.now() + ms;
    while (!ok() && performance.now() < end) await sleep(50);
    return ok();
  };
  let ids: string[] = [];
  try {
    await sleep(300);
    const before = new Set(video.getVideo().clips.map((existing) => existing.id));
    await video.addMedia([{ name: 'coded.mp4', blob: clip, type: 'video/mp4' }]);
    ids = video
      .getVideo()
      .clips.filter((existing) => !before.has(existing.id))
      .map((existing) => existing.id);
    const added = video.getVideo().clips.find((existing) => ids.includes(existing.id));
    if (!added) throw new Error('the clip was not added');
    const time = added.start + 0.5;
    video.setPlayhead(time);
    const want = codeColour(Math.floor((time - added.start + added.in) * FPS + 1e-6));
    const paused = await waitFor(() => near(centre(), want), 5000);
    const seen = centre();
    check(
      paused,
      `pool: the editor (StrictMode) shows an added video clip's exact frame paused (centre ${seen?.map(Math.round).join('/')}, want ${want.join('/')})`,
    );
    // npm test's window is hidden, where Chromium runs animation frames (the stage's playback ticks) about once a
    // second. A tick draws the frame the pool has ready for its time and holds the last one otherwise; ticks a second
    // apart always find the pool's reader a second behind, so the picture would stay put. Between ticks this asks the
    // pool for the playing time at 30 fps, as a shown window's ticks do (AC-5 in CHITTHI_TEST_ONLY=pooltiming plays in
    // one). Until 204 T034 the clip's <video>, playing for its sound, redrew the stage on its seek events, which hid this.
    const { liveStages, poolClip } = await import('@/components/studio/previewFrame');
    const pool = [...liveStages].at(0)?.pool;
    const startWall = performance.now();
    let feeding = true;
    const isFeeding = () => feeding;
    void (async () => {
      while (isFeeding() && pool) {
        pool.peek(poolClip(added), added.in + 0.5 + (performance.now() - startWall) / 1000);
        await sleep(33);
      }
    })();
    video.setPlaying(true);
    const moved = await waitFor(() => video.getVideo().playing && frameOf(centre()) > 15, 5000);
    feeding = false;
    const playing = frameOf(centre()),
      at = video.getVideo().t - added.start;
    video.setPlaying(false);
    check(
      moved,
      `pool: the editor (StrictMode) shows the video moving while it plays (frame ${playing} at ${at.toFixed(2)} s, from frame 15)`,
    );
  } finally {
    video.setPlaying(false);
    for (const id of ids) video.removeClip(id);
    root.unmount();
    host.remove();
  }
  return 'pool: the editor stage (StrictMode) shows and plays an added clip';
}

/** The note a clip the pool can't decode carries (the app writes ’; either apostrophe passes), with its reason. */
const NOTE = /This clip can[’']t be exported here: \S/;

/**
 * AC-14 (204 §7, Q6) on the real editor (StrictMode, as `npm run dev`): two copies of a frame-coded clip, one refused
 * by the decoder's source as if its codec couldn't be decoded (frameSource.ts `refuseDecodingForTests`: what an HEVC
 * file the browser can play but WebCodecs can't decode meets). The refused clip previews from its <video>, the other
 * from the pool; the refused one carries the note (timeline title and accessible name, inspector), the preview logs
 * it, and the export refuses it naming the file.
 * @param check records a check
 * @returns a note for the report
 */
async function fallbackOnTheEditor(check: Check): Promise<string> {
  const React = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { VideoWorkspace } = await import('@/components/studio/VideoWorkspace');
  const { liveStages } = await import('@/components/studio/previewFrame');
  // The video store and the actions these checks use.
  const video = {
    ...(await import('@/state/videoStore')),
    ...(await import('@/state/videoTracks')),
    ...(await import('@/state/videoClips')),
    ...(await import('@/state/videoBox')),
    ...(await import('@/state/videoMedia')),
  };
  const { refuseDecodingForTests, allowDecodingForTests, openFrames } = await import('@/engine/frameSource');
  const { recentErrors } = await import('@/lib/errors');
  const { encodeVideo, ExportError } = await import('@/engine/videoExport');
  const blob = await makeTestClip(2, 640, 360, 1, false, true);
  if (!blob) return 'pool: fallback check skipped (no H.264 encoder)';
  // Two files with the same frames: the source refuses the first, as it would an HEVC file the browser can play.
  const bad = new File([blob], 'cant-decode-here.mp4', { type: 'video/mp4' });
  const good = new File([blob], 'decodes-fine.mp4', { type: 'video/mp4' });
  refuseDecodingForTests(bad);
  const since = new Date().toISOString();
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#fff';
  document.body.append(host);
  const root = createRoot(host);
  root.render(
    React.createElement(
      React.StrictMode,
      null,
      React.createElement(VideoWorkspace, { mode: 'vlog', onMode: () => undefined }),
    ),
  );
  const centre = () => {
    const canvas = host.querySelector<HTMLCanvasElement>('canvas.mst-canvas');
    const x = canvas?.getContext('2d', { willReadFrequently: true });
    if (!canvas || !x || !canvas.width) return null;
    return meanRgb(x.getImageData(Math.floor(canvas.width / 2) - 4, Math.floor(canvas.height / 2) - 4, 8, 8).data);
  };
  // The coded frame on the stage (codeColour, ±10), or -1.
  const shown = () => {
    const colour = centre();
    return colour
      ? (Array.from({ length: 60 }, (_, index) => index).find((index) =>
          codeColour(index).every((wanted, channelIndex) => Math.abs(wanted - (colour.at(channelIndex) ?? NaN)) <= 10),
        ) ?? -1)
      : -1;
  };
  const waitFor = async (ok: () => boolean, ms: number) => {
    const end = performance.now() + ms;
    while (!ok() && performance.now() < end) await sleep(16);
    return ok();
  };
  let ids: string[] = [];
  try {
    await sleep(300);
    video.setVideoOptions({ fadeOut: false });
    const before = new Set(video.getVideo().clips.map((clip) => clip.id));
    await video.addMedia([bad, good].map((file) => ({ name: file.name, blob: file, type: file.type })));
    const added = video.getVideo().clips.filter((clip) => !before.has(clip.id));
    ids = added.map((clip) => clip.id);
    const cb = added.find((clip) => clip.file === bad),
      cg = added.find((clip) => clip.file === good);
    if (!cb || !cg) throw new Error(`both clips added (${added.map((clip) => clip.name).join(', ')})`);

    // The refused clip from its <video> (frame 30, mid-frame so a <video> seek can't land a frame off), the other
    // from the pool (frame 15, with frames decoded by the pool).
    video.setPlayhead(cb.start + 30.5 / FPS);
    const badShown = await waitFor(() => shown() === 30, 5000);
    const pool = [...liveStages][0]?.pool;
    const reason = pool?.fallback(cb.id) ?? null;
    check(
      badShown && !!reason,
      `pool: a clip the pool can't decode previews from its <video> (frame ${shown()}, want 30; the pool's reason: ${reason}) (AC-14)`,
    );
    const made = openFrames().made;
    video.setPlayhead(cg.start + 15.5 / FPS);
    const goodShown = await waitFor(() => shown() === 15, 5000);
    check(
      goodShown && !!pool && pool.fallback(cg.id) === null && openFrames().made > made,
      `pool: the other clip still previews from the pool (frame ${shown()}, want 15; ${openFrames().made - made} frames decoded; its fallback: ${pool?.fallback(cg.id)}) (AC-14)`,
    );

    // The note: on the timeline clip (title and accessible name) and in the inspector; the other clip has none.
    video.selectClip(cb.id);
    await waitFor(() => NOTE.test(host.querySelector('aside.mst-inspector')?.textContent ?? ''), 1000);
    const block = (name: string) =>
      [...host.querySelectorAll<HTMLElement>('.tl-clip')].find((el) => el.title.startsWith(name));
    const label = (el?: HTMLElement) => el?.querySelector('button.vh')?.getAttribute('aria-label') ?? '';
    const bb = block(bad.name),
      gb = block(good.name);
    const inspector = host.querySelector('aside.mst-inspector')?.textContent ?? '';
    check(
      !!bb && NOTE.test(bb.title) && NOTE.test(label(bb)),
      `pool: the clip says "This clip can’t be exported here: <reason>" in its timeline title and accessible name (title "${bb?.title}", name "${label(bb)}") (AC-14)`,
    );
    check(
      NOTE.test(inspector),
      `pool: the inspector says the selected clip can’t be exported here, with the reason ("${inspector.slice(0, 160)}") (AC-14)`,
    );
    check(
      !!gb && !NOTE.test(gb.title) && !NOTE.test(label(gb)),
      `pool: a clip the pool decodes has no such note (title "${gb?.title}", name "${label(gb)}") (AC-14)`,
    );

    // Logged for reports by the preview (the export below hasn't run yet).
    const logged = recentErrors().filter(
      (entry) => entry.when >= since && entry.source === 'handled' && entry.message.includes(bad.name),
    );
    check(
      logged.length > 0,
      `pool: the preview logs the clip it can't decode with logError('handled') (${logged.length} entries naming ${bad.name}) (AC-14)`,
    );

    // The export refuses it with today's message, naming the file.
    let refusal: unknown = null;
    try {
      await encodeVideo({
        ...video.projectOf(video.getVideo()),
        audio: [],
        width: 640,
        height: 360,
        fps: FPS,
        bitrate: 2e6,
        sink: { kind: 'memory' },
      });
    } catch (error) {
      refusal = error;
    }
    const refusalNote = refusal instanceof Error ? `${refusal.constructor.name}: ${refusal.message}` : 'it exported';
    check(
      refusal instanceof ExportError && refusal.message.includes(bad.name),
      `pool: the export refuses the clip, naming the file (${refusalNote}) (AC-14)`,
    );
  } finally {
    allowDecodingForTests(bad);
    video.setPlaying(false);
    for (const id of ids) video.removeClip(id);
    root.unmount();
    host.remove();
  }
  return 'pool: AC-14 on the editor (StrictMode), one clip refused by the decoder';
}
