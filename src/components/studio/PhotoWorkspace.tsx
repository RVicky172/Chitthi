import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import {
  IG_BATCH_PRESETS,
  IG_CAPTION_MAX,
  IG_CAPTION_PREVIEW,
  IG_FILE_TYPES,
  IG_FILE_WARN_BYTES,
  IG_FORMATS,
  IG_HASHTAG_MAX,
  IG_MAX_BATCH,
  igFormat,
  type IgFileType,
  type IgFormatId,
} from '../../data/instagram';
import { DEFAULT_ADJUST, type Adjustments } from '../../engine/adjust';
import { neutralise } from '../../engine/light';
import { photoPlace, placement, renderIg, showsBackground, type IgEdit, type IgRotation } from '../../engine/instagram';
import { drawLayers, drawSelection, layerBox } from '../../engine/layers';
import {
  BRUSH_RANGES,
  dragPart,
  frameMask,
  frameToPhoto,
  MASK_LIMITS,
  newBrushPart,
  partHandles,
  type BrushStroke,
  type HandleId,
  type LinearPart,
  type Mask,
  type MaskPart,
  type PhotoPlace,
  type RadialPart,
} from '../../engine/masks';
import { MAX_MB } from '../../engine/photo';
import { RAW_EXTS } from '../../engine/raw';
import { encodableTypes, PHOTO_TYPES } from '../../engine/photoExport';
import { saveFile } from '../../lib/download';
import { logError } from '../../lib/errors';
import { toast } from '../../lib/toast';
import { desktop, isDesktop } from '../../platform/desktop';
import {
  addLayer,
  addPhotos,
  adjustAll,
  applyLookToAll,
  canShareFiles,
  clearBatch,
  copyLayersToAll,
  adjustPhoto,
  editPhoto,
  endStep,
  getIg,
  movePhotoTo,
  prepareBatch,
  redo,
  removeLayer,
  removePhoto,
  resetPhoto,
  restackLayer,
  selectLayer,
  selectMask,
  selectPhoto,
  setIg,
  setLayers,
  setLimit,
  setPicking,
  setTools,
  undo,
  updateLayer,
  updateMask,
  useIg,
  zipOf,
  type IgItem,
} from '../../state/instagram';
import { fullUrl, useLibrary } from '../../state/library';
import type { StoredPhoto } from '../../types';
import { Check, Seg } from '../common';
import { AddElements, AddText, DrawPanel, LayerList, LayerProps, typingIn, type LayerPanelProps } from '../ig/LayerPanel';
import { ColourMixer } from '../ig/ColourMixer';
import { CurveEditor } from '../ig/CurveEditor';
import { LookPicker } from '../ig/LookPicker';
import { addMask, MaskInspector, MaskPanel } from '../ig/MaskPanel';
import { Slider } from '../ig/Slider';
import { useSegmentsTick } from '../ig/useAiMask';
import { handleRadius, useFontsTick, useLayerPointer } from '../ig/useLayerPointer';
import {
  AddPhotoIcon,
  AdjustIcon,
  PipetteIcon,
  BrushIcon,
  DownloadIcon,
  FlipIcon,
  ImageIcon,
  InstagramIcon,
  LayersIcon,
  MaskIcon,
  NextIcon,
  PhotosIcon,
  PrevIcon,
  RedoIcon,
  ResetIcon,
  RotateLeftIcon,
  RotateRightIcon,
  ShapesIcon,
  ShareIcon,
  TrashIcon,
  TypeIcon,
  UndoIcon,
} from '../icons';
import { MoreMenu } from '../MoreMenu';
import { StudioDialog } from './Dialog';
import { StudioShell, useFit, type RailItem, type StudioMode } from './Shell';

/*
 * The Instagram photo editor in the studio layout: up to 20 photos in one format, each with its own framing, colour
 * and layers, exported as files or shared to the Instagram app. State: state/instagram.ts; drawing:
 * engine/instagram.ts and engine/layers.ts.
 */

type Tool = 'media' | 'masks' | 'text' | 'elements' | 'draw' | 'layers';
const RAIL: RailItem<Tool>[] = [
  { id: 'media', label: 'Photos', icon: <ImageIcon /> },
  { id: 'masks', label: 'Masks', icon: <MaskIcon /> },
  { id: 'text', label: 'Text', icon: <TypeIcon /> },
  { id: 'elements', label: 'Elements', icon: <ShapesIcon /> },
  { id: 'draw', label: 'Draw', icon: <BrushIcon /> },
  { id: 'layers', label: 'Layers', icon: <LayersIcon /> },
];

const INSTAGRAM_WEB = 'https://www.instagram.com/';

/** A data: URL as a Blob, without fetch() (the web CSP doesn't allow fetching data: URLs). */
function dataUrlToBlob(url: string): Blob {
  const [head, body = ''] = url.split(',');
  const type = /data:([^;,]+)/.exec(head)?.[1] ?? 'image/jpeg';
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

/** The selected mask as a red tint over the photo (the stage only, never exports). */
function drawMaskOverlay(x: CanvasRenderingContext2D, it: IgItem, mask: Mask, W: number, H: number): void {
  const f = frameMask(mask, it.preview.width, it.preview.height, photoPlace(it.preview.width, it.preview.height, it.edit, W, H), W, H, it.preview);
  const tint = document.createElement('canvas');
  tint.width = f.width;
  tint.height = f.height;
  const t = tint.getContext('2d');
  if (!t) return;
  const img = t.createImageData(f.width, f.height),
    d = new Uint32Array(img.data.buffer);
  // Red at half strength where the mask is full (little-endian RGBA: alpha in the top byte).
  for (let i = 0; i < f.data.length; i++) if (f.data[i]) d[i] = ((f.data[i] >> 1) << 24) | 0x4024e8;
  t.putImageData(img, 0, 0);
  x.drawImage(tint, 0, 0, W, H);
}

/**
 * A gradient's guides on the stage: a linear one's full and empty lines (and its middle, dashed), a radial one's edge
 * (and where its feather starts, dashed), with their handles. Drawn on the photo, turned and mirrored with it.
 */
function drawPartGuide(x: CanvasRenderingContext2D, part: MaskPart, p: PhotoPlace, r: number): void {
  if (part.kind !== 'linear' && part.kind !== 'radial') return;
  x.save();
  x.translate(p.cx, p.cy);
  x.rotate((p.rot * Math.PI) / 180);
  if (p.flip) x.scale(-1, 1);
  x.translate((part.x - 0.5) * p.w, (part.y - 0.5) * p.h);
  x.rotate((part.angle * Math.PI) / 180);
  const line = (draw: () => void, dashed = false) => {
    for (const [colour, wd] of [
      ['rgba(0,0,0,0.55)', r * 0.45],
      ['#ffffff', r * 0.22],
    ] as const) {
      x.setLineDash(dashed ? [r, r * 0.8] : []);
      x.strokeStyle = colour;
      x.lineWidth = Math.max(1, wd);
      x.beginPath();
      draw();
      x.stroke();
    }
  };
  if (part.kind === 'linear') {
    const w = (part.width * p.w) / 2,
      L = Math.hypot(p.w, p.h);
    for (const at of [-w, 0, w])
      line(() => {
        x.moveTo(at, -L);
        x.lineTo(at, L);
      }, at === 0);
  } else {
    const rx = part.rx * p.w,
      ry = part.ry * p.w,
      k = 1 - part.feather / 100;
    line(() => x.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2));
    if (k > 0.02) line(() => x.ellipse(0, 0, rx * k, ry * k, 0, 0, Math.PI * 2), true);
  }
  x.restore();
  for (const h of partHandles(part, p)) {
    x.beginPath();
    x.arc(h.x, h.y, h.id === 'move' ? r * 0.9 : r * 0.7, 0, Math.PI * 2);
    x.fillStyle = h.id === 'move' ? '#ffffff' : '#e82440';
    x.fill();
    x.lineWidth = Math.max(1, r * 0.2);
    x.strokeStyle = 'rgba(0,0,0,0.6)';
    x.stroke();
  }
}

/** What the stage shows of the masks while the Masks tool is open: the selected mask in red, its gradient's guides. */
interface MaskView {
  mask: Mask;
  part: MaskPart | null;
  overlay: boolean;
}

/**
 * Draws one photo, its layers and (for the stage) the selected layer's handles and the selected mask's overlay, at
 * `width` CSS px.
 */
function useRender(ref: RefObject<HTMLCanvasElement | null>, it: IgItem | undefined, formatId: IgFormatId, width: number, selection: string | null = null, view: MaskView | null = null) {
  const tick = useFontsTick(it?.layers ?? []),
    segs = useSegmentsTick();
  useEffect(() => {
    const cv = ref.current;
    if (!cv || !it || width <= 0) return;
    const f = igFormat(formatId),
      dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(width * dpr),
      H = Math.round((width * dpr * f.h) / f.w);
    if (cv.width !== W || cv.height !== H) {
      cv.width = W;
      cv.height = H;
    }
    const x = cv.getContext('2d');
    if (!x) return;
    x.fillStyle = '#ffffff';
    x.fillRect(0, 0, W, H);
    renderIg(x, it.preview, it.preview.width, it.preview.height, it.edit, W, H);
    drawLayers(x, it.layers, W, H);
    const sel = selection && it.layers.find((l) => l.id === selection && !l.hidden);
    if (sel) drawSelection(x, layerBox(x, sel, W, H), handleRadius(cv));
    if (view?.overlay) drawMaskOverlay(x, it, view.mask, W, H);
    if (view?.part) drawPartGuide(x, view.part, photoPlace(it.preview.width, it.preview.height, it.edit, W, H), handleRadius(cv));
  }, [ref, it, formatId, width, selection, tick, segs, view]);
}

export function PhotoWorkspace({ mode, onMode }: { mode: StudioMode; onMode: (m: StudioMode) => void }) {
  const items = useIg((s) => s.items),
    selected = useIg((s) => s.selected),
    layerSel = useIg((s) => s.layerSel),
    format = useIg((s) => s.format),
    canUndo = useIg((s) => s.canUndo),
    canRedo = useIg((s) => s.canRedo);
  const [tool, setTool] = useState<Tool | null>(() => (getIg().items.length ? 'text' : 'media'));
  const [exporting, setExporting] = useState(false);
  const current = items.find((x) => x.id === selected) ?? items[0];
  const maskSel = useIg((s) => s.maskSel);
  const f = igFormat(format);

  // The Draw tool draws layers on the stage; the Masks tool paints the selected mask.
  useEffect(() => {
    setTools({ tool: tool === 'draw' ? 'draw' : tool === 'masks' ? 'mask' : 'select' });
    return () => setTools({ tool: 'select' });
  }, [tool]);

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || typingIn(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
        e.preventDefault();
        redo();
      }
    };
    document.addEventListener('keydown', on);
    return () => document.removeEventListener('keydown', on);
  }, []);

  const layerProps: LayerPanelProps | null = current
    ? {
        layers: current.layers,
        selected: layerSel,
        onSelect: selectLayer,
        onAdd: (l) => addLayer(current.id, l),
        onUpdate: (id, patch, key) => updateLayer(current.id, id, patch, key),
        onRemove: (id) => removeLayer(current.id, id),
        onRestack: (id, by) => restackLayer(current.id, id, by),
      }
    : null;

  const panel =
    tool === 'media' ? (
      <MediaPanel />
    ) : !layerProps ? (
      <p className="hint mst-pad">Add photos first: choose Photos in the tool rail.</p>
    ) : tool === 'masks' ? (
      <MaskPanel item={current!} />
    ) : tool === 'text' ? (
      <AddText {...layerProps} />
    ) : tool === 'elements' ? (
      <AddElements {...layerProps} />
    ) : tool === 'draw' ? (
      <DrawPanel tools={getIg().tools} onTools={setTools} onNewDrawing={() => selectLayer(null)} />
    ) : (
      <LayerList
        {...layerProps}
        extra={
          items.length > 1 && current!.layers.length > 0 ? (
            <button
              type="button"
              className="sbtn"
              onClick={() => {
                copyLayersToAll(current!.id);
                toast('Layers copied to every photo in the batch.');
              }}
            >
              Copy these layers to every photo
            </button>
          ) : null
        }
      />
    );

  return (
    <StudioShell
      mode={mode}
      onMode={onMode}
      rail={RAIL}
      tool={tool}
      onTool={setTool}
      actions={
        <>
          <button type="button" className="btn icon ghost" aria-label="Undo (Ctrl+Z)" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo}>
            <UndoIcon />
          </button>
          <button type="button" className="btn icon ghost" aria-label="Redo (Ctrl+Y)" title="Redo (Ctrl+Y)" disabled={!canRedo} onClick={redo}>
            <RedoIcon />
          </button>
          <MoreMenu
            className="mst-format"
            text={`${f.ratio} ${f.label}`}
            label="Post format"
            items={IG_FORMATS.map((x) => ({ key: x.id, label: `${x.ratio} · ${x.label} (${x.w}×${x.h})`, current: x.id === format, onSelect: () => setIg({ format: x.id }) }))}
          />
          <button type="button" className="btn primary" aria-label="Export" disabled={!items.length} onClick={() => setExporting(true)}>
            <DownloadIcon />
            <span className="mst-l">Export</span>
          </button>
        </>
      }
      panel={panel}
      inspector={
        !current ? (
          <p className="hint mst-pad">Nothing selected yet.</p>
        ) : tool === 'masks' && maskSel && current.edit.masks.some((m) => m.id === maskSel) ? (
          <MaskInspector item={current} />
        ) : layerSel && layerProps ? (
          <LayerProps {...layerProps} />
        ) : (
          <EditPanel item={current} />
        )
      }
      stage={current ? <PhotoStage item={current} /> : <EmptyStage onAdd={() => setTool('media')} />}
      dock={<PhotoStrip />}
    >
      <StudioDialog open={exporting} onClose={() => setExporting(false)} title="Export and post">
        <ExportPanel />
      </StudioDialog>
    </StudioShell>
  );
}

function EmptyStage({ onAdd }: { onAdd: () => void }) {
  const [msgs, setMsgs] = useState<string[]>([]);
  return (
    <div className="mst-empty">
      <InstagramIcon />
      <h2>Make Instagram posts</h2>
      <p>Add up to {IG_MAX_BATCH} photos. Each one is shaped to the post format; add text, stickers and drawings, then export or share.</p>
      <label className="btn primary mst-file">
        <AddPhotoIcon />
        Add photos
        <input type="file" accept={PHOTO_ACCEPT} multiple onChange={(e) => void addPhotos([...(e.target.files ?? [])].map((f) => ({ name: f.name, blob: f, type: f.type }))).then((m) => (setMsgs(m), onAdd()))} />
      </label>
      {msgs.length > 0 && <p className="hint bad">{msgs[0]}</p>}
    </div>
  );
}

/** Photos the file pickers offer: the web image types, and camera RAW files (developed in the desktop app, P1.9). */
const PHOTO_ACCEPT = ['image/jpeg', 'image/png', 'image/webp', ...RAW_EXTS.map((e) => `.${e}`)].join(',');

function MediaPanel() {
  const items = useIg((s) => s.items),
    limit = useIg((s) => s.limit),
    format = useIg((s) => s.format);
  const [msgs, setMsgs] = useState<string[]>([]);
  const [custom, setCustom] = useState(String(limit));
  useEffect(() => setCustom(String(limit)), [limit]);
  const f = igFormat(format);
  const add = async (files: FileList | File[] | null) => {
    if (files?.length) setMsgs(await addPhotos([...files].map((x) => ({ name: x.name, blob: x, type: x.type }))));
  };
  const chooseLimit = (n: number) => {
    const got = setLimit(n);
    if (got > n) toast(`The batch already has ${got} photos. Remove some to go lower.`);
  };
  return (
    <>
      <div className="ig-group">
        <h3>Add photos</h3>
        <label className="mst-drop">
          <AddPhotoIcon />
          <span>
            <b>Choose photos</b> or drop them here
          </span>
          <small>JPG, PNG or WebP up to {MAX_MB} MB; camera RAW {isDesktop ? 'in 16 bits' : '(its built-in preview)'}</small>
          <input type="file" accept={PHOTO_ACCEPT} multiple onChange={(e) => void add(e.target.files).then(() => (e.target.value = ''))} />
        </label>
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
        <h3>
          Batch size <span className="ig-count">{items.length} of {limit}</span>
        </h3>
        <div className="ig-limit" role="group" aria-label="Batch size">
          {IG_BATCH_PRESETS.map((n) => (
            <button key={n} type="button" className="chip" aria-pressed={limit === n} disabled={n < items.length} onClick={() => chooseLimit(n)}>
              {n}
            </button>
          ))}
          <label className="ig-limit-own">
            <span className="vh">Custom batch size, 1 to {IG_MAX_BATCH}</span>
            <input
              type="number"
              min={Math.max(1, items.length)}
              max={IG_MAX_BATCH}
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onBlur={() => chooseLimit(+custom)}
              onKeyDown={(e) => e.key === 'Enter' && chooseLimit(+custom)}
            />
          </label>
          <span className="hint">up to {IG_MAX_BATCH}</span>
        </div>
        <p className="hint">
          {f.ratio} {f.label.toLowerCase()}: {f.use} Instagram crops every photo of a carousel to the first photo’s shape, so one post uses one format.
        </p>
      </div>
      <div className="ig-group">
        <h3>
          <PhotosIcon /> From your photo library
        </h3>
        <LibraryPicker onMsgs={setMsgs} />
      </div>
      {items.length > 0 && (
        <button
          type="button"
          className="sbtn"
          onClick={() => {
            if (confirm('Remove every photo from this batch? Your photo library keeps its copies.')) clearBatch();
          }}
        >
          <TrashIcon />
          Clear batch
        </button>
      )}
    </>
  );
}

function LibraryPicker({ onMsgs }: { onMsgs: (m: string[]) => void }) {
  const { list, error } = useLibrary();
  const room = useIg((s) => s.limit - s.items.length);
  const [adding, setAdding] = useState<string | null>(null);
  const pick = async (sp: StoredPhoto) => {
    setAdding(sp.id);
    try {
      const url = await fullUrl(sp);
      const blob = url.startsWith('data:') ? dataUrlToBlob(url) : await (await fetch(url)).blob();
      onMsgs(await addPhotos([{ name: sp.name, blob }]));
    } catch (e) {
      logError('handled', e);
      onMsgs([`${sp.name} couldn’t be opened.`]);
    } finally {
      setAdding(null);
    }
  };
  if (error) return <p className="hint">The photo library isn’t available {isDesktop ? 'right now' : 'in this browser'}.</p>;
  if (!list) return <p className="hint">Loading your photo library…</p>;
  if (!list.length) return <p className="hint">Empty. Photos you add in the print studio appear here.</p>;
  return (
    <ul className="ig-lib" aria-label="Your photo library">
      {list.map((sp) => (
        <li key={sp.id}>
          <button type="button" disabled={room <= 0 || adding === sp.id} title={sp.name} aria-label={`Add ${sp.name}`} onClick={() => void pick(sp)}>
            {sp.thumb ? <img src={sp.thumb} alt="" /> : <span>{sp.name}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}

function PhotoStage({ item }: { item: IgItem }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const format = useIg((s) => s.format),
    items = useIg((s) => s.items),
    layerSel = useIg((s) => s.layerSel),
    tools = useIg((s) => s.tools),
    maskSel = useIg((s) => s.maskSel),
    brush = useIg((s) => s.maskBrush);
  const f = igFormat(format);
  const { width, height } = useFit(box, f.w, f.h, 72);
  const partSel = useIg((s) => s.partSel);
  const masking = tools.tool === 'mask';
  const selMask = masking ? (item.edit.masks.find((m) => m.id === maskSel) ?? null) : null,
    selPart = selMask?.parts.find((p) => p.id === partSel) ?? null;
  const view = useMemo<MaskView | null>(
    () => (selMask ? { mask: selMask, part: selPart, overlay: brush.overlay } : null),
    [selMask, selPart, brush.overlay],
  );
  const brushing = masking && (!selPart || selPart.kind === 'brush');
  useRender(ref, item, format, width, layerSel, view);
  const pan = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const i = items.findIndex((x) => x.id === item.id);

  const room = () => {
    const p = placement(item.preview.width, item.preview.height, item.edit, width, height);
    return { x: Math.abs(p.dw - width) / 2, y: Math.abs(p.dh - height) / 2 };
  };
  const panKey = (e: ReactKeyboardEvent<HTMLCanvasElement>) => {
    const step = e.shiftKey ? 0.2 : 0.05,
      ed = item.edit,
      c = (v: number) => Math.max(-1, Math.min(1, v));
    const map: Record<string, Partial<IgEdit>> = {
      ArrowLeft: { px: c(ed.px - step) },
      ArrowRight: { px: c(ed.px + step) },
      ArrowUp: { py: c(ed.py - step) },
      ArrowDown: { py: c(ed.py + step) },
      '+': { zoom: Math.min(4, ed.zoom + 0.1) },
      '=': { zoom: Math.min(4, ed.zoom + 0.1) },
      '-': { zoom: Math.max(1, ed.zoom - 0.1) },
    };
    if (!map[e.key]) return false;
    e.preventDefault();
    editPhoto(item.id, map[e.key]);
    return true;
  };
  const picking = useIg((s) => s.picking);
  // The white-balance eyedropper: sample the photo with only its look applied (before white balance), 5×5 pixels around
  // the click, and set the temperature and tint that turn that colour grey.
  const pickGrey = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const cv = e.currentTarget,
      rect = cv.getBoundingClientRect(),
      x = Math.round(((e.clientX - rect.left) / rect.width) * cv.width),
      y = Math.round(((e.clientY - rect.top) / rect.height) * cv.height);
    const off = document.createElement('canvas');
    off.width = cv.width;
    off.height = cv.height;
    const ox = off.getContext('2d', { willReadFrequently: true });
    if (!ox) return;
    const look = { ...item.edit, adjust: { ...DEFAULT_ADJUST, look: item.edit.adjust.look } };
    renderIg(ox, item.preview, item.preview.width, item.preview.height, look, off.width, off.height);
    const d = ox.getImageData(Math.max(0, x - 2), Math.max(0, y - 2), 5, 5).data;
    let r = 0,
      g = 0,
      b = 0;
    for (let k = 0; k < d.length; k += 4) {
      r += d[k];
      g += d[k + 1];
      b += d[k + 2];
    }
    const n = d.length / 4;
    adjustPhoto(item.id, neutralise(r / n, g / n, b / n));
    setPicking(false);
  };
  // The Masks tool on the stage, by the selected part: a brush stroke goes into a brush part (a new mask when none is
  // selected), in the photo's own coordinates, so it stays put when the photo is moved, turned or mirrored; a gradient
  // is moved by its handles, or drawn anew by a drag elsewhere; a range takes the colour or brightness clicked. Painting
  // over an AI part refines it: a new brush part that adds (Paint) or subtracts (Erase).
  const stroke = useRef<{ mask: string; part: string; s: BrushStroke; key: string; W: number; H: number; last: [number, number] } | null>(null);
  const grad = useRef<{ mask: string; orig: LinearPart | RadialPart; handle: HandleId | 'draw'; from: [number, number]; key: string; W: number; H: number } | null>(null);
  const cursor = useRef<HTMLDivElement>(null);
  const putStroke = (st: NonNullable<typeof stroke.current>, s: BrushStroke) =>
    updateMask(
      item.id,
      st.mask,
      (m) => ({ ...m, parts: m.parts.map((p) => (p.id === st.part && p.kind === 'brush' ? { ...p, strokes: p.strokes.at(-1) === st.s ? [...p.strokes.slice(0, -1), s] : [...p.strokes, s] } : p)) }),
      st.key,
    );
  const putPart = (maskId: string, part: MaskPart, key = '') => updateMask(item.id, maskId, (m) => ({ ...m, parts: m.parts.map((p) => (p.id === part.id ? part : p)) }), key);
  /** The photo's own colour around a point on it (3 × 3 pixels of the preview, before any settings). */
  const photoColour = (u: number, v: number): [number, number, number] | null => {
    const pv = item.preview,
      cx = Math.min(pv.width - 2, Math.max(1, Math.round(u * pv.width))),
      cy = Math.min(pv.height - 2, Math.max(1, Math.round(v * pv.height)));
    if (u < 0 || u > 1 || v < 0 || v > 1) return null;
    const d = pv.getContext('2d')?.getImageData(cx - 1, cy - 1, 3, 3).data;
    if (!d) return null;
    const c = [0, 0, 0];
    for (let k = 0; k < d.length; k += 4) for (let j = 0; j < 3; j++) c[j] += d[k + j] / 9;
    return [Math.round(c[0]), Math.round(c[1]), Math.round(c[2])];
  };
  const onMask = {
    down: (x: number, y: number, W: number, H: number) => {
      const ig = getIg();
      let mask = item.edit.masks.find((m) => m.id === ig.maskSel);
      if (!mask) {
        const made = addMask(item);
        if (!made) return toast('A photo can have 16 masks; delete one to add another.');
        mask = made;
      }
      let part = mask.parts.find((p) => p.id === getIg().partSel) ?? mask.parts[0];
      if (!part) return;
      const place = photoPlace(item.preview.width, item.preview.height, item.edit, W, H),
        [u, v] = frameToPhoto(place, x, y),
        key = `maskdrag:${Date.now()}`;
      let erase = getIg().maskBrush.erase;
      if (part.kind === 'ai') {
        if (mask.parts.length >= MASK_LIMITS.parts) return toast('A mask can have 8 parts; delete one to refine it with the brush.');
        const bp = newBrushPart(erase ? 'subtract' : 'add');
        updateMask(item.id, mask.id, (m) => ({ ...m, parts: [...m.parts, bp] }), key);
        selectMask(mask.id, bp.id);
        part = bp;
        erase = false;
      }
      if (part.kind === 'linear' || part.kind === 'radial') {
        const r = (ref.current ? handleRadius(ref.current) : 8) * 1.8,
          hit = partHandles(part, place)
            .filter((h) => Math.hypot(h.x - x, h.y - y) <= r)
            .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];
        grad.current = { mask: mask.id, orig: part, handle: hit?.id ?? 'draw', from: [u, v], key, W, H };
        return;
      }
      if (part.kind === 'colour' || part.kind === 'luma') {
        const c = photoColour(u, v);
        if (!c) return;
        if (part.kind === 'colour') putPart(mask.id, { ...part, r: c[0], g: c[1], b: c[2] });
        else {
          const l = ((0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255) * 100;
          putPart(mask.id, { ...part, lo: Math.max(0, Math.round(l - 15)), hi: Math.min(100, Math.round(l + 15)) });
        }
        return;
      }
      const b = getIg().maskBrush;
      const s: BrushStroke = {
        pts: [u, v],
        size: Math.min(BRUSH_RANGES.size[1], Math.max(BRUSH_RANGES.size[0], (b.size * W) / place.w)),
        feather: b.feather,
        flow: b.flow,
        erase,
      };
      const st = { mask: mask.id, part: part.id, s, key, W, H, last: [x, y] as [number, number] };
      stroke.current = st;
      // The part holds the stroke from now on; each move replaces it with a longer one (one undo step).
      updateMask(item.id, mask.id, (m) => ({ ...m, parts: m.parts.map((p) => (p.id === part.id && p.kind === 'brush' ? { ...p, strokes: [...p.strokes, s] } : p)) }), key);
    },
    move: (x: number, y: number) => {
      const it = getIg().items.find((k) => k.id === item.id);
      if (!it) return;
      const g = grad.current;
      if (g) {
        const place = photoPlace(it.preview.width, it.preview.height, it.edit, g.W, g.H);
        putPart(g.mask, dragPart(g.orig, g.handle, g.from, frameToPhoto(place, x, y), place), g.key);
        return;
      }
      const st = stroke.current;
      if (!st || Math.hypot(x - st.last[0], y - st.last[1]) < 2) return;
      const [u, v] = frameToPhoto(photoPlace(it.preview.width, it.preview.height, it.edit, st.W, st.H), x, y);
      const s = { ...st.s, pts: [...st.s.pts, u, v] };
      putStroke(st, s);
      st.s = s;
      st.last = [x, y];
    },
    up: () => {
      stroke.current = null;
      grad.current = null;
    },
  };
  const moveCursor = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const c = cursor.current;
    if (!c) return;
    const d = brush.size * e.currentTarget.getBoundingClientRect().width;
    c.style.width = c.style.height = `${d}px`;
    c.style.transform = `translate(${e.clientX - d / 2}px, ${e.clientY - d / 2}px)`;
    c.hidden = false;
  };

  const handlers = useLayerPointer({
    canvas: ref,
    layers: item.layers,
    onMask,
    selected: layerSel,
    tools,
    onSelect: selectLayer,
    onUpdate: (id, layer, key) => updateLayer(item.id, id, layer, key),
    onSetLayers: (layers, key, sel) => setLayers(item.id, layers, key, sel),
    onRemove: (id) => removeLayer(item.id, id),
    onEndStep: endStep,
    onBackground: {
      down: (e: ReactPointerEvent<HTMLCanvasElement>) => {
        pan.current = { x: e.clientX, y: e.clientY, px: item.edit.px, py: item.edit.py };
      },
      move: (e: ReactPointerEvent<HTMLCanvasElement>) => {
        const d = pan.current;
        if (!d) return;
        const r = room(),
          clamp = (v: number) => Math.max(-1, Math.min(1, v));
        editPhoto(item.id, { px: r.x > 0.5 ? clamp(d.px + (e.clientX - d.x) / r.x) : 0, py: r.y > 0.5 ? clamp(d.py + (e.clientY - d.y) / r.y) : 0 });
      },
      up: () => {
        pan.current = null;
      },
      key: panKey,
    },
  });
  return (
    <div className="mst-surface" ref={box}>
      <div className="mst-stagebar">
        <button type="button" className="pbtn" aria-label="Previous photo" disabled={i <= 0} onClick={() => selectPhoto(items[i - 1]?.id ?? null)}>
          <PrevIcon />
        </button>
        <span>
          Photo {i + 1} of {items.length}
          {i === 0 && items.length > 1 ? ' · cover' : ''}
        </span>
        <button type="button" className="pbtn" aria-label="Next photo" disabled={i >= items.length - 1} onClick={() => selectPhoto(items[i + 1]?.id ?? null)}>
          <NextIcon />
        </button>
        {layerSel && (
          <button type="button" className="pbtn" aria-label="Delete the selected layer" title="Delete the selected layer (Delete)" onClick={() => removeLayer(item.id, layerSel)}>
            <TrashIcon />
          </button>
        )}
      </div>
      <canvas
        ref={ref}
        tabIndex={0}
        className={`mst-canvas${tools.tool === 'draw' || masking ? ' drawing' : ''}${picking ? ' picking' : ''}`}
        style={{ width, height }}
        aria-label={`Photo ${i + 1} of ${items.length} as a ${f.ratio} Instagram post, with ${item.layers.length} layer${item.layers.length === 1 ? '' : 's'}. Drag a layer to move it, its corner handle to resize, its top handle to turn it. Drag elsewhere, or use the arrow keys, to move the photo; plus and minus zoom. Delete removes the selected layer.`}
        onDoubleClick={() => document.getElementById('layer-text')?.focus()}
        {...handlers}
        onPointerDown={picking ? pickGrey : handlers.onPointerDown}
        onPointerMove={(ev) => {
          if (brushing) moveCursor(ev);
          handlers.onPointerMove(ev);
        }}
        onPointerLeave={() => cursor.current && (cursor.current.hidden = true)}
        onKeyDown={(ev) => {
          if (picking && ev.key === 'Escape') setPicking(false);
          else handlers.onKeyDown?.(ev);
        }}
      />
      {brushing && <div className="mst-brush" ref={cursor} hidden aria-hidden="true" />}
      <p className="mst-hint">
        {picking
          ? 'Click something that should be grey or white; Escape cancels'
          : masking
            ? selPart?.kind === 'linear'
              ? 'Masks: drag to draw the gradient, or move its handles'
              : selPart?.kind === 'radial'
                ? 'Masks: drag to draw a circle, or move its handles'
                : selPart?.kind === 'colour'
                  ? 'Masks: click the photo to pick the colour'
                  : selPart?.kind === 'luma'
                    ? 'Masks: click the photo to pick the brightness'
                    : brush.erase
                      ? 'Masks: drag on the photo to erase from the selected mask'
                      : 'Masks: drag on the photo to paint the selected mask'
            : tools.tool === 'draw'
              ? 'Drawing: drag on the photo'
              : 'Drag a layer to move it, or the photo to reposition it'}
      </p>
    </div>
  );
}

/** The photo strip along the bottom: select, drag to reorder, remove, add. */
function PhotoStrip() {
  const items = useIg((s) => s.items),
    selected = useIg((s) => s.selected),
    limit = useIg((s) => s.limit);
  const list = useRef<HTMLOListElement>(null);
  const drag = useRef<{ id: string; x: number; moved: boolean } | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [dropping, setDropping] = useState(false);
  const targetIndex = (x: number) => {
    const els = [...(list.current?.querySelectorAll<HTMLElement>('.mst-thumb') ?? [])];
    let idx = els.length - 1;
    for (const [k, el] of els.entries()) {
      const r = el.getBoundingClientRect();
      if (x < r.left + r.width / 2) {
        idx = k;
        break;
      }
    }
    return idx;
  };
  return (
    <div
      className={`mst-strip${dropping ? ' over' : ''}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDropping(true);
        }
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDropping(false);
        void addPhotos([...e.dataTransfer.files].map((f) => ({ name: f.name, blob: f, type: f.type }))).then((m) => m[0] && toast(m[0]));
      }}
    >
      <span className="mst-strip-count">
        {items.length}/{limit}
      </span>
      <ol className="mst-thumbs" ref={list} aria-label="Photos in this post, in order">
        {items.map((it, i) => (
          <StripThumb
            key={it.id}
            item={it}
            index={i}
            count={items.length}
            active={it.id === (selected ?? items[0]?.id)}
            marker={over === i}
            onDown={(e) => {
              drag.current = { id: it.id, x: e.clientX, moved: false };
            }}
            onMove={(e) => {
              const d = drag.current;
              if (!d) return;
              if (!d.moved && Math.abs(e.clientX - d.x) < 6) return;
              d.moved = true;
              setOver(targetIndex(e.clientX));
            }}
            onUp={(e) => {
              const d = drag.current;
              drag.current = null;
              setOver(null);
              if (d?.moved) movePhotoTo(d.id, targetIndex(e.clientX));
              else selectPhoto(it.id);
            }}
          />
        ))}
        {items.length < limit && (
          <li className="mst-add">
            <label title="Add photos">
              <AddPhotoIcon />
              <span className="vh">Add photos</span>
              <input type="file" accept={PHOTO_ACCEPT} multiple onChange={(e) => void addPhotos([...(e.target.files ?? [])].map((f) => ({ name: f.name, blob: f, type: f.type }))).then((m) => ((e.target.value = ''), m[0] && toast(m[0])))} />
            </label>
          </li>
        )}
      </ol>
      <span className="hint mst-strip-hint">Drag to reorder · the first photo is the cover</span>
    </div>
  );
}

function StripThumb(p: {
  item: IgItem;
  index: number;
  count: number;
  active: boolean;
  marker: boolean;
  onDown: (e: ReactPointerEvent) => void;
  onMove: (e: ReactPointerEvent) => void;
  onUp: (e: ReactPointerEvent) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const format = useIg((s) => s.format);
  useRender(ref, p.item, format, 64);
  return (
    <li className={`mst-thumb${p.active ? ' on' : ''}${p.marker ? ' drop' : ''}`}>
      <button
        type="button"
        aria-pressed={p.active}
        aria-label={`Photo ${p.index + 1}: ${p.item.name}${p.index === 0 ? ' (cover)' : ''}`}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          p.onDown(e);
        }}
        onPointerMove={p.onMove}
        onPointerUp={p.onUp}
        onKeyDown={(e) => {
          // Keyboard reordering: Alt + arrow keys.
          if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
            e.preventDefault();
            movePhotoTo(p.item.id, p.index + (e.key === 'ArrowLeft' ? -1 : 1));
          } else if (e.key === 'Enter' || e.key === ' ') selectPhoto(p.item.id);
        }}
      >
        <canvas ref={ref} />
        <span className="ig-n">{p.index + 1}</span>
      </button>
      <button type="button" className="mst-thumb-x" aria-label={`Remove photo ${p.index + 1}`} onClick={() => removePhoto(p.item.id)}>
        <TrashIcon />
      </button>
    </li>
  );
}

function EditPanel({ item }: { item: IgItem }) {
  const format = useIg((s) => s.format),
    many = useIg((s) => s.items.length > 1);
  const e = item.edit,
    f = igFormat(format);
  const set = (patch: Partial<IgEdit>) => editPhoto(item.id, patch);
  const a = e.adjust,
    setA = (patch: Partial<Adjustments>) => adjustPhoto(item.id, patch),
    picking = useIg((s) => s.picking);
  const rotate = (by: 90 | -90) => set({ rot: ((((e.rot + by) % 360) + 360) % 360) as IgRotation, px: 0, py: 0 });
  const bgShows = showsBackground(item.preview.width, item.preview.height, e, f.w, f.h);
  return (
    <div className="lp">
      <div className="ig-group">
        <h3>
          <AdjustIcon /> Photo
        </h3>
        <p className="hint ig-name" title={item.name}>
          {item.name} · {item.w}×{item.h} px
          {Math.max(item.w, item.h) < 1080 ? ' · smaller than Instagram’s 1080 px, so it may look soft' : ''}
        </p>
        <Seg<IgEdit['fit']>
          label="How the photo fills the frame"
          value={e.fit}
          options={[
            ['fill', 'Fill the frame'],
            ['fit', 'Whole photo'],
          ]}
          onChange={(fit) => set({ fit, px: 0, py: 0 })}
        />
        {(e.fit === 'fit' || bgShows) && (
          <div className="ig-bg">
            <span className="hint">Background</span>
            <Check checked={e.bg === 'blur'} onChange={(on) => set({ bg: on ? 'blur' : '#ffffff' })}>
              Blurred photo
            </Check>
            {e.bg !== 'blur' && (
              <label className="ig-colour">
                <span className="vh">Background colour</span>
                <input type="color" value={e.bg} onChange={(ev) => set({ bg: ev.target.value })} />
              </label>
            )}
          </div>
        )}
        <Slider id="ig-zoom" label="Zoom" value={e.zoom} min={1} max={4} step={0.01} onChange={(zoom) => set({ zoom })} />
        <div className="inline ig-tools">
          <button type="button" className="sbtn" onClick={() => rotate(-90)}>
            <RotateLeftIcon />
            Rotate left
          </button>
          <button type="button" className="sbtn" onClick={() => rotate(90)}>
            <RotateRightIcon />
            Rotate right
          </button>
          <button type="button" className="sbtn" aria-pressed={e.flip} onClick={() => set({ flip: !e.flip })}>
            <FlipIcon />
            Mirror
          </button>
          <button type="button" className="sbtn" onClick={() => set({ zoom: 1, px: 0, py: 0 })}>
            <ResetIcon />
            Centre
          </button>
        </div>
      </div>
      <div className="ig-group">
        <h3>Presets and LUTs</h3>
        <LookPicker
          idPrefix="ig"
          adjust={a}
          onChange={setA}
          onApplyAll={
            many
              ? (adjust) => {
                  adjustAll(adjust);
                  toast('Preset applied to every photo.');
                }
              : undefined
          }
        />
      </div>
      <div className="ig-group">
        <h3>Light</h3>
        <Slider id="ig-ex" label="Exposure" value={a.exposure} min={-4} max={4} step={0.05} onChange={(exposure) => setA({ exposure })} />
        <Slider id="ig-ct" label="Contrast" value={a.contrast} min={-100} max={100} onChange={(contrast) => setA({ contrast })} />
        <Slider id="ig-hi" label="Highlights" value={a.highlights} min={-100} max={100} onChange={(highlights) => setA({ highlights })} />
        <Slider id="ig-sh" label="Shadows" value={a.shadows} min={-100} max={100} onChange={(shadows) => setA({ shadows })} />
        <Slider id="ig-wh" label="Whites" value={a.whites} min={-100} max={100} onChange={(whites) => setA({ whites })} />
        <Slider id="ig-bl" label="Blacks" value={a.blacks} min={-100} max={100} onChange={(blacks) => setA({ blacks })} />
        {a.brightness !== 0 && <Slider id="ig-br" label="Brightness" value={a.brightness} min={-100} max={100} onChange={(brightness) => setA({ brightness })} />}
      </div>
      <div className="ig-group">
        <h3>Colour</h3>
        <div className="inline ig-tools">
          <button
            type="button"
            className="sbtn"
            aria-pressed={picking}
            onClick={() => {
              setPicking(!picking);
              // On a phone the inspector sits below the photo: bring the photo into view to be clicked.
              if (!picking) document.querySelector('.mst-canvas')?.scrollIntoView({ block: 'nearest' });
            }}
          >
            <PipetteIcon />
            {picking ? 'Click something grey or white…' : 'Pick a neutral grey'}
          </button>
        </div>
        <Slider id="ig-te" label="Temperature" value={a.temperature} min={-100} max={100} onChange={(temperature) => setA({ temperature })} />
        <Slider id="ig-ti" label="Tint" value={a.tint} min={-100} max={100} onChange={(tint) => setA({ tint })} />
        <Slider id="ig-sa" label="Saturation" value={a.saturation} min={-100} max={100} onChange={(saturation) => setA({ saturation })} />
        {a.warmth !== 0 && <Slider id="ig-wa" label="Warmth" value={a.warmth} min={-100} max={100} onChange={(warmth) => setA({ warmth })} />}
      </div>
      <div className="ig-group">
        <h3>Tone curve</h3>
        <CurveEditor curve={a.curve} onChange={(curve) => setA({ curve })} />
      </div>
      <div className="ig-group">
        <h3>Colour mixer</h3>
        <ColourMixer idPrefix="ig-mix" mixer={a.mixer} onChange={(mixer) => setA({ mixer })} />
      </div>
      <div className="ig-group">
        <h3>Detail</h3>
        <Slider id="ig-sp" label="Sharpening" value={a.sharpen} min={0} max={100} onChange={(sharpen) => setA({ sharpen })} />
        {a.sharpen > 0 && (
          <>
            <Slider id="ig-sr" label="Radius" value={a.sharpenRadius} min={0.5} max={3} step={0.1} reset={1} onChange={(sharpenRadius) => setA({ sharpenRadius })} />
            <Slider id="ig-sm" label="Masking" value={a.sharpenMask} min={0} max={100} onChange={(sharpenMask) => setA({ sharpenMask })} />
          </>
        )}
        <Slider id="ig-nr" label="Noise reduction" value={a.noise} min={0} max={100} onChange={(noise) => setA({ noise })} />
      </div>
      <div className="ig-group">
        <h3>Effects</h3>
        <Slider id="ig-cl" label="Clarity" value={a.clarity} min={-100} max={100} onChange={(clarity) => setA({ clarity })} />
        <Slider id="ig-dh" label="Dehaze" value={a.dehaze} min={-100} max={100} onChange={(dehaze) => setA({ dehaze })} />
        <Slider id="ig-vi" label="Vignette" value={a.vignette} min={0} max={100} onChange={(vignette) => setA({ vignette })} />
        <Slider id="ig-gr" label="Grain" value={a.grain} min={0} max={100} onChange={(grain) => setA({ grain })} />
        <p className="hint">Double-click a slider to reset it.</p>
      </div>
      <div className="inline ig-tools">
        {many && (
          <button
            type="button"
            className="sbtn accent"
            onClick={() => {
              applyLookToAll(item.id);
              toast('Frame, preset, LUT and adjustments copied to every photo.');
            }}
          >
            Apply this look to all photos
          </button>
        )}
        <button type="button" className="sbtn" onClick={() => resetPhoto(item.id)}>
          <ResetIcon />
          Reset this photo
        </button>
      </div>
    </div>
  );
}

function ExportPanel() {
  const items = useIg((s) => s.items),
    fileType = useIg((s) => s.fileType),
    quality = useIg((s) => s.quality),
    caption = useIg((s) => s.caption),
    ready = useIg((s) => s.ready),
    busy = useIg((s) => s.busy);
  const [working, setWorking] = useState(false);
  // JPEG and PNG always; WebP and AVIF where this browser can write them. A remembered choice it can't is set back.
  const [types, setTypes] = useState<IgFileType[]>(['jpeg', 'png']);
  useEffect(() => {
    let live = true;
    void encodableTypes().then((t) => {
      if (!live) return;
      setTypes(t);
      if (!t.includes(getIg().fileType)) setIg({ fileType: 'jpeg' });
    });
    return () => {
      live = false;
    };
  }, []);
  const n = items.length;
  const tags = (caption.match(/#[\p{L}\p{N}_]+/gu) ?? []).length;
  const shareable = !!ready && !isDesktop && canShareFiles(ready);
  const big = ready?.filter((f) => f.size > IG_FILE_WARN_BYTES).length ?? 0;

  const run = async (job: () => Promise<void>) => {
    setWorking(true);
    try {
      await job();
    } catch (e) {
      logError('handled', e);
      toast('The photos couldn’t be made. Try again, or use fewer photos.');
    } finally {
      setWorking(false);
    }
  };
  const files = async () => getIg().ready ?? (await prepareBatch());
  const downloadZip = () =>
    run(async () => {
      await saveFile(`chitthi-instagram-${new Date().toISOString().slice(0, 10)}.zip`, await zipOf(await files()));
    });
  const downloadEach = () =>
    run(async () => {
      for (const file of await files()) await saveFile(file.name, file);
    });
  const saveAndOpen = async (list: File[]) => {
    await saveFile(`chitthi-instagram-${new Date().toISOString().slice(0, 10)}.zip`, await zipOf(list));
    if (desktop) await desktop.openExternal(INSTAGRAM_WEB);
    else window.open(INSTAGRAM_WEB, '_blank', 'noopener');
    toast('Photos saved. On Instagram, choose Create (+), then select the photos.');
  };
  const post = () =>
    run(async () => {
      const list = getIg().ready;
      if (!list) {
        // Rendering takes a moment and a share needs a fresh tap, so preparing is its own step.
        await prepareBatch();
        return;
      }
      if (caption) await navigator.clipboard?.writeText(caption).catch(() => undefined);
      if (shareable) {
        try {
          await navigator.share({ files: list, text: caption || undefined });
          if (caption) toast('Caption copied: paste it into Instagram.');
          return;
        } catch (e) {
          if (e instanceof DOMException && e.name === 'AbortError') return;
          logError('handled', e);
          toast(list.length > 10 ? 'This device couldn’t share that many photos at once. Saving them instead.' : 'Sharing didn’t work here. Saving the photos instead.');
        }
      }
      await saveAndOpen(list);
    });
  const postLabel = !ready ? `Prepare ${n} photo${n === 1 ? '' : 's'} for Instagram` : shareable ? 'Share to Instagram' : 'Save photos and open Instagram';

  return (
    <div className="ig-export">
      <div className="ig-export-grid">
        <div>
          <h3>File type</h3>
          <Seg<IgFileType>
            label="File type"
            value={fileType}
            options={IG_FILE_TYPES.filter(([v]) => types.includes(v)).map(([v, l]) => [v, l])}
            onChange={(v) => setIg({ fileType: v })}
          />
          <p className="hint">{IG_FILE_TYPES.find(([v]) => v === fileType)?.[2]}. sRGB colour, 1080 px wide.</p>
          {PHOTO_TYPES[fileType].lossy && (
            <Slider id="ig-q" label={`${PHOTO_TYPES[fileType].label} quality`} value={quality} min={60} max={100} onChange={(q) => setIg({ quality: q })} />
          )}
        </div>
        <div>
          <h3>
            <label htmlFor="ig-caption">Caption</label>
          </h3>
          <textarea id="ig-caption" rows={4} maxLength={IG_CAPTION_MAX} placeholder="Write a caption. It’s copied for you when you post." value={caption} onChange={(e) => setIg({ caption: e.target.value })} />
          <p className={`hint${tags > IG_HASHTAG_MAX ? ' bad' : ''}`}>
            {caption.length} / {IG_CAPTION_MAX} characters · {tags} / {IG_HASHTAG_MAX} hashtags
            {caption.length > IG_CAPTION_PREVIEW ? ` · the first ${IG_CAPTION_PREVIEW} show before “more”` : ''}
          </p>
        </div>
      </div>
      <div className="ig-actions">
        <button type="button" className="btn primary" disabled={!n || working || !!busy} onClick={() => void post()}>
          {shareable ? <ShareIcon /> : <InstagramIcon />}
          {postLabel}
        </button>
        <button type="button" className="btn" disabled={!n || working || !!busy} onClick={() => void downloadZip()}>
          <DownloadIcon />
          Download all (ZIP)
        </button>
        {!isDesktop && (
          <button type="button" className="btn" disabled={!n || working || !!busy} onClick={() => void downloadEach()}>
            <DownloadIcon />
            Download as separate files
          </button>
        )}
      </div>
      <p className="hint" role="status">
        {busy ??
          (!n
            ? 'Add photos to export them.'
            : ready
              ? `${ready.length} photo${ready.length === 1 ? '' : 's'} ready (${(ready.reduce((a, f) => a + f.size, 0) / 1048576).toFixed(1)} MB).${big ? ` ${big} over 8 MB: lower the JPEG quality if Instagram refuses ${big === 1 ? 'it' : 'them'}.` : ''}`
              : isDesktop
                ? 'The desktop app saves the photos and opens instagram.com, where you choose Create (+) and select them.'
                : 'On a phone, sharing opens the Instagram app with your photos. Elsewhere Chitthi Studio saves them and opens instagram.com.')}
        {ready && shareable && ready.length > 10 ? ' Some phones can share only 10 photos at once; if sharing fails, the photos are saved instead.' : ''}
      </p>
    </div>
  );
}
