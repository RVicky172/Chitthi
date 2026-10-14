import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_EDIT } from '@/engine/instagram';
import { IDENTITY } from '@/engine/timeline';
import { V_FADE, renderStack, type StackDraw } from '@/engine/video';
import { recordingCanvas } from '../../support/recordingCanvas';

/* ---------- 407 T032: renderStack's steps for one clip (pixels are the self-test's and 290's golden frames) ---------- */

const FRAME_WIDTH = 100;
const FRAME_HEIGHT = 200;

/**
 * A photo clip of the stack with a picture, at `local` seconds into it.
 * @param overrides the clip's fields to change
 * @param local seconds into the clip
 * @returns the stack item
 */
function photoItem(overrides: Partial<StackDraw['clip']>, local: number): StackDraw {
  const logs = new Map<string, string[]>();
  return {
    clip: { kind: 'photo', dur: 4, in: 0, out: 0, edit: DEFAULT_EDIT, motion: 'none', fade: false, overlay: false, ...overrides },
    src: recordingCanvas('picture', logs).canvas as unknown as CanvasImageSource,
    sw: 10,
    sh: 20,
    local,
  };
}

/**
 * Draws a stack on a recording canvas, scratch canvases recorded too.
 * @param items the stack
 * @param time the project time, seconds
 * @param fadeOut whether the video fades out
 * @returns each canvas's log, by name ('main' is the frame)
 */
function draw(items: StackDraw[], time = 1, fadeOut = false): Map<string, string[]> {
  const logs = new Map<string, string[]>();
  let scratches = 0;
  vi.stubGlobal('document', { createElement: () => recordingCanvas(`scratch${String(++scratches)}`, logs).canvas });
  const main = recordingCanvas('main', logs);
  renderStack(main.context, FRAME_WIDTH, FRAME_HEIGHT, items, [], time, 4, fadeOut);
  return logs;
}

const mainLog = (logs: Map<string, string[]>) => logs.get('main') ?? [];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('renderStack for one clip', () => {
  it('draws a clip at the identity in place, over black, with no scratch canvas', () => {
    const logs = draw([photoItem({ tf: { ...IDENTITY } }, 1)]);
    expect(mainLog(logs).slice(0, 2)).toEqual(['fillStyle=#000000', `fillRect(0,0,${String(FRAME_WIDTH)},${String(FRAME_HEIGHT)})`]);
    expect([...logs.keys()]).toEqual(['main']);
    expect(mainLog(logs)).not.toContain('clip()');
  });

  it('lays an overlay fading in through a scratch canvas at its fade-in alpha (D2)', () => {
    const logs = draw([photoItem({ overlay: true, fade: true }, V_FADE / 4)]);
    const laid = mainLog(logs).filter((line) => /^(globalAlpha|drawImage)/.test(line));
    expect(laid).toEqual(['globalAlpha=0.25', expect.stringMatching(/^drawImage\(scratch\d,0,0\)$/)]);
  });

  it('draws a box at its own opacity in place, clipped to its box', () => {
    const logs = draw([photoItem({ overlay: true, tf: { ...IDENTITY, w: 0.5, opacity: 1 } }, 1)]);
    expect(mainLog(logs)).toEqual(expect.arrayContaining(['globalAlpha=1', 'translate(50,100)', 'clip()', 'scale(0.5,0.5)']));
  });

  it('darkens the whole frame for the main clip’s fade-in and the video’s fade-out, after the layers', () => {
    const fadingIn = mainLog(draw([photoItem({ fade: true }, V_FADE / 2)]));
    expect(fadingIn.at(-2)).toBe('fillStyle=rgba(0,0,0,0.5)');
    const fadingOut = mainLog(draw([photoItem({}, 1)], 4 - V_FADE / 4, true));
    expect(fadingOut.at(-2)).toBe('fillStyle=rgba(0,0,0,0.75)');
    const plain = mainLog(draw([photoItem({}, 1)]));
    expect(plain.some((line) => line.startsWith('fillStyle=rgba'))).toBe(false);
  });
});
