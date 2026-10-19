import type { PointerEvent as ReactPointerEvent } from 'react';
import { layerName, type Layer } from '../../engine/layers';
import { formatTime } from '../../engine/timeline';
import type { SnapSkip } from '../../engine/timeSnap';
import { setLayerTimes } from '../../state/videoLayers';
import { getVideo, selectVLayer, setPlayhead } from '../../state/videoStore';
import { dragKey, startDrag, toFrame } from './timelineDrag';

/*
 * The timeline's layer rows (one per layer: drag the bar to move it in time, its ends to change when it shows); the
 * audio tracks' rows are SoundRow.tsx (208).
 */

/** Snaps a time as the timeline does, leaving out the dragged clip, layer or sound clip. */
export type SnapTime = (time: number, skip?: SnapSkip, event?: { altKey: boolean }) => number;

/** A layer's bar. */
interface LayerBarProps {
  layer: Layer;
  total: number;
  zoom: number;
  selected: boolean;
  onBody: (event: ReactPointerEvent) => void;
  onEdge: (event: ReactPointerEvent, side: 'start' | 'end') => void;
}

/**
 * A layer's bar: when it shows, with its ends to drag.
 * @param props the layer, the video's length, zoom, selection and the drags
 */
function LayerBar({ layer, total, zoom, selected, onBody, onEdge }: Readonly<LayerBarProps>) {
  const start = layer.start ?? 0;
  const end = Math.min(layer.end ?? total, total);
  const name = layerName(layer);
  return (
    <div
      className={`tl-bar tl-bar-${layer.kind}${selected ? ' on' : ''}${layer.hidden ? ' off' : ''}`}
      style={{ left: start * zoom, width: Math.max(10, (end - start) * zoom) }}
      onPointerDown={onBody}
      title={`${name} · ${formatTime(start)}–${formatTime(end)}`}
    >
      <span>{name}</span>
      <button type="button" className="tl-edge tl-edge-start" aria-label={`When ${name} appears`} onPointerDown={(event) => onEdge(event, 'start')} />
      <button type="button" className="tl-edge tl-edge-end" aria-label={`When ${name} disappears`} onPointerDown={(event) => onEdge(event, 'end')} />
    </div>
  );
}

/** One layer's row. */
interface LayerRowProps {
  layer: Layer;
  total: number;
  zoom: number;
  selected: boolean;
  snap: SnapTime;
  seekFrom: (event: ReactPointerEvent) => void;
}

/**
 * One layer's row: drag its bar to move it in time (its keyframes go with it), its ends to change when it shows.
 * @param props the layer, the video's length, zoom, selection, snapping and seeking
 */
export function LayerRow({ layer, total, zoom, selected, snap, seekFrom }: Readonly<LayerRowProps>) {
  const start = layer.start ?? 0;
  const end = Math.min(layer.end ?? total, total);
  const onBody = (event: ReactPointerEvent) => {
    selectVLayer(layer.id);
    const length = end - start;
    const key = dragKey('ltime', layer.id);
    startDrag(
      event,
      (dx, moveEvent) => {
        const wanted = start + dx / zoom;
        let at = snap(wanted, { layer: layer.id }, moveEvent);
        if (Math.abs(at - toFrame(wanted)) < 1e-9) at = snap(wanted + length, { layer: layer.id }, moveEvent) - length;
        at = Math.max(0, Math.min(total - length, at));
        // Moved whole: its keyframes go with it.
        setLayerTimes(layer.id, { start: at, end: at + length >= total - 0.01 ? undefined : at + length }, key);
      },
      (moved) => {
        const now = getVideo().t;
        if (!moved && (now < start || now >= end)) setPlayhead(start);
      },
    );
  };
  const onEdge = (event: ReactPointerEvent, side: 'start' | 'end') => {
    selectVLayer(layer.id);
    const key = dragKey('ltime', layer.id);
    startDrag(event, (dx, moveEvent) => {
      const time = snap((side === 'start' ? start : end) + dx / zoom, { layer: layer.id }, moveEvent);
      // Its start edge: the keyframes stay where they are on the timeline (205 AC-3).
      if (side === 'start') setLayerTimes(layer.id, { start: Math.max(0, Math.min(end - 0.2, time)) }, key);
      else {
        const newEnd = Math.max(start + 0.2, Math.min(total, time));
        setLayerTimes(layer.id, { end: newEnd >= total - 0.01 ? undefined : newEnd }, key);
      }
    });
  };
  return (
    <div className="tl-row tl-layer" onPointerDown={seekFrom}>
      <LayerBar layer={layer} total={total} zoom={zoom} selected={selected} onBody={onBody} onEdge={onEdge} />
    </div>
  );
}
