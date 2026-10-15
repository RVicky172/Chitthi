import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { layerName, type Layer } from '../../engine/layers';
import { formatTime } from '../../engine/timeline';
import type { Track } from '../../engine/tracks';
import { setLayerTimes } from '../../state/videoLayers';
import { updateMusic } from '../../state/videoMedia';
import { getVideo, selectVLayer, setPlayhead, useVideo, type VMusic } from '../../state/videoStore';
import { refuseLockedMusic } from './timelineActions';
import { dragKey, startDrag, toFrame } from './timelineDrag';

/*
 * The timeline's layer rows (one per layer: drag the bar to move it in time, its ends to change when it shows) and the
 * music row (drag the song to choose where it starts), with the waveform.
 */

/** Snaps a time as the timeline does, leaving out the dragged clip or layer. */
export type SnapTime = (time: number, skip?: { clip?: string; layer?: string }, event?: { altKey: boolean }) => number;

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

/** The song's bar. */
interface MusicBarProps {
  music: VMusic;
  total: number;
  zoom: number;
  height: number;
  onDrag: (event: ReactPointerEvent) => void;
}

/**
 * The song's bar with its waveform, from where it starts.
 * @param props the song, the video's length, zoom, row height and the drag
 */
function MusicBar({ music, total, zoom, height, onDrag }: Readonly<MusicBarProps>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const width = Math.max(10, Math.min(total, music.dur - music.offset) * zoom);
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.min(8000, Math.round(width * pixelRatio));
    canvas.height = Math.round((height - 8) * pixelRatio);
    context.clearRect(0, 0, canvas.width, canvas.height);
    const { peaks } = music;
    if (!peaks.length) return;
    context.fillStyle = getComputedStyle(canvas).color;
    const columns = canvas.width;
    for (let column = 0; column < columns; column += 2) {
      const songTime = music.offset + (column / columns) * (width / zoom);
      const peak = peaks[Math.min(peaks.length - 1, Math.floor((songTime / music.dur) * peaks.length))] ?? 0;
      const barHeight = Math.max(1, peak * music.volume * canvas.height * 0.9);
      context.fillRect(column, (canvas.height - barHeight) / 2, 1.5, barHeight);
    }
  }, [music, width, zoom, height]);
  return (
    <div className="tl-bar tl-bar-music" style={{ left: 0, width }} onPointerDown={onDrag} title={`${music.name}: drag to choose where the song starts`}>
      <canvas ref={canvasRef} aria-hidden="true" />
      <span>
        {music.name} · from {formatTime(music.offset)}
      </span>
    </div>
  );
}

/** The music row. */
interface MusicRowProps {
  track: Track;
  total: number;
  zoom: number;
  height: number;
  seekFrom: (event: ReactPointerEvent) => void;
}

/**
 * The music row: the song (drag it to choose where it starts), or a hint to add one.
 * @param props the music track, the video's length, zoom, row height and seeking
 */
export function MusicRow({ track, total, zoom, height, seekFrom }: Readonly<MusicRowProps>) {
  const music = useVideo((state) => state.music);
  let content: ReactNode = <span className="tl-placeholder">Add music from the Audio tool</span>;
  if (music) {
    const onDrag = (event: ReactPointerEvent) => {
      const startOffset = music.offset;
      if (refuseLockedMusic()) return;
      const latest = Math.max(0, music.dur - Math.min(total, music.dur));
      startDrag(event, (dx) => updateMusic({ offset: Math.max(0, Math.min(latest, startOffset - dx / zoom)) }));
    };
    content = <MusicBar music={music} total={total} zoom={zoom} height={height} onDrag={onDrag} />;
  }
  return (
    <div className={`tl-row tl-music${track.muted ? ' tl-off' : ''}`} style={{ height }} onPointerDown={seekFrom}>
      {content}
    </div>
  );
}
