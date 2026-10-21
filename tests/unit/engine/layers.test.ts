import { describe, expect, it } from 'vitest';
import { shapeDef, TEXT_STYLES } from '@/data/layers';
import {
  activeAt,
  addStroke,
  BLEND_MODES,
  layerName,
  moveLayer,
  newImageLayer,
  newShape,
  newSticker,
  newText,
  scaleLayer,
  type DrawLayer,
  type ShapeLayer,
  type TextLayer,
} from '@/engine/layers';
import { hitLayer, rotationFor, toLocal } from '@/engine/layerPick';
import { layerMasked } from '@/engine/layerDraw';
import { mergeLayers } from '@/engine/layerGate';
import { newPart } from '@/engine/masks';
import { DEFAULT_EDIT } from '@/engine/instagram';
import { MAIN_VIDEO, defaultTracks } from '@/engine/tracks';
import { clipLength, framePlan, frameRange, pack, projectLength, videoAt } from '@/engine/timeline';
import { V_FADE, fadeAmount, motionEdit } from '@/engine/video';
import { defined } from '../../support/defined';

describe('layers', () => {
  it('scale about their centre, with their text sizes, within limits', () => {
    const layer = newText(TEXT_STYLES[0]);
    const big = scaleLayer(layer, 2);
    expect(big.w).toBeCloseTo(layer.w * 2);
    expect(big.size).toBeCloseTo(layer.size * 2);
    expect([big.x, big.y]).toEqual([layer.x, layer.y]);
    const shapeLayer = newShape('bubble');
    const small = scaleLayer(shapeLayer, 0.5);
    expect(small.h).toBeCloseTo(shapeLayer.h / 2);
    expect(small.textSize).toBeCloseTo(shapeLayer.textSize / 2);
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
    const second = { cx: 0, cy: 0, w: 10, h: 10, rot: 0 };
    expect(rotationFor(second, 0, -50)).toBe(0); // straight up = no turn
    expect(rotationFor(second, 50, 2)).toBe(90); // within 4° of 90 snaps
    expect(rotationFor(second, 50, 30)).toBeCloseTo(121, 0);
  });

  it('show on video only between their start and end, and never when hidden', () => {
    const sticker = { ...newSticker('⭐'), start: 2, end: 5 };
    expect(activeAt(sticker)).toBe(true);
    expect([activeAt(sticker, 1.9), activeAt(sticker, 2), activeAt(sticker, 4.9), activeAt(sticker, 5)]).toEqual([
      false,
      true,
      true,
      false,
    ]);
    expect(activeAt({ ...sticker, hidden: true }, 3)).toBe(false);
  });

  it('fit a drawing around its strokes and keep earlier strokes in place', () => {
    const width = 1000,
      height = 2000;
    const layer = defined(addStroke(null, [100, 200, 300, 200], 'pen', '#fff', width, height, 10));
    expect(layer.w).toBeCloseTo(0.21); // 200 px + the line width, in frame widths
    expect(layer.x).toBeCloseTo(0.2);
    expect(layer.y).toBeCloseTo(0.1);
    const drawLayer = defined(addStroke(layer, [500, 800, 500, 900], 'pen', '#000', width, height, 10));
    expect(drawLayer.id).toBe(layer.id);
    expect(drawLayer.strokes).toHaveLength(2);
    // The first stroke's first point is still at (100, 200) px.
    const stroke = drawLayer.strokes[0];
    expect(drawLayer.x * width + stroke.pts[0] * drawLayer.w * width).toBeCloseTo(100);
    expect(drawLayer.y * height + stroke.pts[1] * drawLayer.h * width).toBeCloseTo(200);
    // A turned drawing takes no more strokes.
    expect(addStroke({ ...drawLayer, rot: 30 }, [0, 0, 1, 1], 'pen', '#000', width, height)).toBeNull();
  });
});

describe('image layers, blend modes and layer masks', () => {
  const ctx = {} as CanvasRenderingContext2D;
  it('an image layer keeps the proportions of its picture, also when scaled', () => {
    const layer = newImageLayer('img1', 800, 400, 'logo');
    expect(layer.h / layer.w).toBeCloseTo(0.5, 9);
    const big = scaleLayer(layer, 1.5);
    expect(big.h / big.w).toBeCloseTo(0.5, 9);
    expect(big.w).toBeCloseTo(layer.w * 1.5, 9);
    expect(layerName(layer)).toBe('Image: logo');
  });
  it('is hit inside its box, turned with it, and not outside', () => {
    // 0.34 of a 1000 px frame wide, half as tall: 340 × 170 around the centre; turned a quarter it stands up.
    const image = { ...newImageLayer('img1', 800, 400, 'logo'), rot: 90 };
    expect(hitLayer(ctx, [image], 500, 500 - 160, 1000, 1000, 0)).toBe(image);
    expect(hitLayer(ctx, [image], 500 - 160, 500, 1000, 1000, 0)).toBeNull();
    expect(hitLayer(ctx, [{ ...image, rot: 0 }], 500 - 160, 500, 1000, 1000, 0)).not.toBeNull();
  });
  it('offer the blend modes Canvas 2D has, normal first', () => {
    expect(BLEND_MODES[0][0]).toBe('normal');
    expect(new Set(BLEND_MODES.map(([message]) => message)).size).toBe(16);
  });
  it('count as masked only with parts or an invert', () => {
    const layer = newText(TEXT_STYLES[0]);
    expect(layerMasked(layer)).toBe(false);
    expect(layerMasked({ ...layer, mask: { invert: false, parts: [] } })).toBe(false);
    expect(layerMasked({ ...layer, mask: { invert: true, parts: [] } })).toBe(true);
    expect(layerMasked({ ...layer, mask: { invert: false, parts: [newPart('linear')] } })).toBe(true);
  });
});

describe('video timeline', () => {
  const clips = pack([
    { id: 'a', track: MAIN_VIDEO, start: 0, kind: 'photo' as const, dur: 3, in: 0, out: 0 },
    { id: 'b', track: MAIN_VIDEO, start: 0, kind: 'video' as const, dur: 0, in: 2, out: 6.5 },
    { id: 'c', track: MAIN_VIDEO, start: 0, kind: 'photo' as const, dur: 1.5, in: 0, out: 0 },
  ]);
  const fixture = { tracks: defaultTracks(), clips, audio: [], layers: [], fadeOut: false };
  it('places clips end to end', () => {
    expect(clips.map((clip) => [clip.start, clip.start + clipLength(clip)])).toEqual([
      [0, 3],
      [3, 7.5],
      [7.5, 9],
    ]);
    expect(projectLength(fixture)).toBe(9);
    expect(clipLength(clips[1])).toBe(4.5);
  });
  it('finds the clip at a time, clamping past the ends', () => {
    expect(videoAt(fixture, 0)?.clip.id).toBe('a');
    expect(videoAt(fixture, 3)?.clip.id).toBe('b');
    expect(videoAt(fixture, 8.99)?.clip.id).toBe('c');
    expect(videoAt(fixture, 50)?.clip.id).toBe('c');
    expect(videoAt(fixture, -1)?.clip.id).toBe('a');
    expect(videoAt({ ...fixture, clips: [] }, 1)).toBeNull();
  });
  it('gives every frame to exactly one clip', () => {
    const ranges = framePlan(fixture, 30).map((span) => [span.f0, span.f1]);
    expect(ranges[0][0]).toBe(0);
    for (let index = 1; index < ranges.length; index++) expect(ranges[index][0]).toBe(ranges[index - 1][1]);
    expect(ranges.at(-1)?.[1]).toBe(270); // 9 s × 30 fps
    expect(frameRange(3, 7.5, 30)).toEqual([90, 225]);
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
    const { formatsFor } = await import('@/engine/videoFormats');
    expect(formatsFor('reel').map((format) => format.ratio)).toEqual(['9:16', '4:5', '1:1']);
    const yt = formatsFor('vlog');
    expect(yt.every((format) => Math.abs(format.w / format.h - 16 / 9) < 0.01)).toBe(true);
    expect(yt.filter((format) => format.desktopOnly).map((format) => format.h)).toEqual([1440, 2160]);
  });
  it('uses YouTube’s recommended bitrates, more at 60 fps and for high quality', async () => {
    const { bitrateFor, vFormat } = await import('@/engine/videoFormats');
    const hd = vFormat('yt1080');
    expect(bitrateFor(hd, 30, 'standard')).toBe(8e6);
    expect(bitrateFor(hd, 60, 'standard')).toBe(12e6);
    expect(bitrateFor(hd, 30, 'high')).toBe(12e6);
    expect(bitrateFor(vFormat('reel'), 30, 'standard')).toBe(5e6);
  });
  it('gives the desktop app longer videos, more clips, bigger files and 60 fps', async () => {
    const { limitsFor } = await import('@/engine/videoFormats');
    const web = limitsFor('vlog', false),
      desk = limitsFor('vlog', true);
    expect(web.seconds).toBe(15 * 60);
    expect(desk.seconds).toBe(3 * 3600);
    expect(desk.clips).toBeGreaterThan(web.clips);
    expect(desk.fileMB).toBeGreaterThan(web.fileMB);
    expect([web.fps, desk.fps]).toEqual([[30], [30, 60]]);
    expect(limitsFor('reel', false)).toMatchObject({ seconds: 90, minSeconds: 3, clips: 20 });
  });
  it('sets the videos on screen at once by 204 Q2 (largest count meeting the bar minus one, web ≤ 3, desktop ≤ 6, never < 2) and 1 without VideoDecoder', async () => {
    const { limitsFor } = await import('@/engine/videoFormats');
    for (const kind of ['reel', 'vlog'] as const) {
      expect(limitsFor(kind, false, true).videosAtOnce).toBe(3);
      expect(limitsFor(kind, true, true).videosAtOnce).toBe(5);
      // No VideoDecoder (older browsers): no pool, one video at a time (Q7).
      expect(limitsFor(kind, false, false).videosAtOnce).toBe(1);
      expect(limitsFor(kind, true, false).videosAtOnce).toBe(1);
    }
  });
});

describe('mergeLayers: the gate for layers from project files', () => {
  const draw: DrawLayer = {
    id: 'ld1',
    kind: 'draw',
    x: 0.4,
    y: 0.6,
    w: 0.5,
    h: 0.3,
    rot: 12,
    opacity: 0.8,
    strokes: [{ brush: 'neon', color: '#ff6b35', width: 0.05, pts: [-0.4, -0.2, 0, 0.1, 0.3, 0.25] }],
  };
  const every = () => [
    { ...newText(TEXT_STYLES[1], 'Diwali'), blend: 'screen' as const, start: 1, end: 4.5 },
    { ...newShape('bubble'), mask: { invert: true, parts: [{ ...newPart('linear'), x: 0.5, y: 0.5 }] } },
    newSticker('🪔'),
    draw,
    newImageLayer('img1', 400, 200, 'logo.png'),
  ];
  const roundTrip = (value: unknown) => mergeLayers(JSON.parse(JSON.stringify(value)), new Set(['img1']));

  it('keeps every kind of valid layer exactly', () => {
    const layers = every();
    expect(roundTrip(layers)).toEqual(layers);
  });

  it('reads anything without throwing, and only arrays of objects', () => {
    for (const value of [null, undefined, 1, 'x', {}, [null, 3, 'a', [], { kind: 'nope' }]])
      expect(mergeLayers(value)).toEqual([]);
  });

  it('clamps numbers and replaces bad values with defaults', () => {
    const [layer] = roundTrip([
      {
        ...newText(TEXT_STYLES[0]),
        x: 99,
        y: -99,
        w: 0,
        rot: 9999,
        opacity: 7,
        size: 'big',
        color: 'red',
        align: 'up',
        bold: 'yes',
        start: -3,
        end: Infinity,
      },
    ]) as TextLayer[];
    expect(layer.x).toBeLessThanOrEqual(1.5);
    expect(layer.y).toBeGreaterThanOrEqual(-0.5);
    expect(layer.w).toBeGreaterThan(0);
    expect(Math.abs(layer.rot)).toBeLessThanOrEqual(360);
    expect(layer.opacity).toBe(1);
    expect(layer.size).toBe(0.08);
    expect(layer.color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(layer.align).toBe('center');
    expect(layer.bold).toBe(false);
    expect(layer.start).toBeUndefined();
    expect(layer.end).toBeUndefined();
  });

  it('keeps times only when they make sense', () => {
    const at = (start: unknown, end: unknown) => roundTrip([{ ...newSticker('⭐'), start, end }])[0];
    expect(at(2, 5)).toMatchObject({ start: 2, end: 5 });
    expect(at(5, 2).end).toBeUndefined();
    expect([at(NaN, 'x').start, at(NaN, 'x').end]).toEqual([undefined, undefined]);
  });

  it('drops unknown kinds, unknown shapes and brushes become defaults, and limits text and drawings', () => {
    const out = roundTrip([
      { kind: 'video', id: 'a' },
      { ...newShape('star'), shape: 'hexagon', fill: 'blue', stroke: '#zzzzzz', strokeW: -1 },
      { ...newText(TEXT_STYLES[0]), text: 'x'.repeat(5000) },
      {
        ...draw,
        strokes: Array.from({ length: 500 }, () => ({
          brush: 'crayon',
          color: '#000000',
          width: 0.01,
          pts: [0, 0, 0.1, 0.1],
        })),
      },
      {
        ...draw,
        id: 'ld2',
        strokes: [
          { brush: 'pen', color: '#000000', width: 0.01, pts: [0, 0, NaN, 1] },
          { brush: 'pen', color: '#000', width: 0.01, pts: [0, 0, 1] },
        ],
      },
    ]);
    expect(out.map((decoded) => decoded.kind)).toEqual(['shape', 'text', 'draw', 'draw']);
    const layer = out[0] as ShapeLayer;
    expect([layer.shape, layer.fill, layer.stroke, layer.strokeW]).toEqual(['rect', '', '', 0]);
    expect((out[1] as TextLayer).text).toHaveLength(2000);
    expect((out[2] as DrawLayer).strokes).toHaveLength(400);
    expect((out[2] as DrawLayer).strokes[0].brush).toBe('pen');
    expect((out[3] as DrawLayer).strokes).toEqual([]);
  });

  it('image layers need a picture the project has', () => {
    const img = newImageLayer('img1', 100, 100, 'a.png');
    expect(mergeLayers([img], new Set())).toEqual([]);
    expect(mergeLayers([{ ...img, image: '../../etc' }], new Set(['../../etc']))).toEqual([]);
    expect(mergeLayers([img], new Set(['img1']))).toEqual([img]);
  });

  it('masks keep only gradient parts, and ids stay unique', () => {
    const shape = {
      ...newShape('rect'),
      id: 'same',
      mask: { invert: false, parts: [newPart('brush'), { ...newPart('radial'), rx: 9 }, newPart('colour')] },
    };
    const out = roundTrip([shape, { ...newSticker('🎉'), id: 'same' }, { ...newSticker('🎉'), id: '<script>' }]);
    expect((out[0] as ShapeLayer).mask?.parts.map((part) => part.kind)).toEqual(['radial']);
    expect(new Set(out.map((layer) => layer.id)).size).toBe(3);
    expect(out[0].id).toBe('same');
    expect(out.every((layer) => /^[A-Za-z0-9_-]{1,40}$/.test(layer.id))).toBe(true);
  });

  it('holds at most 100 layers', () => {
    expect(mergeLayers(Array.from({ length: 150 }, () => newSticker('✨')))).toHaveLength(100);
  });
});

describe('506: whole names and moving a layer to a place', () => {
  const long = 'A'.repeat(80);
  it('names keep the whole first line (the list shortens them on screen)', () => {
    expect(layerName({ ...newText(TEXT_STYLES[0]), text: `${long}\nsecond line` })).toBe(`Text: ${long}`);
    expect(layerName({ ...newShape('bubble'), text: long })).toBe(`${shapeDef('bubble').name}: ${long}`);
    expect(layerName(newImageLayer('img1', 10, 10, long))).toBe(`Image: ${long}`);
  });
  const stack = ['a', 'b', 'c', 'd'].map((id) => ({ ...newSticker('✨'), id }));
  const ids = (layers: readonly { id: string }[]) => layers.map((layer) => layer.id).join('');
  it('moves a layer to a stack index, keeping the others in order', () => {
    expect(ids(moveLayer(stack, 'a', 3))).toBe('bcda');
    expect(ids(moveLayer(stack, 'd', 0))).toBe('dabc');
    expect(ids(moveLayer(stack, 'b', 2))).toBe('acbd');
    expect(ids(stack)).toBe('abcd');
  });
  it('clamps the index and gives the same array back when nothing moves', () => {
    expect(ids(moveLayer(stack, 'a', 99))).toBe('bcda');
    expect(ids(moveLayer(stack, 'd', -5))).toBe('dabc');
    expect(moveLayer(stack, 'b', 1)).toBe(stack);
    expect(moveLayer(stack, 'zz', 0)).toBe(stack);
  });
});
