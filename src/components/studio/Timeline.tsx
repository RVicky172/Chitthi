import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { layerName, type Layer } from '../../engine/layers';
import { clipLength, fmtTime, timeline, totalLength } from '../../engine/video';
import { toast } from '../../lib/toast';
import {
  duplicateClip,
  endVStep,
  getVideo,
  moveClipTo,
  removeClip,
  removeVLayer,
  selectClip,
  selectVLayer,
  setPlayhead,
  setPlaying,
  setZoom,
  splitAtPlayhead,
  updateClip,
  updateMusic,
  updateVLayer,
  useVideo,
  type VClip,
} from '../../state/video';
import { typingIn } from '../ig/LayerPanel';
import { CopyIcon, MusicIcon, PauseIcon, PlayIcon, ScissorsIcon, SkipBackIcon, SkipForwardIcon, TrashIcon, ZoomInIcon, ZoomOutIcon } from '../icons';

/*
 * The video editor's timeline: a time ruler, the clips (with filmstrips) on the video track, one row per layer, and
 * the music with its waveform. Everything is direct: drag a clip to reorder it, drag its edges to trim, drag a layer's
 * bar to move it in time or its ends to change when it shows, drag the music to slide the song, drag the playhead or
 * click anywhere to seek. Moves snap to clip edges, layer edges and the playhead. Ctrl + wheel zooms; the playhead is
 * followed while playing. Keyboard (with the timeline focused): Space play / pause, S split, Delete remove,
 * ← → a frame (Shift: a second), Home / End, + / − zoom.
 */

const SNAP_PX = 8;
const MIN_LEN = 0.3;
let dragSeq = 0;

/** Starts a horizontal drag; `move` gets the pointer's distance in px from where it started. */
function drag(e: ReactPointerEvent, move: (dx: number, ev: PointerEvent) => void, up?: (moved: boolean, ev: PointerEvent) => void) {
  e.stopPropagation();
  e.preventDefault();
  const el = e.currentTarget as HTMLElement;
  const x0 = e.clientX;
  let moved = false;
  el.setPointerCapture(e.pointerId);
  const onMove = (ev: PointerEvent) => {
    const dx = ev.clientX - x0;
    if (!moved && Math.abs(dx) < 3) return;
    moved = true;
    move(dx, ev);
  };
  const onUp = (ev: PointerEvent) => {
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerup', onUp);
    el.removeEventListener('pointercancel', onUp);
    up?.(moved, ev);
    endVStep();
  };
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
}

/** A step between ruler ticks that leaves at least ~80 px between labels. */
function tickStep(zoom: number): number {
  for (const s of [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800]) if (s * zoom >= 80) return s;
  return 3600;
}
const label = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}` : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`);

export function Timeline() {
  const clips = useVideo((s) => s.clips),
    layers = useVideo((s) => s.layers),
    layerSel = useVideo((s) => s.layerSel),
    selected = useVideo((s) => s.selected),
    t = useVideo((s) => s.t),
    zoom = useVideo((s) => s.zoom),
    music = useVideo((s) => s.music),
    playing = useVideo((s) => s.playing);
  const scroller = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const [view, setView] = useState(600);
  const [reorder, setReorder] = useState<{ id: string; dx: number; to: number } | null>(null);
  const total = totalLength(clips);
  const placed = timeline(clips);
  const width = Math.max(view - 2, total * zoom + 160);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setView(el.clientWidth));
    ro.observe(el);
    setView(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // Follow the playhead while playing.
  useEffect(() => {
    const el = scroller.current;
    if (!el || !playing) return;
    const x = t * zoom;
    if (x < el.scrollLeft + 40 || x > el.scrollLeft + el.clientWidth - 60) el.scrollLeft = Math.max(0, x - el.clientWidth * 0.25);
  }, [t, zoom, playing]);

  // Ctrl + wheel zooms around the pointer (a native listener: React's wheel events are passive).
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const on = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const z0 = getVideo().zoom,
        rect = el.getBoundingClientRect(),
        at = (el.scrollLeft + e.clientX - rect.left) / z0;
      const z1 = Math.max(4, Math.min(400, z0 * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
      setZoom(z1);
      requestAnimationFrame(() => (el.scrollLeft = at * z1 - (e.clientX - rect.left)));
    };
    el.addEventListener('wheel', on, { passive: false });
    return () => el.removeEventListener('wheel', on);
  }, []);

  const timeAt = (clientX: number) => {
    const r = canvas.current!.getBoundingClientRect();
    return Math.max(0, Math.min(total, (clientX - r.left) / zoom));
  };
  /** Snaps a time to the nearest clip edge, layer edge or the playhead within a few pixels. */
  const snap = (v: number, skipLayer?: string) => {
    const pts = [0, total, getVideo().t, ...placed.flatMap((p) => [p.start, p.end]), ...layers.filter((l) => l.id !== skipLayer).flatMap((l) => [l.start ?? 0, Math.min(l.end ?? total, total)])];
    let best = v,
      dist = SNAP_PX / zoom;
    for (const p of pts)
      if (Math.abs(p - v) < dist) {
        dist = Math.abs(p - v);
        best = p;
      }
    return best;
  };

  const seekFrom = (e: ReactPointerEvent) => {
    setPlaying(false);
    setPlayhead(timeAt(e.clientX));
    drag(e, (_dx, ev) => setPlayhead(timeAt(ev.clientX)));
  };

  const onKey = (e: ReactKeyboardEvent) => {
    if (typingIn(e.target)) return;
    const s = getVideo();
    const map: Record<string, () => void> = {
      ' ': () => setPlaying(!s.playing),
      s: () => !splitAtPlayhead() && toast('Put the playhead inside a clip, away from its ends, to split it.'),
      Delete: () => (s.layerSel ? removeVLayer(s.layerSel) : s.selected && removeClip(s.selected)),
      Backspace: () => (s.layerSel ? removeVLayer(s.layerSel) : s.selected && removeClip(s.selected)),
      ArrowLeft: () => setPlayhead(s.t - (e.shiftKey ? 1 : 1 / 30)),
      ArrowRight: () => setPlayhead(s.t + (e.shiftKey ? 1 : 1 / 30)),
      Home: () => setPlayhead(0),
      End: () => setPlayhead(total),
      '+': () => setZoom(s.zoom * 1.25),
      '=': () => setZoom(s.zoom * 1.25),
      '-': () => setZoom(s.zoom / 1.25),
    };
    const f = map[e.key] ?? map[e.key.toLowerCase()];
    if (f && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      f();
    }
  };

  const step = tickStep(zoom);
  const ticks = Array.from({ length: Math.floor(width / zoom / step) + 1 }, (_, i) => i * step);
  // Where a dragged clip would land: before the first other clip whose middle is right of the dragged clip's centre.
  const others = (id: string) => placed.filter((q) => q.clip.id !== id);
  const reorderTarget = (id: string, centreX: number) => {
    const list = others(id),
      at = centreX / zoom;
    const k = list.findIndex((q) => at < (q.start + q.end) / 2);
    return k < 0 ? list.length : k;
  };
  /** The drop marker sits at the start of the clip it will go before (or the end of the last one). */
  const markerAt = (id: string, to: number) => {
    const list = others(id);
    return (list[to]?.start ?? list.at(-1)?.end ?? 0) * zoom;
  };

  return (
    <div className="tl" onKeyDown={onKey}>
      <div className="tl-heads" aria-hidden="true">
        <div className="tl-h tl-h-ruler" />
        <div className="tl-h tl-h-video">Video</div>
        {(layers.length ? layers : [null]).map((l, i) => (
          <div key={l?.id ?? 'none'} className="tl-h tl-h-layer">
            {i === 0 ? 'Layers' : ''}
          </div>
        ))}
        <div className="tl-h tl-h-music">
          <MusicIcon /> Music
        </div>
      </div>
      <div className="tl-scroll" ref={scroller} tabIndex={0} role="group" aria-label={`Timeline, ${fmtTime(total)}. Space plays, S splits, Delete removes, arrow keys move the playhead.`}>
        <div className="tl-canvas" ref={canvas} style={{ width }}>
          <div className="tl-ruler" onPointerDown={seekFrom}>
            {ticks.map((s) => (
              <span key={s} className="tl-tick" style={{ left: s * zoom }}>
                {label(s)}
              </span>
            ))}
          </div>

          <div className="tl-row tl-video" onPointerDown={seekFrom}>
            {placed.map((p) => (
              <ClipBlock
                key={p.clip.id}
                clip={p.clip}
                index={p.index}
                left={p.start * zoom}
                width={(p.end - p.start) * zoom}
                selected={p.clip.id === selected && !layerSel}
                dragging={reorder?.id === p.clip.id ? reorder.dx : null}
                onBody={(e) => {
                  selectClip(p.clip.id);
                  selectVLayer(null);
                  drag(
                    e,
                    (dx) => setReorder({ id: p.clip.id, dx, to: reorderTarget(p.clip.id, p.start * zoom + dx + ((p.end - p.start) * zoom) / 2) }),
                    (moved) => {
                      setReorder((r) => {
                        if (moved && r) moveClipTo(r.id, r.to);
                        return null;
                      });
                      // A click (no drag) puts the playhead in the clip, if it isn't there already.
                      const now = getVideo().t;
                      if (!moved && (now < p.start || now >= p.end)) setPlayhead(p.start);
                    },
                  );
                }}
                onEdge={(e, side) => {
                  selectClip(p.clip.id);
                  const c0 = p.clip,
                    key = `trim:${c0.id}:${++dragSeq}`;
                  drag(e, (dx) => {
                    const dt = dx / zoom;
                    if (c0.kind === 'video') {
                      if (side === 'end') {
                        const end = snap(p.start + (c0.out - c0.in) + dt) - p.start;
                        updateClip(c0.id, { out: Math.max(c0.in + MIN_LEN, Math.min(c0.srcDur, c0.in + end)) }, key);
                      } else updateClip(c0.id, { in: Math.max(0, Math.min(c0.out - MIN_LEN, c0.in + dt)) }, key);
                    } else {
                      const dur = side === 'end' ? snap(p.start + c0.dur + dt) - p.start : c0.dur - dt;
                      updateClip(c0.id, { dur: Math.max(MIN_LEN, Math.min(60, dur)) }, key);
                    }
                  });
                }}
              />
            ))}
            {reorder && <span className="tl-drop" style={{ left: markerAt(reorder.id, reorder.to) }} />}
          </div>

          {layers.length === 0 && (
            <div className="tl-row tl-layer tl-empty" onPointerDown={seekFrom}>
              <span>Text, stickers and drawings appear here, one row each</span>
            </div>
          )}
          {[...layers].reverse().map((l) => (
            <div key={l.id} className="tl-row tl-layer" onPointerDown={seekFrom}>
              <LayerBar
                layer={l}
                total={total}
                zoom={zoom}
                selected={l.id === layerSel}
                onBody={(e) => {
                  selectVLayer(l.id);
                  const s0 = l.start ?? 0,
                    e0 = Math.min(l.end ?? total, total),
                    len = e0 - s0,
                    key = `ltime:${l.id}:${++dragSeq}`;
                  drag(
                    e,
                    (dx) => {
                      let s = snap(s0 + dx / zoom, l.id);
                      if (Math.abs(s - (s0 + dx / zoom)) < 1e-9) s = snap(s0 + dx / zoom + len, l.id) - len;
                      s = Math.max(0, Math.min(total - len, s));
                      updateVLayer(l.id, { start: s, end: s + len >= total - 0.01 ? undefined : s + len }, key);
                    },
                    (moved) => {
                      const now = getVideo().t;
                      if (!moved && (now < s0 || now >= e0)) setPlayhead(s0);
                    },
                  );
                }}
                onEdge={(e, side) => {
                  selectVLayer(l.id);
                  const s0 = l.start ?? 0,
                    e0 = Math.min(l.end ?? total, total),
                    key = `ltime:${l.id}:${++dragSeq}`;
                  drag(e, (dx) => {
                    const v = snap((side === 'start' ? s0 : e0) + dx / zoom, l.id);
                    if (side === 'start') updateVLayer(l.id, { start: Math.max(0, Math.min(e0 - 0.2, v)) }, key);
                    else {
                      const end = Math.max(s0 + 0.2, Math.min(total, v));
                      updateVLayer(l.id, { end: end >= total - 0.01 ? undefined : end }, key);
                    }
                  });
                }}
              />
            </div>
          ))}

          <div className="tl-row tl-music" onPointerDown={seekFrom}>
            {music ? (
              <MusicBar
                total={total}
                zoom={zoom}
                onDrag={(e) => {
                  const o0 = music.offset;
                  drag(e, (dx) => updateMusic({ offset: Math.max(0, Math.min(Math.max(0, music.dur - Math.min(total, music.dur)), o0 - dx / zoom)) }));
                }}
              />
            ) : (
              <span className="tl-placeholder">Add music from the Audio tool</span>
            )}
          </div>

          <div className="tl-playhead" style={{ left: Math.min(t, total) * zoom }}>
            <button
              type="button"
              className="tl-playhead-grip"
              aria-label={`Playhead at ${fmtTime(t)}`}
              onPointerDown={(e) => {
                setPlaying(false);
                drag(e, (_dx, ev) => setPlayhead(snap(timeAt(ev.clientX))));
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function ClipBlock(p: {
  clip: VClip;
  index: number;
  left: number;
  width: number;
  selected: boolean;
  dragging: number | null;
  onBody: (e: ReactPointerEvent) => void;
  onEdge: (e: ReactPointerEvent, side: 'start' | 'end') => void;
}) {
  const c = p.clip;
  // Filmstrip tiles for the part of the source that is used.
  const tiles = Math.max(1, Math.min(24, Math.round(p.width / 56)));
  const frames = Array.from({ length: tiles }, (_, k) => {
    if (c.kind !== 'video' || c.strip.length <= 1) return c.strip[0] ?? c.thumb;
    const time = c.in + ((k + 0.5) / tiles) * (c.out - c.in);
    return c.strip[Math.min(c.strip.length - 1, Math.floor((time / c.srcDur) * c.strip.length))];
  });
  return (
    <div
      className={`tl-clip tl-${c.kind}${p.selected ? ' on' : ''}${p.dragging !== null ? ' dragging' : ''}`}
      style={{ left: p.left, width: Math.max(8, p.width - 2), transform: p.dragging !== null ? `translateX(${p.dragging}px)` : undefined }}
      onPointerDown={p.onBody}
      title={`${c.name} · ${clipLength(c).toFixed(1)} s`}
    >
      <div className="tl-film" aria-hidden="true">
        {frames.map((src, k) => (
          <img key={k} src={src} alt="" draggable={false} />
        ))}
      </div>
      <span className="tl-clip-label">
        {c.kind === 'video' ? '▶ ' : ''}
        {clipLength(c).toFixed(1)}s{c.fade ? ' · fade' : ''}
      </span>
      <button type="button" className="tl-edge tl-edge-start" aria-label={`Trim the start of clip ${p.index + 1}`} onPointerDown={(e) => p.onEdge(e, 'start')} />
      <button type="button" className="tl-edge tl-edge-end" aria-label={`Trim the end of clip ${p.index + 1}`} onPointerDown={(e) => p.onEdge(e, 'end')} />
      <button type="button" className="vh" aria-label={`Clip ${p.index + 1}: ${c.name}, ${c.kind}, ${clipLength(c).toFixed(1)} seconds`} aria-pressed={p.selected} onClick={() => selectClip(c.id)} />
    </div>
  );
}

function LayerBar(p: { layer: Layer; total: number; zoom: number; selected: boolean; onBody: (e: ReactPointerEvent) => void; onEdge: (e: ReactPointerEvent, side: 'start' | 'end') => void }) {
  const l = p.layer;
  const s = l.start ?? 0,
    e = Math.min(l.end ?? p.total, p.total);
  return (
    <div
      className={`tl-bar tl-bar-${l.kind}${p.selected ? ' on' : ''}${l.hidden ? ' off' : ''}`}
      style={{ left: s * p.zoom, width: Math.max(10, (e - s) * p.zoom) }}
      onPointerDown={p.onBody}
      title={`${layerName(l)} · ${fmtTime(s)}–${fmtTime(e)}`}
    >
      <span>{layerName(l)}</span>
      <button type="button" className="tl-edge tl-edge-start" aria-label={`When ${layerName(l)} appears`} onPointerDown={(ev) => p.onEdge(ev, 'start')} />
      <button type="button" className="tl-edge tl-edge-end" aria-label={`When ${layerName(l)} disappears`} onPointerDown={(ev) => p.onEdge(ev, 'end')} />
    </div>
  );
}

function MusicBar({ total, zoom, onDrag }: { total: number; zoom: number; onDrag: (e: ReactPointerEvent) => void }) {
  const music = useVideo((s) => s.music)!;
  const ref = useRef<HTMLCanvasElement>(null);
  const width = Math.max(10, Math.min(total, music.dur - music.offset) * zoom);
  useEffect(() => {
    const cv = ref.current,
      x = cv?.getContext('2d');
    if (!cv || !x) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.min(8000, Math.round(width * dpr));
    cv.height = Math.round(36 * dpr);
    x.clearRect(0, 0, cv.width, cv.height);
    const peaks = music.peaks;
    if (!peaks.length) return;
    x.fillStyle = getComputedStyle(cv).color;
    const n = cv.width;
    for (let i = 0; i < n; i += 2) {
      const songT = music.offset + (i / n) * (width / zoom);
      const v = peaks[Math.min(peaks.length - 1, Math.floor((songT / music.dur) * peaks.length))] * music.volume;
      const h = Math.max(1, v * cv.height * 0.9);
      x.fillRect(i, (cv.height - h) / 2, 1.5, h);
    }
  }, [music, width, zoom]);
  return (
    <div className="tl-bar tl-bar-music" style={{ left: 0, width }} onPointerDown={onDrag} title={`${music.name}: drag to choose where the song starts`}>
      <canvas ref={ref} aria-hidden="true" />
      <span>
        {music.name} · from {fmtTime(music.offset)}
      </span>
    </div>
  );
}

/** Play controls, editing buttons and zoom, above the timeline. */
export function Transport() {
  const playing = useVideo((s) => s.playing),
    t = useVideo((s) => s.t),
    clips = useVideo((s) => s.clips),
    selected = useVideo((s) => s.selected),
    zoom = useVideo((s) => s.zoom);
  const total = totalLength(clips);
  return (
    <div className="tl-transport" role="toolbar" aria-label="Playback and editing">
      <button type="button" className="pbtn" aria-label="Go to the start" onClick={() => (setPlaying(false), setPlayhead(0))}>
        <SkipBackIcon />
      </button>
      <button type="button" className="tl-play" aria-label={playing ? 'Pause' : 'Play'} aria-pressed={playing} disabled={!clips.length} onClick={() => setPlaying(!playing)}>
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      <button type="button" className="pbtn" aria-label="Go to the end" onClick={() => (setPlaying(false), setPlayhead(total))}>
        <SkipForwardIcon />
      </button>
      <span className="tl-time">
        <b>{fmtTime(t)}</b> / {fmtTime(total)}
      </span>
      <span className="tl-sep" />
      <button type="button" className="sbtn" disabled={!clips.length} onClick={() => !splitAtPlayhead() && toast('Put the playhead inside a clip, away from its ends, to split it.')} title="Split at the playhead (S)" aria-label="Split">
        <ScissorsIcon />
        <span className="mst-l">Split</span>
      </button>
      <button type="button" className="sbtn" disabled={!selected} onClick={() => selected && duplicateClip(selected)} title="Duplicate the clip" aria-label="Duplicate">
        <CopyIcon />
        <span className="mst-l">Duplicate</span>
      </button>
      <button type="button" className="sbtn" disabled={!selected} onClick={() => selected && removeClip(selected)} title="Remove the clip (Delete)" aria-label="Delete">
        <TrashIcon />
        <span className="mst-l">Delete</span>
      </button>
      <span className="tl-grow" />
      <button type="button" className="pbtn" aria-label="Zoom out" onClick={() => setZoom(zoom / 1.25)}>
        <ZoomOutIcon />
      </button>
      <input className="tl-zoom" type="range" min={4} max={400} step={1} value={zoom} aria-label="Timeline zoom" onChange={(e) => setZoom(+e.target.value)} />
      <button type="button" className="pbtn" aria-label="Zoom in" onClick={() => setZoom(zoom * 1.25)}>
        <ZoomInIcon />
      </button>
      <button
        type="button"
        className="sbtn"
        onClick={() => {
          const el = document.querySelector<HTMLElement>('.tl-scroll');
          if (el && total) setZoom((el.clientWidth - 40) / total);
        }}
      >
        Fit
      </button>
    </div>
  );
}
