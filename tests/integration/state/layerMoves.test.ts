import { beforeEach, describe, expect, it } from 'vitest';
import { newSticker, type Layer } from '@/engine/layers';
import { DEFAULT_EDIT } from '@/engine/instagram';
import { getIg, loadPhotoBatch, selectLayer, undo, type IgItem } from '@/state/instagram';
import { moveLayerTo } from '@/state/instagramLayers';
import { getVideo, loadVideoProject, selectVLayer, undoV } from '@/state/videoStore';
import { moveVLayerTo } from '@/state/videoLayers';

/*
 * 506: moving a layer to a place in the stack (dragging a row, Alt + ↑/↓) in the photo and video editors.
 */

/**
 * Four stickers.
 * @returns a, b, c, d, back first
 */
const stack = (): Layer[] => ['a', 'b', 'c', 'd'].map((id) => ({ ...newSticker('✨'), id }));

/**
 * The layers' ids, back first.
 * @param layers the layers
 * @returns such as "abcd"
 */
const ids = (layers: readonly Layer[]): string => layers.map((layer) => layer.id).join('');

/**
 * A photo with the four layers (its preview is never drawn here).
 * @returns the photo
 */
const photo = (): IgItem => ({
  id: 'p',
  name: 'p.jpg',
  file: new Blob(['p']),
  w: 10,
  h: 10,
  preview: {} as HTMLCanvasElement,
  edit: { ...DEFAULT_EDIT },
  layers: stack(),
});

/**
 * The photo's layers.
 * @returns them, back first
 */
const photoLayers = (): Layer[] => getIg().items.at(0)?.layers ?? [];

describe('506: moveLayerTo (photo)', () => {
  beforeEach(() => {
    loadPhotoBatch({ ...getIg(), items: [photo()], selected: 'p' });
    selectLayer('a');
  });
  it('moves a layer in one undo step and keeps the selection', () => {
    moveLayerTo('p', 'a', 3);
    expect(ids(photoLayers())).toBe('bcda');
    expect(getIg().layerSel).toBe('a');
    expect(getIg().canUndo).toBe(true);
    undo();
    expect(ids(photoLayers())).toBe('abcd');
    expect(getIg().canUndo).toBe(false);
  });
  it('adds no undo step when the layer is already there', () => {
    moveLayerTo('p', 'b', 1);
    moveLayerTo('p', 'zz', 0);
    expect(ids(photoLayers())).toBe('abcd');
    expect(getIg().canUndo).toBe(false);
  });
});

describe('506: moveVLayerTo (video)', () => {
  beforeEach(() => {
    loadVideoProject({ clips: [], layers: stack() });
    selectVLayer('d');
  });
  it('moves a layer in one undo step and keeps the selection', () => {
    moveVLayerTo('d', 0);
    expect(ids(getVideo().layers)).toBe('dabc');
    expect(getVideo().layerSel).toBe('d');
    undoV();
    expect(ids(getVideo().layers)).toBe('abcd');
    expect(getVideo().canUndo).toBe(false);
  });
  it('adds no undo step when the layer is already there', () => {
    moveVLayerTo('c', 2);
    expect(getVideo().canUndo).toBe(false);
  });
});
