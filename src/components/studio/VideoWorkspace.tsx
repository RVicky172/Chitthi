import { useCallback, useEffect, useRef, useState } from 'react';
import { drawSelection, layerBox } from '../../engine/layers';
import { MAIN_VIDEO, MUSIC, lockedReason, videoAt } from '../../engine/timeline';
import { MOTIONS, NO_PICTURE, bitrateFor, clipLength, fmtTime, formatsFor, renderFrame, vFormat, type Motion, type VFps, type VQuality } from '../../engine/video';
import { saveFile } from '../../lib/download';
import { logError } from '../../lib/errors';
import { canStreamToDisk } from '../../lib/fileSink';
import { toast } from '../../lib/toast';
import { desktop, isDesktop } from '../../platform/desktop';
import { canShareFiles, getIg, setIg, useIg } from '../../state/instagram';
import {
  addMedia,
  addVLayer,
  cancelExport,
  adjustClip,
  editClip,
  endVStep,
  exportVideo,
  getVideo,
  limitText,
  limits,
  redoV,
  removeMusic,
  removeVLayer,
  restackVLayer,
  selectVLayer,
  setKind,
  setMusicFile,
  setPlayhead,
  setPlaying,
  setVideoOptions,
  setVLayers,
  setVTools,
  undoV,
  updateClip,
  updateMusic,
  updateVLayer,
  useVideo,
  type VClip,
  projectOf,
  total as videoTotal,
  videoLength,
} from '../../state/video';
import { Check, Seg } from '../common';
import { AddElements, AddText, DrawPanel, LayerList, LayerProps, typingIn, type LayerPanelProps } from '../ig/LayerPanel';
import { LookPicker } from '../ig/LookPicker';
import { handleRadius, useFontsTick, useLayerPointer } from '../ig/useLayerPointer';
import { AddPhotoIcon, BrushIcon, DownloadIcon, FolderIcon, ImageIcon, InstagramIcon, LayersIcon, MusicIcon, RedoIcon, ReelIcon, ShapesIcon, ShareIcon, TrashIcon, TypeIcon, UndoIcon, YouTubeIcon } from '../icons';
import { MoreMenu } from '../MoreMenu';
import { StudioDialog } from './Dialog';
import { DesktopNote, StudioShell, useFit, type RailItem, type StudioMode } from './Shell';
import { Timeline, Transport } from './Timeline';

/*
 * The video editor in the studio layout, for Reels / Shorts (vertical, short, shared to Instagram) and YouTube videos
 * (16:9, long, saved to a file). The stage plays the timeline live; the timeline below edits it directly; the
 * inspector shows the selected clip or layer. State: state/video.ts; drawing: engine/video.ts; export:
 * engine/videoExport.ts (loaded on export).
 */

type Tool = 'media' | 'text' | 'elements' | 'draw' | 'audio' | 'layers';
const RAIL: RailItem<Tool>[] = [
  { id: 'media', label: 'Media', icon: <ImageIcon /> },
  { id: 'text', label: 'Text', icon: <TypeIcon /> },
  { id: 'elements', label: 'Elements', icon: <ShapesIcon /> },
  { id: 'draw', label: 'Draw', icon: <BrushIcon /> },
  { id: 'audio', label: 'Audio', icon: <MusicIcon /> },
  { id: 'layers', label: 'Layers', icon: <LayersIcon /> },
];

const INSTAGRAM_WEB = 'https://www.instagram.com/';
const YOUTUBE_UPLOAD = 'https://www.youtube.com/upload';

export function VideoWorkspace({ mode, onMode }: { mode: Exclude<StudioMode, 'photos'>; onMode: (m: StudioMode) => void }) {
  const kind = mode === 'vlog' ? 'vlog' : 'reel';
  useEffect(() => setKind(kind), [kind]);
  const clips = useVideo((s) => s.clips),
    layers = useVideo((s) => s.layers),
    layerSel = useVideo((s) => s.layerSel),
    selected = useVideo((s) => s.selected),
    t = useVideo((s) => s.t),
    format = useVideo((s) => s.format),
    canUndo = useVideo((s) => s.canUndo),
    canRedo = useVideo((s) => s.canRedo),
    tools = useVideo((s) => s.tools);
  const [tool, setTool] = useState<Tool | null>(() => (getVideo().clips.length ? 'text' : 'media'));
  const [exporting, setExporting] = useState(false);
  const total = useVideo(videoLength);
  const f = vFormat(format);

  useEffect(() => {
    setVTools({ tool: tool === 'draw' ? 'draw' : 'select' });
    return () => setVTools({ tool: 'select' });
  }, [tool]);
  useEffect(() => () => setPlaying(false), []);

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (typingIn(e.target)) return;
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === 'z' && !e.shiftKey) {
        e.preventDefault();
        undoV();
      } else if ((e.ctrlKey || e.metaKey) && (k === 'y' || (k === 'z' && e.shiftKey))) {
        e.preventDefault();
        redoV();
      } else if (k === ' ' && !(e.target instanceof HTMLButtonElement) && !(e.target as HTMLElement).closest?.('.tl-scroll')) {
        e.preventDefault();
        setPlaying(!getVideo().playing);
      }
    };
    document.addEventListener('keydown', on);
    return () => document.removeEventListener('keydown', on);
  }, []);

  const lp: LayerPanelProps = {
    layers,
    selected: layerSel,
    onSelect: selectVLayer,
    onAdd: addVLayer,
    onUpdate: (id, patch, key) => updateVLayer(id, patch, key),
    onRemove: removeVLayer,
    onRestack: restackVLayer,
    timing: { duration: total, now: t },
  };
  const needClips = <p className="hint mst-pad">Add photos or videos first: choose Media in the tool rail.</p>;
  const panel =
    tool === 'media' ? (
      <MediaPanel />
    ) : tool === 'audio' ? (
      <MusicPanel />
    ) : !clips.length ? (
      needClips
    ) : tool === 'text' ? (
      <AddText {...lp} />
    ) : tool === 'elements' ? (
      <AddElements {...lp} />
    ) : tool === 'draw' ? (
      <DrawPanel tools={tools} onTools={setVTools} onNewDrawing={() => selectVLayer(null)} />
    ) : (
      <LayerList {...lp} />
    );
  const clip = clips.find((c) => c.id === selected);

  return (
    <StudioShell
      mode={mode}
      onMode={onMode}
      rail={RAIL}
      tool={tool}
      onTool={setTool}
      actions={
        <>
          <button type="button" className="btn icon ghost" aria-label="Undo (Ctrl+Z)" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undoV}>
            <UndoIcon />
          </button>
          <button type="button" className="btn icon ghost" aria-label="Redo (Ctrl+Y)" title="Redo (Ctrl+Y)" disabled={!canRedo} onClick={redoV}>
            <RedoIcon />
          </button>
          <MoreMenu
            className="mst-format"
            text={`${f.ratio} ${f.label}`}
            label="Video format"
            items={formatsFor(kind).map((x) => ({
              key: x.id,
              label: `${x.ratio} · ${x.label} (${x.w}×${x.h})${x.desktopOnly && !isDesktop ? ' · desktop app' : ''}`,
              current: x.id === format,
              disabled: !!x.desktopOnly && !isDesktop,
              onSelect: () => setVideoOptions({ format: x.id }),
            }))}
          />
          <button type="button" className="btn primary" aria-label="Export" disabled={!clips.length} onClick={() => (setPlaying(false), setExporting(true))}>
            <DownloadIcon />
            <span className="mst-l">Export</span>
          </button>
        </>
      }
      panel={panel}
      inspector={layerSel ? <LayerProps {...lp} /> : clip ? <ClipPanel clip={clip} /> : <ProjectPanel />}
      stage={clips.length ? <VideoStage /> : <EmptyStage kind={kind} />}
      dock={
        <>
          <Transport />
          <Timeline />
        </>
      }
    >
      <StudioDialog open={exporting} onClose={() => setExporting(false)} title={kind === 'vlog' ? 'Export for YouTube' : 'Export and post'}>
        <ExportPanel />
      </StudioDialog>
    </StudioShell>
  );
}

const ACCEPT = 'image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm,.mov,.m4v,.mkv';

function EmptyStage({ kind }: { kind: 'reel' | 'vlog' }) {
  const [msg, setMsg] = useState('');
  return (
    <div className="mst-empty">
      {kind === 'vlog' ? <YouTubeIcon /> : <ReelIcon />}
      <h2>{kind === 'vlog' ? 'Make a YouTube video' : 'Make a Reel or Short'}</h2>
      <p>
        {kind === 'vlog'
          ? 'Load your clips and photos, trim and arrange them on the timeline, add titles and music, and export a 16:9 MP4 for YouTube.'
          : 'Photos and clips become a vertical video with movement, text, stickers and music, ready for Instagram Reels or YouTube Shorts.'}
      </p>
      <label className="btn primary mst-file">
        <AddPhotoIcon />
        Add videos or photos
        <input type="file" accept={ACCEPT} multiple onChange={(e) => void addMedia([...(e.target.files ?? [])].map((f) => ({ name: f.name, blob: f, type: f.type }))).then((m) => setMsg(m[0] ?? ''))} />
      </label>
      {msg && <p className="hint bad">{msg}</p>}
      <LimitsNote />
    </div>
  );
}

function LimitsNote() {
  const kind = useVideo((s) => s.kind);
  const L = limits(kind);
  return (
    <DesktopNote>
      In the browser, {kind === 'vlog' ? 'YouTube videos' : 'Reels'} can be up to {limitText(L.seconds)} long with {L.clips} clips and files up to{' '}
      {L.fileMB >= 1024 ? `${L.fileMB / 1024} GB` : `${L.fileMB} MB`}, at 30 fps{kind === 'vlog' ? ' and 1080p' : ''}: video processing in a browser tab is limited by its memory and
      can slow down in the background. The desktop app is the full studio: {kind === 'vlog' ? 'videos up to 3 hours, 1440p and 4K, 60 fps,' : 'Reels up to 3 minutes, 60 fps,'} bigger files, and faster
      exports with your graphics card.
    </DesktopNote>
  );
}

function MediaPanel() {
  const photos = useIg((s) => s.items);
  const [msgs, setMsgs] = useState<string[]>([]);
  const add = async (files: FileList | File[] | null) => {
    if (files?.length) setMsgs(await addMedia([...files].map((f) => ({ name: f.name, blob: f, type: f.type }))));
  };
  return (
    <>
      <div className="ig-group">
        <h3>Add media</h3>
        <label
          className="mst-drop"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void add(e.dataTransfer.files);
          }}
        >
          <AddPhotoIcon />
          <span>
            <b>Choose videos or photos</b> or drop them here
          </span>
          <small>MP4, MOV, WebM, MKV · JPG, PNG, WebP</small>
          <input type="file" accept={ACCEPT} multiple onChange={(e) => void add(e.target.files).then(() => (e.target.value = ''))} />
        </label>
        {photos.length > 0 && (
          <button type="button" className="sbtn" onClick={() => void addMedia(photos.map((p) => ({ name: p.name, blob: p.file }))).then(setMsgs)}>
            Use the {photos.length} photo{photos.length === 1 ? '' : 's'} from Photos
          </button>
        )}
        {msgs.length > 0 && (
          <ul className="msgs" role="alert">
            {msgs.map((m, i) => (
              <li key={i} className="err">
                {m}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="ig-group">
        <LimitsNote />
        <p className="hint">New clips go to the end of the timeline. Drag them there to reorder; drag their edges to trim.</p>
      </div>
    </>
  );
}

/** One <video> element per video clip, created on demand; redraws when a seek lands. */
function useClipVideos(onFrame: () => void) {
  const els = useRef(new Map<string, HTMLVideoElement>());
  const cb = useRef(onFrame);
  cb.current = onFrame;
  useEffect(() => {
    const map = els.current;
    return () => {
      for (const v of map.values()) {
        v.pause();
        v.removeAttribute('src');
        v.load();
      }
      map.clear();
    };
  }, []);
  return useCallback((c: VClip): HTMLVideoElement => {
    let v = els.current.get(c.id);
    if (!v) {
      v = document.createElement('video');
      v.preload = 'auto';
      v.playsInline = true;
      v.src = c.url;
      v.addEventListener('seeked', () => cb.current());
      v.addEventListener('loadeddata', () => cb.current());
      els.current.set(c.id, v);
    }
    return v;
  }, []);
}

function VideoStage() {
  const ref = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const clips = useVideo((s) => s.clips),
    layers = useVideo((s) => s.layers),
    layerSel = useVideo((s) => s.layerSel),
    tools = useVideo((s) => s.tools),
    format = useVideo((s) => s.format),
    fadeOut = useVideo((s) => s.fadeOut),
    music = useVideo((s) => s.music),
    tracks = useVideo((s) => s.tracks),
    musicMuted = useVideo((s) => s.tracks.some((tr) => tr.id === MUSIC && tr.muted)),
    playing = useVideo((s) => s.playing),
    t = useVideo((s) => s.t);
  const f = vFormat(format);
  const { width, height } = useFit(box, f.w, f.h, 56);
  const tick = useFontsTick(layers);
  const audio = useRef<HTMLAudioElement | null>(null);
  const draw = useRef<() => void>(() => undefined);
  const videoFor = useClipVideos(() => draw.current());

  draw.current = () => {
    const cv = ref.current,
      x = cv?.getContext('2d');
    if (!cv || !x || width <= 0) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1),
      W = Math.round(width * dpr),
      H = Math.round(height * dpr);
    if (cv.width !== W || cv.height !== H) {
      cv.width = W;
      cv.height = H;
    }
    const s = getVideo(),
      p = videoAt(projectOf(s), s.t);
    if (!p && !s.clips.length) return;
    let src: CanvasImageSource | null = null,
      sw = 0,
      sh = 0;
    if (p?.clip.kind === 'photo' && p.clip.still) {
      src = p.clip.still;
      sw = p.clip.still.width;
      sh = p.clip.still.height;
    } else if (p?.clip.kind === 'video') {
      const v = videoFor(p.clip);
      if (v.readyState >= 2) {
        src = v;
        sw = v.videoWidth;
        sh = v.videoHeight;
      }
    }
    // No clip shows when the video track is hidden: black with the layers, as the export draws it.
    renderFrame(x, W, H, p?.clip ?? NO_PICTURE, src, sw, sh, p ? p.local : s.t, s.layers, s.t, videoLength(s), s.fadeOut);
    const sel = s.layerSel && s.layers.find((l) => l.id === s.layerSel && !l.hidden && (l.start ?? 0) <= s.t && s.t < (l.end ?? Infinity));
    if (sel) drawSelection(x, layerBox(x, sel, W, H), handleRadius(cv));
  };

  /** Points each clip's <video> at the playhead: the current one seeks (and plays when playing), the rest pause. */
  const sync = useCallback(
    (play: boolean) => {
      const s = getVideo(),
        // A hidden video track still plays its clips' sound (D2): find the clip as if it were shown.
        p = videoAt({ ...projectOf(s), tracks: s.tracks.map((tr) => (tr.id === MAIN_VIDEO ? { ...tr, hidden: false } : tr)) }, s.t);
      for (const c of s.clips) {
        if (c.kind !== 'video') continue;
        const v = videoFor(c);
        if (p && c.id === p.clip.id) {
          const want = c.in + p.local;
          v.volume = Math.max(0, Math.min(1, c.volume));
          v.muted = c.volume <= 0;
          if (play) {
            if (Math.abs(v.currentTime - want) > 0.3) v.currentTime = want;
            if (v.paused) void v.play().catch(() => undefined);
          } else {
            v.pause();
            if (Math.abs(v.currentTime - want) > 0.02) v.currentTime = want;
          }
        } else if (!v.paused) v.pause();
      }
    },
    [videoFor],
  );

  useEffect(() => {
    if (playing) return;
    sync(false);
    draw.current();
  }, [clips, tracks, layers, layerSel, format, fadeOut, t, tick, playing, width, height, sync]);

  // Playback: advance the playhead with the wall clock, keep the clip videos and the music in step.
  useEffect(() => {
    if (!playing) return;
    const s0 = getVideo();
    const startT = s0.t >= videoLength(s0) - 0.05 ? 0 : s0.t,
      startWall = performance.now();
    setPlayhead(startT);
    if (music) {
      const a = audio.current ?? new Audio();
      audio.current = a;
      if (a.src !== music.url) a.src = music.url;
      a.volume = music.volume;
      a.muted = getVideo().tracks.some((tr) => tr.id === MUSIC && tr.muted);
      a.currentTime = music.offset + startT;
      void a.play().catch(() => undefined);
    }
    let raf = 0;
    const loop = () => {
      const now = startT + (performance.now() - startWall) / 1000,
        end = videoTotal();
      if (now >= end) {
        setPlayhead(end);
        setPlaying(false);
        return;
      }
      setPlayhead(now);
      sync(true);
      draw.current();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      audio.current?.pause();
      sync(false);
    };
  }, [playing, music, sync]);
  // Muting the music track while it plays.
  useEffect(() => {
    if (audio.current) audio.current.muted = musicMuted;
  }, [musicMuted]);
  useEffect(() => () => audio.current?.pause(), []);

  const handlers = useLayerPointer({
    canvas: ref,
    layers,
    selected: layerSel,
    tools,
    t,
    onSelect: selectVLayer,
    onUpdate: (id, layer, key) => updateVLayer(id, layer, key),
    onSetLayers: (ls, key, sel) => setVLayers(ls, key, sel),
    onRemove: removeVLayer,
    onEndStep: endVStep,
  });

  return (
    <div className="mst-surface" ref={box}>
      <canvas
        ref={ref}
        tabIndex={0}
        className={`mst-canvas${tools.tool === 'draw' ? ' drawing' : ''}`}
        style={{ width, height }}
        aria-label={`Video frame at ${fmtTime(t)}, ${f.ratio}. Drag a layer to move it, its corner handle to resize, its top handle to turn it. Delete removes the selected layer. Space plays and pauses.`}
        onDoubleClick={() => document.getElementById('layer-text')?.focus()}
        {...handlers}
      />
      <p className="mst-hint">{tools.tool === 'draw' ? 'Drawing: drag on the frame' : 'Drag a layer to move it · Space plays'}</p>
    </div>
  );
}

function Range({ id, label, value, min, max, step = 0.1, show, onChange }: { id: string; label: string; value: number; min: number; max: number; step?: number; show: string; onChange: (v: number) => void }) {
  return (
    <div className="ig-slider">
      <label htmlFor={id}>
        {label} <output htmlFor={id}>{show}</output>
      </label>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} />
    </div>
  );
}

function ClipPanel({ clip: c }: { clip: VClip }) {
  const clips = useVideo((s) => s.clips);
  const i = clips.findIndex((x) => x.id === c.id);
  const room = limits().seconds - (useVideo(videoLength) - clipLength(c));
  const locked = useVideo((s) => lockedReason(s.tracks, c.track));
  const e = c.edit;
  return (
    <div className="lp">
      {locked && <p className="hint lp-locked">{locked}</p>}
      <fieldset className="lp-fs" disabled={!!locked}>
      <div className="ig-group">
        <h3>
          Clip {i + 1} · {c.kind === 'video' ? 'video' : 'photo'}
        </h3>
        <p className="hint ig-name" title={c.name}>
          {c.name} · {c.w}×{c.h}
          {c.kind === 'video' ? ` · ${fmtTime(c.srcDur)}` : ''}
        </p>
        {c.kind === 'photo' ? (
          <>
            <Range id="v-dur" label="On screen for" value={c.dur} min={0.5} max={Math.max(0.5, Math.min(30, room))} show={`${c.dur.toFixed(1)} s`} onChange={(dur) => updateClip(c.id, { dur })} />
            <span className="lp-label">Movement</span>
            <div className="chips" role="radiogroup" aria-label="Movement">
              {MOTIONS.map(([id, label]) => (
                <button key={id} type="button" role="radio" className="chip" aria-checked={c.motion === id} onClick={() => updateClip(c.id, { motion: id as Motion }, '')}>
                  {label}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <Range id="v-in" label="Starts at" value={c.in} min={0} max={Math.max(0, c.out - 0.3)} step={1 / 30} show={fmtTime(c.in)} onChange={(v) => updateClip(c.id, { in: Math.min(v, c.out - 0.3) }, `trim-in:${c.id}`)} />
            <Range id="v-out" label="Ends at" value={c.out} min={c.in + 0.3} max={Math.min(c.srcDur, c.in + room)} step={1 / 30} show={fmtTime(c.out)} onChange={(v) => updateClip(c.id, { out: Math.max(v, c.in + 0.3) }, `trim-out:${c.id}`)} />
            <Range id="v-vol" label="Clip sound" value={c.volume} min={0} max={1} step={0.05} show={c.volume ? `${Math.round(c.volume * 100)}%` : 'muted'} onChange={(volume) => updateClip(c.id, { volume })} />
          </>
        )}
        <Check checked={c.fade} onChange={(fade) => updateClip(c.id, { fade }, '')}>
          Fade in from black
        </Check>
      </div>
      <div className="ig-group">
        <h3>Frame</h3>
        <Seg<'fill' | 'fit'>
          label="How the picture fills the frame"
          value={e.fit}
          options={[
            ['fill', 'Fill the frame'],
            ['fit', 'Whole picture'],
          ]}
          onChange={(fit) => editClip(c.id, { fit, px: 0, py: 0 })}
        />
        {e.fit === 'fit' && (
          <Check checked={e.bg === 'blur'} onChange={(on) => editClip(c.id, { bg: on ? 'blur' : '#000000' })}>
            Blurred background
          </Check>
        )}
        <Range id="v-zoom" label="Zoom" value={e.zoom} min={1} max={3} step={0.01} show={e.zoom.toFixed(2)} onChange={(zoom) => editClip(c.id, { zoom })} />
        <Range id="v-px" label="Left–right" value={e.px} min={-1} max={1} step={0.01} show={e.px.toFixed(2)} onChange={(px) => editClip(c.id, { px })} />
        <Range id="v-py" label="Up–down" value={e.py} min={-1} max={1} step={0.01} show={e.py.toFixed(2)} onChange={(py) => editClip(c.id, { py })} />
      </div>
      <div className="ig-group">
        <h3>Colour</h3>
        <LookPicker idPrefix="v" adjust={e.adjust} onChange={(patch) => adjustClip(c.id, patch)} />
        <Range id="v-br" label="Brightness" value={e.adjust.brightness} min={-100} max={100} step={1} show={String(e.adjust.brightness)} onChange={(brightness) => adjustClip(c.id, { brightness })} />
        <Range id="v-ct" label="Contrast" value={e.adjust.contrast} min={-100} max={100} step={1} show={String(e.adjust.contrast)} onChange={(contrast) => adjustClip(c.id, { contrast })} />
        <Range id="v-sa" label="Saturation" value={e.adjust.saturation} min={-100} max={100} step={1} show={String(e.adjust.saturation)} onChange={(saturation) => adjustClip(c.id, { saturation })} />
        <Range id="v-wa" label="Warmth" value={e.adjust.warmth} min={-100} max={100} step={1} show={String(e.adjust.warmth)} onChange={(warmth) => adjustClip(c.id, { warmth })} />
      </div>
      </fieldset>
    </div>
  );
}

function ProjectPanel() {
  const clips = useVideo((s) => s.clips),
    kind = useVideo((s) => s.kind),
    total = useVideo(videoLength);
  const L = limits(kind);
  return (
    <div className="lp">
      <div className="ig-group">
        <h3>Project</h3>
        <p className="hint">
          {clips.length} clip{clips.length === 1 ? '' : 's'} · {fmtTime(total)} of up to {limitText(L.seconds)}.
        </p>
        <p className="hint">Choose a clip on the timeline to edit it, or a layer to change it.</p>
      </div>
    </div>
  );
}

function MusicPanel() {
  const music = useVideo((s) => s.music);
  const [msg, setMsg] = useState('');
  const total = useVideo(videoLength);
  const locked = useVideo((s) => lockedReason(s.tracks, MUSIC));
  return (
    <div className="ig-group">
      <h3>Music</h3>
      <p className="hint">Add a song or sound from this device. Use music you have the right to post: Instagram and YouTube may mute or claim recognised songs.</p>
      {locked && <p className="hint lp-locked">{locked}</p>}
      <fieldset className="lp-fs" disabled={!!locked}>
      <label className="sbtn mst-file">
        <MusicIcon />
        {music ? 'Choose another sound' : 'Add music'}
        <input
          type="file"
          accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.opus,.flac"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void setMusicFile(f).then((m) => setMsg(m ?? ''));
          }}
        />
      </label>
      {msg && (
        <p className="hint bad" role="alert">
          {msg}
        </p>
      )}
      {music && (
        <>
          <p className="hint ig-name" title={music.name}>
            {music.name} · {fmtTime(music.dur)}
          </p>
          <Range id="m-vol" label="Volume" value={music.volume} min={0} max={1} step={0.05} show={`${Math.round(music.volume * 100)}%`} onChange={(volume) => updateMusic({ volume })} />
          <Range id="m-off" label="Start the song at" value={music.offset} min={0} max={Math.max(0, music.dur - Math.min(total, music.dur))} step={0.5} show={fmtTime(music.offset)} onChange={(offset) => updateMusic({ offset })} />
          <p className="hint">Or drag the music on the timeline. It fades out over the last seconds. Lower a clip’s own sound in its inspector.</p>
          <button type="button" className="sbtn" onClick={removeMusic}>
            <TrashIcon />
            Remove music
          </button>
        </>
      )}
      </fieldset>
    </div>
  );
}

function ExportPanel() {
  const clips = useVideo((s) => s.clips),
    kind = useVideo((s) => s.kind),
    format = useVideo((s) => s.format),
    fps = useVideo((s) => s.fps),
    fadeOut = useVideo((s) => s.fadeOut),
    quality = useVideo((s) => s.quality),
    progress = useVideo((s) => s.progress),
    result = useVideo((s) => s.result),
    savedTo = useVideo((s) => s.savedTo);
  const caption = useIg((s) => s.caption);
  const total = useVideo(videoLength);
  const L = limits(kind);
  const f = vFormat(format);
  const tooShort = clips.length > 0 && total < L.minSeconds;
  const shareable = !!result && !isDesktop && canShareFiles([result]);
  const streams = kind === 'vlog' && canStreamToDisk();
  const mbps = bitrateFor(f, fps, quality) / 1e6;
  const sizeMB = ((bitrateFor(f, fps, quality) + 128000) / 8 / 1048576) * total;

  const run = async () => {
    try {
      const out = await exportVideo();
      if (out?.kind === 'file') toast(`Video ready: ${(out.file.size / 1048576).toFixed(1)} MB.`);
      if (out?.kind === 'saved') toast(`Saved ${out.name.split(/[\\/]/).pop()}.`);
    } catch (e) {
      logError('handled', e);
      toast(e instanceof Error && e.message ? e.message : 'The video couldn’t be made.');
    }
  };
  const post = async () => {
    if (!result) return;
    const text = getIg().caption;
    if (text) await navigator.clipboard?.writeText(text).catch(() => undefined);
    if (shareable) {
      try {
        await navigator.share({ files: [result], text: text || undefined });
        if (text) toast('Caption copied: paste it into Instagram.');
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        logError('handled', e);
      }
    }
    await saveFile(result.name, result);
    if (desktop) await desktop.openExternal(INSTAGRAM_WEB);
    else window.open(INSTAGRAM_WEB, '_blank', 'noopener');
    toast('Video saved. On Instagram, choose Create (+), then Reel, and select it.');
  };

  return (
    <div className="ig-export">
      <div className="ig-export-grid">
        <div>
          <h3>Video</h3>
          <p className="hint">
            {f.ratio} {f.label} · {f.w}×{f.h} · H.264 + AAC sound · {fmtTime(total)}
          </p>
          {L.fps.length > 1 && (
            <>
              <span className="lp-label">Frame rate</span>
              <Seg<'30' | '60'>
                label="Frame rate"
                value={String(fps) as '30' | '60'}
                options={[
                  ['30', '30 fps'],
                  ['60', '60 fps (smoother motion)'],
                ]}
                onChange={(v) => setVideoOptions({ fps: +v as VFps })}
              />
            </>
          )}
          <span className="lp-label">Quality</span>
          <Seg<VQuality>
            label="Quality"
            value={quality}
            options={[
              ['standard', kind === 'vlog' ? 'Standard (YouTube’s recommendation)' : 'Standard (5 Mbit/s)'],
              ['high', 'High'],
            ]}
            onChange={(q) => setVideoOptions({ quality: q })}
          />
          <p className="hint">
            {mbps.toFixed(1)} Mbit/s · about {sizeMB >= 1024 ? `${(sizeMB / 1024).toFixed(1)} GB` : `${Math.max(1, Math.round(sizeMB))} MB`}
          </p>
          <Check checked={fadeOut} onChange={(v) => setVideoOptions({ fadeOut: v })}>
            Fade to black at the end
          </Check>
        </div>
        <div>
          {kind === 'reel' ? (
            <>
              <h3>
                <label htmlFor="v-caption">Caption</label>
              </h3>
              <textarea id="v-caption" rows={3} maxLength={2200} placeholder="Write a caption. It’s copied for you when you post." value={caption} onChange={(e) => setIg({ caption: e.target.value })} />
            </>
          ) : (
            <>
              <h3>Saving</h3>
              <p className="hint">
                {streams
                  ? 'You choose where to save, then the video is written straight to that file as it is made, so even a long video never has to fit in memory.'
                  : 'This browser can’t write straight to a file, so the video is built in memory first: keep it short, or use Chrome, Edge or the desktop app.'}{' '}
                Upload it at{' '}
                <a href={YOUTUBE_UPLOAD} target="_blank" rel="noopener noreferrer">
                  youtube.com/upload
                </a>
                .
              </p>
            </>
          )}
          <LimitsNote />
        </div>
      </div>

      {progress ? (
        <div className="v-progress" role="status">
          <progress max={1} value={progress.frac} aria-label="Export progress" />
          <span>
            {Math.round(progress.frac * 100)}% · {progress.phase}
          </span>
          <button type="button" className="btn" onClick={cancelExport}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="ig-actions">
          <button type="button" className="btn primary" disabled={!clips.length || tooShort} onClick={() => void run()}>
            <DownloadIcon />
            {result || savedTo ? 'Export again' : `Export MP4 (${fmtTime(total)})`}
          </button>
          {result && (
            <>
              <button type="button" className="btn primary" onClick={() => void post()}>
                {shareable ? <ShareIcon /> : <InstagramIcon />}
                {shareable ? 'Share to Instagram' : 'Save and open Instagram'}
              </button>
              <button type="button" className="btn" onClick={() => void saveFile(result.name, result)}>
                <DownloadIcon />
                Download MP4 ({(result.size / 1048576).toFixed(1)} MB)
              </button>
            </>
          )}
          {savedTo && (
            <>
              <span className="hint">Saved: {savedTo.split(/[\\/]/).pop()}</span>
              {desktop && (
                <button type="button" className="btn" onClick={() => void desktop!.showInFolder(savedTo)}>
                  <FolderIcon />
                  Show in folder
                </button>
              )}
              <a className="btn" href={YOUTUBE_UPLOAD} target="_blank" rel="noopener noreferrer">
                <YouTubeIcon />
                Open YouTube upload
              </a>
            </>
          )}
        </div>
      )}
      <p className="hint">
        {!clips.length
          ? 'Add clips to export a video.'
          : tooShort
            ? `Instagram needs at least ${L.minSeconds} seconds: lengthen a photo or add a clip.`
            : 'Exporting renders every frame on this device. Keep this tab in front while it works; browsers slow down background tabs.'}
      </p>
    </div>
  );
}
