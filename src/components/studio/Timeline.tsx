import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { MIN_LEN, snapTargets, snapTime } from '../../engine/edits';
import { layerName, type Layer } from '../../engine/layers';
import { MAIN_VIDEO, MUSIC, lockedReason, type Track } from '../../engine/timeline';
import { clipLength, fmtTime } from '../../engine/video';
import { toast } from '../../lib/toast';
import {
  clipLocked,
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
  setTrack,
  setTrackHeight,
  setZoom,
  splitAtPlayhead,
  updateClip,
  updateMusic,
  updateVLayer,
  useVideo,
  type TrackHeight,
  type VClip,
  videoLength,
} from '../../state/video';
import { typingIn } from '../ig/LayerPanel';
import { CopyIcon, HeightIcon, HideIcon, LockIcon, MusicIcon, MuteIcon, PauseIcon, PlayIcon, ScissorsIcon, SkipBackIcon, SkipForwardIcon, TrashIcon, ZoomInIcon, ZoomOutIcon } from '../icons';

/*
 * The video editor's timeline: a time ruler, the clips (with filmstrips) on the video track, one row per layer, and
 * the music with its waveform. Everything is direct: drag a clip to reorder it, drag its edges to trim, drag a layer's
 * bar to move it in time or its ends to change when it shows, drag the music to slide the song, drag the playhead or
 * click anywhere to seek. Moves snap to clip edges, layer edges and the playhead. Ctrl + wheel zooms; the playhead is
 * followed while playing. Keyboard (with the timeline focused): Space play / pause, S split, Delete remove,
 * ← → a frame (Shift: a second), Home / End, + / − zoom.
 */

const SNAP_PX = 8;
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
    playing = useVideo((s) => s.playing),
    tracks = useVideo((s) => s.tracks),
    trackView = useVideo((s) => s.trackView);
  const px = (id: string) => TRACK_PX[trackView[id] ?? 'medium'];
  const videoTrack = tracks.find((tr) => tr.id === MAIN_VIDEO)!,
    musicTrack = tracks.find((tr) => tr.id === MUSIC)!;
  const scroller = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const [view, setView] = useState(600);
  const [reorder, setReorder] = useState<{ id: string; dx: number; to: number } | null>(null);
  const total = useVideo(videoLength);
  const placed = clips.filter((c) => c.track === MAIN_VIDEO).map((clip, index) => ({ clip, index, start: clip.start, end: clip.start + clipLength(clip) }));
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
  const snap = (v: number, skipLayer?: string) =>
    snapTime(v, snapTargets(placed.map((p) => p.clip), layers, getVideo().t, total, { layer: skipLayer }), SNAP_PX / zoom);

  const seekFrom = (e: ReactPointerEvent) => {
    setPlaying(false);
    setPlayhead(timeAt(e.clientX));
    drag(e, (_dx, ev) => setPlayhead(timeAt(ev.clientX)));
  };

  const onKey = (e: ReactKeyboardEvent) => {
    const del = (s: ReturnType<typeof getVideo>) => (s.layerSel ? removeVLayer(s.layerSel) : s.selected && !refused(s.selected) && removeClip(s.selected));
    // The track headers' buttons and menus handle their own keys.
    if (typingIn(e.target) || (e.target as HTMLElement).closest?.('.tl-heads')) return;
    const s = getVideo();
    const map: Record<string, () => void> = {
      ' ': () => setPlaying(!s.playing),
      s: split,
      Delete: () => del(s),
      Backspace: () => del(s),
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
      <div className="tl-heads">
        <div className="tl-h tl-h-ruler" aria-hidden="true" />
        <TrackHead track={videoTrack} height={trackView[MAIN_VIDEO] ?? 'medium'} />
        {(layers.length ? layers : [null]).map((l, i) => (
          <div key={l?.id ?? 'none'} className="tl-h tl-h-layer" aria-hidden="true">
            {i === 0 ? 'Layers' : ''}
          </div>
        ))}
        <TrackHead track={musicTrack} height={trackView[MUSIC] ?? 'medium'} />
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

          <div className={`tl-row tl-video${videoTrack.hidden ? ' tl-off' : ''}`} style={{ height: px(MAIN_VIDEO) }} onPointerDown={seekFrom}>
            {placed.map((p) => (
              <ClipBlock
                key={p.clip.id}
                clip={p.clip}
                index={p.index}
                left={p.start * zoom}
                width={(p.end - p.start) * zoom}
                selected={p.clip.id === selected && !layerSel}
                dragging={reorder?.id === p.clip.id ? reorder.dx : null}
                locked={videoTrack.locked}
                onBody={(e) => {
                  if (refused(p.clip.id)) return;
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
                  if (refused(p.clip.id)) return;
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

          <div className={`tl-row tl-music${musicTrack.muted ? ' tl-off' : ''}`} style={{ height: px(MUSIC) }} onPointerDown={seekFrom}>
            {music ? (
              <MusicBar
                total={total}
                zoom={zoom}
                height={px(MUSIC)}
                onDrag={(e) => {
                  const o0 = music.offset;
                  if (refusedMusic()) return;
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
  /** On a locked track: a lock badge, and the pointer doesn't drag it. */
  locked: boolean;
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
      className={`tl-clip tl-${c.kind}${p.selected ? ' on' : ''}${p.dragging !== null ? ' dragging' : ''}${p.locked ? ' locked' : ''}`}
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
        {p.locked && <LockIcon on />}
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

function MusicBar({ total, zoom, height, onDrag }: { total: number; zoom: number; height: number; onDrag: (e: ReactPointerEvent) => void }) {
  const music = useVideo((s) => s.music)!;
  const ref = useRef<HTMLCanvasElement>(null);
  const width = Math.max(10, Math.min(total, music.dur - music.offset) * zoom);
  useEffect(() => {
    const cv = ref.current,
      x = cv?.getContext('2d');
    if (!cv || !x) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.min(8000, Math.round(width * dpr));
    cv.height = Math.round((height - 8) * dpr);
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
  }, [music, width, zoom, height]);
  return (
    <div className="tl-bar tl-bar-music" style={{ left: 0, width }} onPointerDown={onDrag} title={`${music.name}: drag to choose where the song starts`}>
      <canvas ref={ref} aria-hidden="true" />
      <span>
        {music.name} · from {fmtTime(music.offset)}
      </span>
    </div>
  );
}

/** True (and says why in a toast) when the clip is on a locked track. */
function refused(id: string): boolean {
  const why = clipLocked(id);
  if (why) toast(why);
  return !!why;
}
function refusedMusic(): boolean {
  const why = lockedReason(getVideo().tracks, MUSIC);
  if (why) toast(why);
  return !!why;
}
/** Splits the clip under the playhead (S, the Split button), or says why not. */
function split(): void {
  const why = lockedReason(getVideo().tracks, MAIN_VIDEO);
  if (why) toast(why);
  else if (!splitAtPlayhead()) toast('Put the playhead inside a clip, away from its ends, to split it.');
}

/** Track heights in pixels (Q5; D-008: Medium for every track by default). */
const TRACK_PX: Record<TrackHeight, number> = { small: 40, medium: 64, large: 96 };
const HEIGHTS: [TrackHeight, string][] = [
  ['small', 'Small'],
  ['medium', 'Medium'],
  ['large', 'Large'],
];

/** A track's header: its name, Hide (picture tracks) or Mute (sound tracks), Lock, and its height. */
function TrackHead({ track, height }: { track: Track; height: TrackHeight }) {
  const visual = track.kind !== 'audio';
  const off = visual ? track.hidden : track.muted;
  const verb = visual ? 'Hide' : 'Mute';
  return (
    <div className={`tl-h tl-h-track tl-h-${height}`} style={{ height: TRACK_PX[height] }} role="group" aria-label={`${track.name} track`}>
      <span className="tl-h-name" aria-hidden="true">
        {!visual && <MusicIcon />} {track.name}
      </span>
      <span className="tl-h-tools">
        <button
          type="button"
          className="tl-tbtn"
          aria-pressed={off}
          aria-label={`${verb} ${track.name}`}
          title={visual ? (off ? 'Hidden: not drawn in the preview or the export' : 'Hide this track in the preview and the export') : off ? 'Muted: silent in the preview and the export' : 'Mute this track in the preview and the export'}
          onClick={() => setTrack(track.id, visual ? { hidden: !off } : { muted: !off })}
        >
          {visual ? <HideIcon on={off} /> : <MuteIcon on={off} />}
        </button>
        <button
          type="button"
          className="tl-tbtn"
          aria-pressed={track.locked}
          aria-label={`Lock ${track.name}`}
          title={track.locked ? 'Locked: its clips can’t be changed' : 'Lock this track so its clips can’t be changed'}
          onClick={() => setTrack(track.id, { locked: !track.locked })}
        >
          <LockIcon on={track.locked} />
        </button>
        <HeightMenu track={track} height={height} />
      </span>
    </div>
  );
}

/** The track height button and its menu (Small / Medium / Large): arrows, Home / End, Enter, Escape. */
function HeightMenu({ track, height }: { track: Track; height: TrackHeight }) {
  const [at, setAt] = useState<{ left: number; top?: number; bottom?: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null),
    list = useRef<HTMLUListElement>(null),
    id = useId();
  const label = `${track.name} track height`;
  const close = (focus: boolean) => {
    setAt(null);
    if (focus) btn.current?.focus();
  };
  useEffect(() => {
    if (!at) return;
    const onDown = (e: PointerEvent) => {
      if (!list.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setAt(null);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [at]);
  // Land on the size in use as soon as the menu is there, so the very next key goes to it.
  useLayoutEffect(() => {
    if (at) list.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
  }, [at]);
  const open = () => {
    const r = btn.current!.getBoundingClientRect();
    // A fixed menu in a portal: inside the timeline it would be clipped by its scrolling and painted under the clips.
    // Opens upwards near the bottom of the window.
    setAt(r.bottom + 120 > window.innerHeight ? { left: r.left, bottom: window.innerHeight - r.top + 2 } : { left: r.left, top: r.bottom + 2 });
  };
  const onListKey = (e: ReactKeyboardEvent) => {
    // React events bubble out of a portal to the timeline, whose keys (Space, S, Delete, arrows) mustn't act here.
    e.stopPropagation();
    const items = [...(list.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = { ArrowDown: Math.min(items.length - 1, i + 1), ArrowUp: Math.max(0, i - 1), Home: 0, End: items.length - 1 }[e.key];
    if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault();
      close(true);
    } else if (next !== undefined) {
      e.preventDefault();
      items[next]?.focus();
    }
  };
  return (
    <>
      <button
        ref={btn}
        type="button"
        className="tl-tbtn"
        aria-label={label}
        title={`Track height: ${HEIGHTS.find(([h]) => h === height)?.[1]}`}
        aria-haspopup="menu"
        aria-expanded={!!at}
        aria-controls={at ? id : undefined}
        onClick={() => (at ? close(false) : open())}
      >
        <HeightIcon />
      </button>
      {at &&
        createPortal(
        <ul ref={list} id={id} className="tl-hmenu" role="menu" aria-label={label} style={{ position: 'fixed', ...at }} onKeyDown={onListKey}>
          {HEIGHTS.map(([h, name]) => (
            <li key={h} role="none">
              <button
                type="button"
                role="menuitemradio"
                aria-checked={h === height}
                onClick={() => {
                  setTrackHeight(track.id, h);
                  close(true);
                }}
              >
                {name}
              </button>
            </li>
          ))}
        </ul>,
          document.body,
        )}
    </>
  );
}

/** Play controls, editing buttons and zoom, above the timeline. */
export function Transport() {
  const playing = useVideo((s) => s.playing),
    t = useVideo((s) => s.t),
    clips = useVideo((s) => s.clips),
    selected = useVideo((s) => s.selected),
    zoom = useVideo((s) => s.zoom);
  const total = useVideo(videoLength);
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
      <button type="button" className="sbtn" disabled={!clips.length} onClick={split} title="Split at the playhead (S)" aria-label="Split">
        <ScissorsIcon />
        <span className="mst-l">Split</span>
      </button>
      <button type="button" className="sbtn" disabled={!selected} onClick={() => selected && !refused(selected) && duplicateClip(selected)} title="Duplicate the clip" aria-label="Duplicate">
        <CopyIcon />
        <span className="mst-l">Duplicate</span>
      </button>
      <button type="button" className="sbtn" disabled={!selected} onClick={() => selected && !refused(selected) && removeClip(selected)} title="Remove the clip (Delete)" aria-label="Delete">
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
