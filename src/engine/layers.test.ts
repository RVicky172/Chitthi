import { describe, expect, it } from 'vitest';
import { TEXT_STYLES } from '../data/layers';
import { activeAt, addStroke, BLEND_MODES, hitLayer, layerMasked, layerName, newImageLayer, newShape, newSticker, newText, rotationFor, scaleLayer, toLocal, type DrawLayer } from './layers';
import { newPart } from './masks';
import { DEFAULT_EDIT } from './instagram';
import { V_FADE, clipAt, clipLength, fadeAmount, frameRange, motionEdit, timeline, totalLength } from './video';

describe('layers', () => {
  it('scale about their centre, with their text sizes, within limits', () => {
    const t = newText(TEXT_STYLES[0]);
    const big = scaleLayer(t, 2);
    expect(big.w).toBeCloseTo(t.w * 2);
    expect(big.size).toBeCloseTo(t.size * 2);
    expect([big.x, big.y]).toEqual([t.x, t.y]);
    const s = newShape('bubble');
    const small = scaleLayer(s, 0.5);
    expect(small.h).toBeCloseTo(s.h / 2);
    expect(small.textSize).toBeCloseTo(s.textSize / 2);
    // Never smaller than 3% or wider than 3 frames.
    expect(scaleLayer(newSticker('🎉'), 0.0001).w).toBeCloseTo(0.03);
    expect(scaleLayer(newSticker('🎉'), 1000).w).toBeCloseTo(3);
  });

  it('turn into local coordinates around a rotated centre', () => {
    const [x, y] = toLocal({ cx: 100, cy: 100, w: 50, h: 20, rot: Math.PI / 2 }, 100, 130);
    expect(x).toBeCloseTo(30);
    expect(y).toBeCloseTo(0);
  });

  it('rotate to the pointer, snapping to right angles', () => {
    const b = { cx: 0, cy: 0, w: 10, h: 10, rot: 0 };
    expect(rotationFor(b, 0, -50)).toBe(0); // straight up = no turn
    expect(rotationFor(b, 50, 2)).toBe(90); // within 4° of 90 snaps
    expect(rotationFor(b, 50, 30)).toBeCloseTo(121, 0);
  });

  it('show on video only between their start and end, and never when hidden', () => {
    const l = { ...newSticker('⭐'), start: 2, end: 5 };
    expect(activeAt(l)).toBe(true);
    expect([activeAt(l, 1.9), activeAt(l, 2), activeAt(l, 4.9), activeAt(l, 5)]).toEqual([false, true, true, false]);
    expect(activeAt({ ...l, hidden: true }, 3)).toBe(false);
  });

  it('fit a drawing around its strokes and keep earlier strokes in place', () => {
    const W = 1000,
      H = 2000;
    const a = addStroke(null, [100, 200, 300, 200], 'pen', '#fff', W, H, 10) as DrawLayer;
    expect(a.w).toBeCloseTo(0.21); // 200 px + the line width, in frame widths
    expect(a.x).toBeCloseTo(0.2);
    expect(a.y).toBeCloseTo(0.1);
    const b = addStroke(a, [500, 800, 500, 900], 'pen', '#000', W, H, 10) as DrawLayer;
    expect(b.id).toBe(a.id);
    expect(b.strokes).toHaveLength(2);
    // The first stroke's first point is still at (100, 200) px.
    const s = b.strokes[0];
    expect(b.x * W + s.pts[0] * b.w * W).toBeCloseTo(100);
    expect(b.y * H + s.pts[1] * b.h * W).toBeCloseTo(200);
    // A turned drawing takes no more strokes.
    expect(addStroke({ ...b, rot: 30 }, [0, 0, 1, 1], 'pen', '#000', W, H)).toBeNull();
  });
});

describe('image layers, blend modes and layer masks', () => {
  const ctx = {} as CanvasRenderingContext2D;
  it('an image layer keeps the proportions of its picture, also when scaled', () => {
    const l = newImageLayer('img1', 800, 400, 'logo');
    expect(l.h / l.w).toBeCloseTo(0.5, 9);
    const big = scaleLayer(l, 1.5);
    expect(big.h / big.w).toBeCloseTo(0.5, 9);
    expect(big.w).toBeCloseTo(l.w * 1.5, 9);
    expect(layerName(l)).toBe('Image: logo');
  });
  it('is hit inside its box, turned with it, and not outside', () => {
    // 0.34 of a 1000 px frame wide, half as tall: 340 × 170 around the centre; turned a quarter it stands up.
    const l = { ...newImageLayer('img1', 800, 400, 'logo'), rot: 90 };
    expect(hitLayer(ctx, [l], 500, 500 - 160, 1000, 1000, 0)).toBe(l);
    expect(hitLayer(ctx, [l], 500 - 160, 500, 1000, 1000, 0)).toBeNull();
    expect(hitLayer(ctx, [{ ...l, rot: 0 }], 500 - 160, 500, 1000, 1000, 0)).not.toBeNull();
  });
  it('offer the blend modes Canvas 2D has, normal first', () => {
    expect(BLEND_MODES[0][0]).toBe('normal');
    expect(new Set(BLEND_MODES.map(([m]) => m)).size).toBe(16);
  });
  it('count as masked only with parts or an invert', () => {
    const t = newText(TEXT_STYLES[0]);
    expect(layerMasked(t)).toBe(false);
    expect(layerMasked({ ...t, mask: { invert: false, parts: [] } })).toBe(false);
    expect(layerMasked({ ...t, mask: { invert: true, parts: [] } })).toBe(true);
    expect(layerMasked({ ...t, mask: { invert: false, parts: [newPart('linear')] } })).toBe(true);
  });
});

describe('video timeline', () => {
  const clips = [
    { kind: 'photo' as const, dur: 3, in: 0, out: 0 },
    { kind: 'video' as const, dur: 0, in: 2, out: 6.5 },
    { kind: 'photo' as const, dur: 1.5, in: 0, out: 0 },
  ];
  it('places clips end to end', () => {
    const tl = timeline(clips);
    expect(tl.map((p) => [p.start, p.end])).toEqual([
      [0, 3],
      [3, 7.5],
      [7.5, 9],
    ]);
    expect(totalLength(clips)).toBe(9);
    expect(clipLength(clips[1])).toBe(4.5);
  });
  it('finds the clip at a time, clamping past the ends', () => {
    const tl = timeline(clips);
    expect(clipAt(tl, 0)?.index).toBe(0);
    expect(clipAt(tl, 3)?.index).toBe(1);
    expect(clipAt(tl, 8.99)?.index).toBe(2);
    expect(clipAt(tl, 50)?.index).toBe(2);
    expect(clipAt(tl, -1)?.index).toBe(0);
    expect(clipAt([], 1)).toBeNull();
  });
  it('gives every frame to exactly one clip', () => {
    const tl = timeline(clips);
    const ranges = tl.map((p) => frameRange(p.start, p.end));
    expect(ranges[0][0]).toBe(0);
    for (let i = 1; i < ranges.length; i++) expect(ranges[i][0]).toBe(ranges[i - 1][1]);
    expect(ranges.at(-1)?.[1]).toBe(270); // 9 s × 30 fps
  });
  it('moves photos smoothly from start to end', () => {
    expect(motionEdit(DEFAULT_EDIT, 'zoom-in', 0).zoom).toBeCloseTo(1);
    expect(motionEdit(DEFAULT_EDIT, 'zoom-in', 1).zoom).toBeCloseTo(1.18);
    expect(motionEdit(DEFAULT_EDIT, 'pan-left', 0).px).toBeCloseTo(1);
    expect(motionEdit(DEFAULT_EDIT, 'pan-left', 1).px).toBeCloseTo(-1);
    expect(motionEdit(DEFAULT_EDIT, 'none', 0.5)).toEqual(DEFAULT_EDIT);
  });
  it('fades in at a clip start and out at the very end', () => {
    expect(fadeAmount(0, true, 0, 9, false)).toBe(1);
    expect(fadeAmount(V_FADE, true, V_FADE, 9, false)).toBe(0);
    expect(fadeAmount(1, false, 1, 9, true)).toBe(0);
    expect(fadeAmount(1, false, 9, 9, true)).toBe(1);
  });
});

describe('video formats and limits', () => {
  it('offers vertical formats for Reels and 16:9 for YouTube, with 1440p and 4K for the desktop app only', async () => {
    const { formatsFor } = await import('./video');
    expect(formatsFor('reel').map((f) => f.ratio)).toEqual(['9:16', '4:5', '1:1']);
    const yt = formatsFor('vlog');
    expect(yt.every((f) => Math.abs(f.w / f.h - 16 / 9) < 0.01)).toBe(true);
    expect(yt.filter((f) => f.desktopOnly).map((f) => f.h)).toEqual([1440, 2160]);
  });
  it('uses YouTube’s recommended bitrates, more at 60 fps and for high quality', async () => {
    const { bitrateFor, vFormat } = await import('./video');
    const hd = vFormat('yt1080');
    expect(bitrateFor(hd, 30, 'standard')).toBe(8e6);
    expect(bitrateFor(hd, 60, 'standard')).toBe(12e6);
    expect(bitrateFor(hd, 30, 'high')).toBe(12e6);
    expect(bitrateFor(vFormat('reel'), 30, 'standard')).toBe(5e6);
  });
  it('gives the desktop app longer videos, more clips, bigger files and 60 fps', async () => {
    const { limitsFor } = await import('./video');
    const web = limitsFor('vlog', false),
      desk = limitsFor('vlog', true);
    expect(web.seconds).toBe(15 * 60);
    expect(desk.seconds).toBe(3 * 3600);
    expect(desk.clips).toBeGreaterThan(web.clips);
    expect(desk.fileMB).toBeGreaterThan(web.fileMB);
    expect([web.fps, desk.fps]).toEqual([[30], [30, 60]]);
    expect(limitsFor('reel', false)).toMatchObject({ seconds: 90, minSeconds: 3, clips: 20 });
  });
});
