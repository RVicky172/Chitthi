import { countKeys, isAnimated, layerAt, LAYER_KEY_PROPS, setKey, shiftKeys, type Keyframes, type LayerKeyProp } from '../engine/keyframes';
import { scaleLayer, type Layer } from '../engine/layers';
import { keyEdit, LAYER_GONE, projectKeyCount } from './videoKeys';
import { change, getVideo } from './videoStore';

/*
 * Layer actions in the video (text, shapes, stickers, drawings over the whole timeline): add, change, remove, restack,
 * change as shown at the playhead (animated values get keys, 205) and when a layer shows. Each is one undo step.
 */

/**
 * Adds a layer and selects it.
 * @param layer the layer
 */
export function addVLayer(layer: Layer): void {
  change(`add:${layer.id}`, { layers: [...getVideo().layers, layer] }, { layerSel: layer.id });
}

/**
 * Changes a layer's stored fields.
 * @param id the layer
 * @param patch the fields, or a function of the layer
 * @param key groups a drag's changes into one step
 */
export function updateVLayer(id: string, patch: Partial<Layer> | ((layer: Layer) => Layer), key = `layer:${id}`): void {
  // A patch of a layer's own kind: the editors build it from the layer they show.
  const changed = (layer: Layer): Layer => (typeof patch === 'function' ? patch(layer) : ({ ...layer, ...patch } as Layer));
  change(key, { layers: getVideo().layers.map((layer) => (layer.id === id ? changed(layer) : layer)) });
}

/**
 * Removes a layer.
 * @param id the layer
 */
export function removeVLayer(id: string): void {
  const video = getVideo();
  change('', { layers: video.layers.filter((layer) => layer.id !== id) }, { layerSel: video.layerSel === id ? null : video.layerSel });
}

/**
 * Moves a layer one place up or down the stack.
 * @param id the layer
 * @param by up (1) or down (-1)
 */
export function restackVLayer(id: string, by: 1 | -1): void {
  const layers = getVideo().layers.slice();
  const index = layers.findIndex((layer) => layer.id === id);
  const moving = layers.at(index);
  const other = layers.at(index + by);
  if (index < 0 || index + by < 0 || !moving || !other) return;
  layers[index] = other;
  layers[index + by] = moving;
  change('', { layers });
}

/**
 * Replaces the layers (the layer panel's own edits).
 * @param layers the layers
 * @param key groups a drag's changes into one step
 * @param layerSel the layer to select (unchanged when not given)
 */
export function setVLayers(layers: Layer[], key = '', layerSel?: string | null): void {
  change(key, { layers }, layerSel === undefined ? {} : { layerSel });
}

/**
 * The stored layer for a change shown at the playhead: animated values keep their stored value and get a key. An
 * animated size scales the whole layer when drawn (layerAt): scaled back to the stored size, what scales with it (a
 * title's font size, a shape's height) is stored as it would be at that size, so it doesn't drift.
 * @param layer the stored layer, animated
 * @param keys its keys
 * @param shown it as shown at the playhead
 * @param next the change, as shown
 * @returns the layer to store, or why not
 */
function keyedLayer(layer: Layer, keys: Keyframes<LayerKeyProp>, shown: Layer, next: Layer): Layer | { error: string } {
  const local = getVideo().t - (layer.start ?? 0);
  const out = isAnimated(layer, 'w') && next.w !== layer.w ? scaleLayer(next, layer.w / next.w) : { ...next };
  let nextKeys = keys;
  for (const prop of LAYER_KEY_PROPS) {
    if (!isAnimated(layer, prop)) continue;
    out[prop] = layer[prop];
    if (next[prop] === shown[prop]) continue;
    const added = setKey(nextKeys, prop, local, next[prop], { ...keyEdit(layer), projectKeys: projectKeyCount() + countKeys(nextKeys) - countKeys(keys) });
    if ('error' in added) return added;
    nextKeys = added;
  }
  out.keys = nextKeys;
  return out;
}

/**
 * Changes a layer as shown at the playhead (`patch`, or a function of the shown layer): animated values get a key at
 * the playhead, the rest change the layer, as `updateVLayer` does.
 * @param id the layer
 * @param patch the fields, or a function of the shown layer
 * @param key groups a drag's changes into one step
 * @returns null, or why not
 */
export function updateLayerAt(id: string, patch: Partial<Layer> | ((shown: Layer) => Layer), key = `layer:${id}`): string | null {
  const video = getVideo();
  const layer = video.layers.find((candidate) => candidate.id === id);
  if (!layer) return LAYER_GONE;
  if (!layer.keys) {
    updateVLayer(id, patch, key);
    return null;
  }
  const shown = layerAt(layer, video.t);
  const next = typeof patch === 'function' ? patch(shown) : ({ ...shown, ...patch } as Layer);
  const out = keyedLayer(layer, layer.keys, shown, next);
  if ('error' in out) return out.error;
  change(key, { layers: getVideo().layers.map((candidate) => (candidate.id === id ? out : candidate)) });
  return null;
}

/** When a layer shows: its start and end, seconds. */
export interface LayerTimes {
  start?: number;
  end?: number;
}

/**
 * Sets when a layer shows (the timeline's layer bar). `start` alone is its start edge: its keys shift back by the
 * move, so they stay at their place on the timeline (AC-3); `start` with `end` moves it whole, keys and all.
 * @param id the layer
 * @param times its start, or start and end
 * @param key groups a drag's changes into one step
 * @returns null, or why not
 */
export function setLayerTimes(id: string, times: LayerTimes, key = ''): string | null {
  const video = getVideo();
  const layer = video.layers.find((candidate) => candidate.id === id);
  if (!layer) return LAYER_GONE;
  const edge = times.start !== undefined && !('end' in times) ? times.start - (layer.start ?? 0) : 0;
  const keys = edge ? shiftKeys(layer.keys, -edge) : layer.keys;
  change(key, { layers: video.layers.map((candidate) => (candidate.id === id ? { ...candidate, ...times, ...(layer.keys ? { keys } : {}) } : candidate)) });
  return null;
}
