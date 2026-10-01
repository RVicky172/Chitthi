import { useEffect, useRef, type ReactNode } from 'react';
import { BRUSHES, PALETTE, SHAPES, STICKERS, TEXT_FONTS, TEXT_STYLES, shapeDef, type BrushId } from '../../data/layers';
import { layerName, newShape, newSticker, newText, scaleLayer, shapePath, type Layer, type ShapeLayer, type TextLayer } from '../../engine/layers';
import type { LayerTools } from '../../state/instagram';
import { Check, Seg } from '../common';
import { FontPicker } from '../FontPicker';
import { NextIcon, PlusIcon, PrevIcon, TrashIcon } from '../icons';

/*
 * The layer controls shared by the photo and video editors: add text, shapes and stickers; the layer list; the
 * selected layer's properties; and the drawing brush. Changes go out through callbacks, so each editor keeps its own
 * state and undo history.
 */

export interface LayerPanelProps {
  layers: Layer[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  onAdd: (layer: Layer) => void;
  onUpdate: (id: string, patch: Partial<Layer> | ((l: Layer) => Layer), key?: string) => void;
  onRemove: (id: string) => void;
  onRestack: (id: string, by: 1 | -1) => void;
  /** Video: the timeline length and playhead, to set when each layer shows. */
  timing?: { duration: number; now: number };
  /** Extra actions under the list (e.g. "Copy layers to every photo"). */
  extra?: ReactNode;
}

function Swatches({ value, onChange, none, label }: { value: string; onChange: (c: string) => void; none?: boolean; label: string }) {
  return (
    <div className="lp-swatches" role="radiogroup" aria-label={label}>
      {none && (
        <button type="button" role="radio" aria-checked={!value} className="lp-sw lp-none" title="None" aria-label="None" onClick={() => onChange('')} />
      )}
      {PALETTE.map((c) => (
        <button key={c} type="button" role="radio" aria-checked={value.toLowerCase() === c} className="lp-sw" style={{ background: c }} title={c} aria-label={c} onClick={() => onChange(c)} />
      ))}
      <label className="lp-sw lp-own" title="Any colour">
        <span className="vh">{label}: any colour</span>
        <input type="color" value={value || '#ffffff'} onChange={(e) => onChange(e.target.value)} />
      </label>
    </div>
  );
}

function ShapeIcon({ shape }: { shape: (typeof SHAPES)[number]['id'] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current,
      x = cv?.getContext('2d');
    if (!cv || !x) return;
    const d = shapeDef(shape),
      k = Math.min(36 / d.w, 22 / Math.max(d.h, 0.06));
    x.clearRect(0, 0, cv.width, cv.height);
    x.save();
    x.translate(cv.width / 2, cv.height / 2);
    shapePath(x, shape, d.w * k, Math.max(d.h * k, shape === 'line' ? 3 : 4));
    x.fillStyle = getComputedStyle(cv).color;
    x.fill();
    x.restore();
  }, [shape]);
  return <canvas ref={ref} width={44} height={28} aria-hidden="true" />;
}

function Range({ id, label, value, min, max, step = 0.01, show, onChange }: { id: string; label: string; value: number; min: number; max: number; step?: number; show: string; onChange: (v: number) => void }) {
  return (
    <div className="ig-slider">
      <label htmlFor={id}>
        {label} <output htmlFor={id}>{show}</output>
      </label>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} />
    </div>
  );
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;

/** New layers on a video start at the playhead. */
const placed = (p: Pick<LayerPanelProps, 'timing'>, l: Layer): Layer => (p.timing ? { ...l, start: Math.min(p.timing.now, Math.max(0, p.timing.duration - 0.5)) } : l);

/** Text styles to add with one tap. */
export function AddText(p: Pick<LayerPanelProps, 'onAdd' | 'timing'>) {
  return (
    <div className="ig-group">
      <h3>Add text</h3>
      <div className="lp-styles">
        {TEXT_STYLES.map((s) => (
          <button
            key={s.id}
            type="button"
            className="lp-style"
            style={{ fontFamily: `"${s.font}", sans-serif`, fontWeight: s.bold ? 700 : 400, fontStyle: s.italic ? 'italic' : 'normal', color: s.bg ? s.color : undefined, background: s.bg || undefined }}
            onClick={() => p.onAdd(placed(p, newText(s)))}
          >
            {s.name}
          </button>
        ))}
      </div>
      <p className="hint">Then type your words in the inspector, or double-click the text on the canvas.</p>
    </div>
  );
}

/** Shapes (which can hold words) and emoji stickers. */
export function AddElements(p: Pick<LayerPanelProps, 'onAdd' | 'timing'>) {
  return (
    <>
      <div className="ig-group">
        <h3>Shapes</h3>
        <p className="hint">Boxes, labels, bubbles, bursts and ribbons hold words. Draw over any of them with the Draw tool.</p>
        <div className="lp-shapes">
          {SHAPES.map((s) => (
            <button key={s.id} type="button" className="lp-shape" title={s.name} aria-label={`Add ${s.name.toLowerCase()}`} onClick={() => p.onAdd(placed(p, newShape(s.id)))}>
              <ShapeIcon shape={s.id} />
              <span>{s.name}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="ig-group">
        <h3>Stickers</h3>
        <div className="lp-stickers">
          {STICKERS.map((e) => (
            <button key={e} type="button" aria-label={`Add sticker ${e}`} onClick={() => p.onAdd(placed(p, newSticker(e)))}>
              {e}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

/** Every layer, front first: select, show or hide, restack, delete. */
export function LayerList(p: Pick<LayerPanelProps, 'layers' | 'selected' | 'onSelect' | 'onUpdate' | 'onRestack' | 'onRemove' | 'timing' | 'extra'>) {
  return (
    <div className="ig-group">
      <h3>Layers {p.layers.length > 0 && <span className="ig-count">{p.layers.length}</span>}</h3>
      {p.layers.length === 0 ? (
        <p className="hint">Nothing added yet. Text, shapes, stickers and drawings appear here, the top one first.</p>
      ) : (
        <ol className="lp-list" aria-label="Layers, front first">
          {[...p.layers].reverse().map((l, ri) => {
            const i = p.layers.length - 1 - ri;
            return (
              <li key={l.id} className={l.id === p.selected ? 'on' : ''}>
                <button type="button" className="lp-name" aria-pressed={l.id === p.selected} onClick={() => p.onSelect(l.id === p.selected ? null : l.id)}>
                  {layerName(l)}
                  {p.timing && (
                    <small>
                      {' '}
                      {fmt(l.start ?? 0)}–{fmt(Math.min(l.end ?? p.timing.duration, p.timing.duration))}
                    </small>
                  )}
                </button>
                <button type="button" className="pbtn" aria-label={`${l.hidden ? 'Show' : 'Hide'} ${layerName(l)}`} aria-pressed={!l.hidden} onClick={() => p.onUpdate(l.id, { hidden: !l.hidden }, '')}>
                  {l.hidden ? '○' : '●'}
                </button>
                <button type="button" className="pbtn lp-up" aria-label={`Bring ${layerName(l)} forward`} disabled={i === p.layers.length - 1} onClick={() => p.onRestack(l.id, 1)}>
                  <PrevIcon />
                </button>
                <button type="button" className="pbtn lp-down" aria-label={`Send ${layerName(l)} back`} disabled={i === 0} onClick={() => p.onRestack(l.id, -1)}>
                  <NextIcon />
                </button>
                <button type="button" className="pbtn" aria-label={`Delete ${layerName(l)}`} onClick={() => p.onRemove(l.id)}>
                  <TrashIcon />
                </button>
              </li>
            );
          })}
        </ol>
      )}
      {p.extra}
    </div>
  );
}

/** The selected layer's properties (and its timing on a video). */
export function LayerProps(p: LayerPanelProps) {
  const sel = p.layers.find((l) => l.id === p.selected);
  return sel ? <Properties {...p} sel={sel} /> : null;
}

/** Everything in one column (adding, the list and the properties). */
export function LayerPanel(p: LayerPanelProps) {
  return (
    <div className="lp">
      <AddText {...p} />
      <AddElements {...p} />
      <LayerList {...p} />
      <LayerProps {...p} />
    </div>
  );
}

export { Range as LpRange, Swatches };

function Properties({ sel, onUpdate, onAdd, timing }: LayerPanelProps & { sel: Layer }) {
  const up = (patch: Partial<Layer>, key = `prop:${sel.id}:${Object.keys(patch).join(',')}`) => onUpdate(sel.id, patch, key);
  return (
    <div className="ig-group lp-props">
      <h3>{layerName(sel)}</h3>

      {sel.kind === 'text' && <TextProps l={sel} up={up} />}
      {sel.kind === 'shape' && <ShapeProps l={sel} up={up} />}
      {sel.kind === 'draw' && (
        <p className="hint">
          A drawing. Move, resize or turn it like any layer; with the Draw tool, new strokes go into it while it is selected and not turned.
        </p>
      )}

      <Range
        id="lp-size"
        label="Size"
        value={sel.w}
        min={0.03}
        max={2}
        show={`${Math.round(sel.w * 100)}%`}
        onChange={(w) => onUpdate(sel.id, (l) => scaleLayer(l, w / l.w), `size:${sel.id}`)}
      />
      <Range id="lp-rot" label="Turn" value={sel.rot > 180 ? sel.rot - 360 : sel.rot} min={-180} max={180} step={1} show={`${Math.round(sel.rot > 180 ? sel.rot - 360 : sel.rot)}°`} onChange={(r) => up({ rot: (r + 360) % 360 })} />
      <Range id="lp-op" label="Opacity" value={sel.opacity} min={0.05} max={1} show={`${Math.round(sel.opacity * 100)}%`} onChange={(opacity) => up({ opacity })} />

      {timing && (
        <>
          <Range
            id="lp-start"
            label="Appears at"
            value={sel.start ?? 0}
            min={0}
            max={Math.max(0.1, timing.duration - 0.1)}
            step={0.1}
            show={fmt(sel.start ?? 0)}
            onChange={(start) => up({ start, end: sel.end !== undefined && sel.end <= start ? undefined : sel.end })}
          />
          <Range
            id="lp-end"
            label="Disappears at"
            value={Math.min(sel.end ?? timing.duration, timing.duration)}
            min={0.1}
            max={timing.duration}
            step={0.1}
            show={sel.end === undefined || sel.end >= timing.duration ? 'the end' : fmt(sel.end)}
            onChange={(end) => up({ end: end >= timing.duration - 0.05 ? undefined : Math.max(end, (sel.start ?? 0) + 0.1) })}
          />
        </>
      )}

      <div className="inline ig-tools">
        <button type="button" className="sbtn" onClick={() => onAdd({ ...sel, id: `${sel.id}d${Date.now().toString(36)}`, x: Math.min(0.95, sel.x + 0.04), y: Math.min(0.95, sel.y + 0.04) } as Layer)}>
          <PlusIcon />
          Duplicate
        </button>
        <button type="button" className="sbtn" onClick={() => up({ x: 0.5, y: 0.5, rot: 0 }, '')}>
          Centre and straighten
        </button>
      </div>
    </div>
  );
}

type Up = (patch: Partial<Layer>, key?: string) => void;

function TextProps({ l, up }: { l: TextLayer; up: Up }) {
  return (
    <>
      <label className="f" htmlFor="layer-text">
        Text
      </label>
      <textarea id="layer-text" className="lp-text" rows={3} value={l.text} onChange={(e) => up({ text: e.target.value } as Partial<TextLayer>)} />
      <FontPicker label="Font" value={l.font} sample={l.text || 'Your words'} weight={l.bold ? 'hw' : 'bw'} onChange={(font) => up({ font } as Partial<TextLayer>, '')} />
      <div className="lp-fonts" aria-label="Quick fonts">
        {TEXT_FONTS.slice(0, 6).map((f) => (
          <button key={f} type="button" className="chip" aria-pressed={l.font === f} style={{ fontFamily: `"${f}", sans-serif` }} onClick={() => up({ font: f } as Partial<TextLayer>, '')}>
            {f}
          </button>
        ))}
      </div>
      <Range id="lp-tsize" label="Text size" value={l.size} min={0.02} max={0.3} step={0.002} show={`${Math.round(l.size * 1080)} px`} onChange={(size) => up({ size } as Partial<TextLayer>)} />
      <Range id="lp-tw" label="Box width" value={l.w} min={0.1} max={1} show={`${Math.round(l.w * 100)}%`} onChange={(w) => up({ w })} />
      <div className="inline ig-tools">
        <Seg<TextLayer['align']>
          label="Alignment"
          value={l.align}
          options={[
            ['left', 'Left'],
            ['center', 'Centre'],
            ['right', 'Right'],
          ]}
          onChange={(align) => up({ align } as Partial<TextLayer>, '')}
        />
        <button type="button" className="sbtn" aria-pressed={l.bold} onClick={() => up({ bold: !l.bold } as Partial<TextLayer>, '')}>
          <b>B</b> Bold
        </button>
        <button type="button" className="sbtn" aria-pressed={l.italic} onClick={() => up({ italic: !l.italic } as Partial<TextLayer>, '')}>
          <i>I</i> Italic
        </button>
      </div>
      <span className="lp-label">Colour</span>
      <Swatches label="Text colour" value={l.color} onChange={(color) => up({ color } as Partial<TextLayer>)} />
      <span className="lp-label">Outline</span>
      <Swatches label="Outline colour" none value={l.outline} onChange={(outline) => up({ outline } as Partial<TextLayer>)} />
      <span className="lp-label">Background</span>
      <Swatches label="Background colour" none value={l.bg} onChange={(bg) => up({ bg } as Partial<TextLayer>)} />
      <Check checked={l.shadow} onChange={(shadow) => up({ shadow } as Partial<TextLayer>, '')}>
        Shadow
      </Check>
    </>
  );
}

function ShapeProps({ l, up }: { l: ShapeLayer; up: Up }) {
  const holds = shapeDef(l.shape).holdsText;
  return (
    <>
      <span className="lp-label">Fill</span>
      <Swatches label="Fill colour" none value={l.fill} onChange={(fill) => up({ fill } as Partial<ShapeLayer>)} />
      <span className="lp-label">Border</span>
      <Swatches label="Border colour" none value={l.stroke} onChange={(stroke) => up({ stroke } as Partial<ShapeLayer>)} />
      {l.stroke && <Range id="lp-sw" label="Border width" value={l.strokeW} min={0.001} max={0.04} step={0.001} show={`${Math.round(l.strokeW * 1080)} px`} onChange={(strokeW) => up({ strokeW } as Partial<ShapeLayer>)} />}
      <Range id="lp-sh" label="Height" value={l.h} min={0.01} max={1.5} show={`${Math.round((l.h / l.w) * 100)}% of the width`} onChange={(h) => up({ h } as Partial<ShapeLayer>)} />
      {holds && (
        <>
          <label className="f" htmlFor="layer-text">
            Words inside
          </label>
          <textarea id="layer-text" className="lp-text" rows={2} value={l.text} onChange={(e) => up({ text: e.target.value } as Partial<ShapeLayer>)} />
          {l.text && (
            <>
              <FontPicker label="Font" value={l.font} sample={l.text} weight={l.bold ? 'hw' : 'bw'} onChange={(font) => up({ font } as Partial<ShapeLayer>, '')} />
              <Range id="lp-stsize" label="Text size" value={l.textSize} min={0.02} max={0.2} step={0.002} show={`${Math.round(l.textSize * 1080)} px`} onChange={(textSize) => up({ textSize } as Partial<ShapeLayer>)} />
              <span className="lp-label">Text colour</span>
              <Swatches label="Text colour" value={l.textColor} onChange={(textColor) => up({ textColor } as Partial<ShapeLayer>)} />
              <Check checked={l.bold} onChange={(bold) => up({ bold } as Partial<ShapeLayer>, '')}>
                Bold
              </Check>
            </>
          )}
        </>
      )}
    </>
  );
}

/** The drawing tool's settings. */
export function DrawPanel({ tools, onTools, onNewDrawing }: { tools: LayerTools; onTools: (t: Partial<LayerTools>) => void; onNewDrawing: () => void }) {
  return (
    <div className="lp">
      <div className="ig-group">
        <h3>Brush</h3>
        <Seg<BrushId> label="Brush" value={tools.brush} options={BRUSHES.map((b) => [b.id, b.name])} onChange={(brush) => onTools({ brush })} />
        <Range id="lp-bs" label="Brush size" value={tools.brushScale} min={0.5} max={4} step={0.1} show={`${tools.brushScale.toFixed(1)}×`} onChange={(brushScale) => onTools({ brushScale })} />
        <span className="lp-label">Colour</span>
        <Swatches label="Brush colour" value={tools.brushColor} onChange={(brushColor) => onTools({ brushColor })} />
      </div>
      <div className="ig-group">
        <p className="hint">
          Draw on the preview with a finger, pen or mouse. Strokes go into the selected drawing, so it moves and resizes as one; undo removes the last stroke. Draw over shapes and
          photos alike.
        </p>
        <button type="button" className="sbtn" onClick={onNewDrawing}>
          <PlusIcon />
          Start a new drawing
        </button>
      </div>
    </div>
  );
}

/** Whether an element is a text field (keyboard shortcuts leave typing alone). */
export const typingIn = (el: EventTarget | null) => el instanceof HTMLElement && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);
