import { moveLayer, type Layer } from '../engine/layers';
import { change, getIg } from './instagram';

/*
 * The photo editor's layer actions (text, shapes, stickers, drawings over a photo), undoable through the store's
 * `change` (407 T041, split from state/instagram.ts).
 */

/**
 * The batch with one photo's layers changed.
 * @param itemId the photo
 * @param update makes its new layers from the old ones
 * @returns the new items
 */
const withLayers = (itemId: string, update: (layers: Layer[]) => Layer[]) =>
  getIg().items.map((item) => (item.id === itemId ? { ...item, layers: update(item.layers) } : item));

/**
 * Add a layer on top and select it.
 * @param itemId the photo
 * @param layer the layer
 */
export function addLayer(itemId: string, layer: Layer): void {
  change(
    `add:${layer.id}`,
    withLayers(itemId, (layers) => [...layers, layer]),
    { layerSel: layer.id },
  );
}

/**
 * Changes a layer.
 * @param itemId the photo
 * @param layerId the layer
 * @param patch the fields to replace, or a function making the new layer from the old one
 * @param key groups a run of changes (a drag, typing) into one undo step
 */
export function updateLayer(itemId: string, layerId: string, patch: Partial<Layer> | ((layer: Layer) => Layer), key = `layer:${layerId}`): void {
  // A patch keeps the layer's kind: callers pass fields of the layer they hold.
  const apply = typeof patch === 'function' ? patch : (layer: Layer) => ({ ...layer, ...patch }) as Layer;
  change(
    key,
    withLayers(itemId, (layers) => layers.map((layer) => (layer.id === layerId ? apply(layer) : layer))),
  );
}

/**
 * Delete a layer (and drop its selection).
 * @param itemId the photo
 * @param layerId the layer
 */
export function removeLayer(itemId: string, layerId: string): void {
  const { layerSel } = getIg();
  change(
    '',
    withLayers(itemId, (layers) => layers.filter((layer) => layer.id !== layerId)),
    { layerSel: layerSel === layerId ? null : layerSel },
  );
}

/**
 * Moves a layer to a place in the photo's stack, one undo step; nothing (no step) when it is already there (506).
 * @param itemId the photo
 * @param layerId the layer
 * @param to its new stack index (0 = the back)
 */
export function moveLayerTo(itemId: string, layerId: string, to: number): void {
  const layers = getIg().items.find((item) => item.id === itemId)?.layers ?? [];
  const moved = moveLayer(layers, layerId, to);
  if (moved !== layers) change('', withLayers(itemId, () => moved));
}

/**
 * Moves a layer one place towards the front (+1) or the back (-1).
 * @param itemId the photo
 * @param layerId the layer
 * @param by the direction
 */
export function restackLayer(itemId: string, layerId: string, by: 1 | -1): void {
  const layers = getIg().items.find((item) => item.id === itemId)?.layers ?? [];
  const from = layers.findIndex((layer) => layer.id === layerId);
  if (from >= 0) moveLayerTo(itemId, layerId, from + by);
}

/**
 * Replaces all of a photo's layers (the drawing tool uses this).
 * @param itemId the photo
 * @param layers the layers
 * @param key groups a run of changes into one undo step
 * @param layerSel the layer to select; missing = the selection stays
 */
export function setLayers(itemId: string, layers: Layer[], key = '', layerSel?: string | null): void {
  change(
    key,
    withLayers(itemId, () => layers),
    layerSel === undefined ? {} : { layerSel },
  );
}

/**
 * Copies one photo's layers onto every other photo in the batch (new ids, same places).
 * @param itemId the photo to copy from
 */
export function copyLayersToAll(itemId: string): void {
  const { items } = getIg();
  const source = items.find((item) => item.id === itemId);
  if (!source) return;
  let copies = 0;
  const freshId = () => `l${Date.now().toString(36)}c${(copies++).toString(36)}`;
  change(
    '',
    items.map((item) => (item.id === itemId ? item : { ...item, layers: [...item.layers, ...source.layers.map((layer) => ({ ...layer, id: freshId() }))] })),
  );
}
