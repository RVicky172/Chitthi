import { DEFAULT_ADJUST, type Adjustments } from '../../engine/adjust';
import {
  MASK_LIMITS,
  newMask,
  newPart,
  PART_RANGES,
  type Mask,
  type MaskCombine,
  type MaskPart,
  type PartKind,
} from '../../engine/masks';
import { selectMask, setMaskBrush, setMasks, updateMask, useIg, type IgItem } from '../../state/instagram';
import { Check, Seg } from '../common';
import { TrashIcon } from '../icons';
import { Slider } from './Slider';

/*
 * The photo editor's masks (P1.6, P1.7). The panel lists the photo's masks (add, select, switch off, delete), the parts
 * of the selected one (brush, linear and radial gradients, colour and brightness ranges, each joining the parts
 * before it by adding, subtracting or intersecting) and the selected part's settings. Brushes are painted and
 * gradients dragged on the stage (PhotoWorkspace); every gradient and range setting is a slider here as well, so a
 * mask can be shaped from the keyboard. The inspector holds the selected mask's own settings.
 */

const COMBINES: [MaskCombine, string][] = [
  ['add', 'Add'],
  ['subtract', 'Subtract'],
  ['intersect', 'Intersect'],
];

/** Each kind: its name in lists, and in "New … mask" / "Add a … part" buttons. */
export const PART_KINDS: [PartKind, string, string][] = [
  ['brush', 'Brush', 'brush'],
  ['linear', 'Linear', 'linear gradient'],
  ['radial', 'Radial', 'radial gradient'],
  ['colour', 'Colour', 'colour range'],
  ['luma', 'Brightness', 'brightness range'],
];
const NAMES: Record<PartKind, string> = {
  brush: 'Brush',
  linear: 'Linear gradient',
  radial: 'Radial gradient',
  colour: 'Colour range',
  luma: 'Brightness range',
};

/** "Brush 2": the part's kind and its number among the parts of that kind. */
export const partLabel = (parts: MaskPart[], p: MaskPart) =>
  `${NAMES[p.kind]} ${parts.filter((x) => x.kind === p.kind).indexOf(p) + 1}`;

/** The next free "Mask n" name. */
const nextName = (masks: Mask[], base: string) => {
  for (let i = masks.length + 1; ; i++) if (!masks.some((m) => m.name === `${base} ${i}`)) return `${base} ${i}`;
};

/** Adds a mask of one kind to a photo and selects it. */
export function addMask(item: IgItem, kind: PartKind = 'brush'): Mask | null {
  if (item.edit.masks.length >= MASK_LIMITS.masks) return null;
  const m = newMask(nextName(item.edit.masks, 'Mask'), kind);
  setMasks(item.id, [...item.edit.masks, m]);
  selectMask(m.id);
  return m;
}

export function MaskPanel({ item }: { item: IgItem }) {
  const maskSel = useIg((s) => s.maskSel),
    partSel = useIg((s) => s.partSel),
    brush = useIg((s) => s.maskBrush);
  const masks = item.edit.masks,
    mask = masks.find((m) => m.id === maskSel),
    part = mask?.parts.find((p) => p.id === partSel);
  const setParts = (parts: MaskPart[], key = '') => mask && updateMask(item.id, mask.id, (m) => ({ ...m, parts }), key);
  const patchPart = (id: string, patch: Partial<MaskPart>, key = '') =>
    mask &&
    setParts(
      mask.parts.map((p) => (p.id === id ? ({ ...p, ...patch } as MaskPart) : p)),
      key,
    );

  return (
    <div className="lp">
      <div className="ig-group">
        <h3>Masks</h3>
        <p className="hint">
          A mask limits its own settings to part of the photo: shape it here and on the photo, then set them in the
          inspector.
        </p>
        <div className="ig-newmask" role="group" aria-label="New mask">
          {PART_KINDS.map(([kind, short, long]) => (
            <button
              key={kind}
              type="button"
              className="sbtn"
              aria-label={`New ${long} mask`}
              disabled={masks.length >= MASK_LIMITS.masks}
              onClick={() => addMask(item, kind)}
            >
              {short}
            </button>
          ))}
        </div>
        {masks.length > 0 && (
          <ul className="ig-masks" aria-label="Masks of this photo">
            {masks.map((m) => (
              <li key={m.id} className={m.id === maskSel ? 'on' : ''}>
                <button
                  type="button"
                  className="ig-mask-name"
                  aria-pressed={m.id === maskSel}
                  onClick={() => selectMask(m.id === maskSel ? null : m.id)}
                >
                  {m.name}
                </button>
                <label className="ig-mask-on">
                  <input
                    type="checkbox"
                    checked={m.on}
                    onChange={(e) => updateMask(item.id, m.id, (x) => ({ ...x, on: e.target.checked }))}
                  />
                  <span className="vh">Apply {m.name}</span>
                </label>
                <button
                  type="button"
                  className="sbtn"
                  aria-label={`Delete mask ${m.name}`}
                  onClick={() => {
                    setMasks(
                      item.id,
                      masks.filter((x) => x.id !== m.id),
                    );
                    if (m.id === maskSel) selectMask(null);
                  }}
                >
                  <TrashIcon />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {mask && (
        <div className="ig-group">
          <h3>Selected mask</h3>
          <div className="ig-slider">
            <label htmlFor="mk-name">Name</label>
            <input
              id="mk-name"
              type="text"
              maxLength={MASK_LIMITS.name}
              value={mask.name}
              onChange={(e) =>
                updateMask(item.id, mask.id, (m) => ({ ...m, name: e.target.value }), `maskname:${mask.id}`)
              }
              onBlur={(e) =>
                !e.target.value.trim() && updateMask(item.id, mask.id, (m) => ({ ...m, name: nextName(masks, 'Mask') }))
              }
            />
          </div>
          <Check checked={mask.invert} onChange={(invert) => updateMask(item.id, mask.id, (m) => ({ ...m, invert }))}>
            Invert the mask
          </Check>
          <Check checked={brush.overlay} onChange={(overlay) => setMaskBrush({ overlay })}>
            Show the mask in red
          </Check>
          <ul className="ig-parts" aria-label={`Parts of ${mask.name}`}>
            {mask.parts.map((p, k) => {
              const label = partLabel(mask.parts, p);
              return (
                <li key={p.id} className={p.id === partSel ? 'on' : ''}>
                  <button
                    type="button"
                    className="ig-mask-name"
                    aria-pressed={p.id === partSel}
                    onClick={() => selectMask(mask.id, p.id)}
                  >
                    {label}
                    {p.kind === 'brush' && (
                      <small>
                        {' '}
                        · {p.strokes.length} stroke{p.strokes.length === 1 ? '' : 's'}
                      </small>
                    )}
                  </button>
                  {k > 0 && (
                    <select
                      aria-label={`How ${label} joins the parts before it`}
                      value={p.combine}
                      onChange={(e) => patchPart(p.id, { combine: e.target.value as MaskCombine })}
                    >
                      {COMBINES.map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  )}
                  <label className="ig-mask-on">
                    <input
                      type="checkbox"
                      checked={p.invert}
                      onChange={(e) => patchPart(p.id, { invert: e.target.checked })}
                    />
                    <span>Invert</span>
                    <span className="vh"> {label}</span>
                  </label>
                  {p.kind === 'brush' && (
                    <button
                      type="button"
                      className="sbtn"
                      aria-label={`Clear the strokes of ${label}`}
                      disabled={!p.strokes.length}
                      onClick={() => patchPart(p.id, { strokes: [] })}
                    >
                      Clear
                    </button>
                  )}
                  {mask.parts.length > 1 && (
                    <button
                      type="button"
                      className="sbtn"
                      aria-label={`Delete ${label}`}
                      onClick={() => {
                        setParts(mask.parts.filter((x) => x.id !== p.id));
                        if (p.id === partSel) selectMask(mask.id);
                      }}
                    >
                      <TrashIcon />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="ig-newmask" role="group" aria-label="Add a part">
            <span className="hint">Add:</span>
            {PART_KINDS.map(([kind, short, long]) => (
              <button
                key={kind}
                type="button"
                className="sbtn"
                aria-label={`Add a ${long} part`}
                disabled={mask.parts.length >= MASK_LIMITS.parts}
                onClick={() => {
                  const p = newPart(kind, false);
                  setParts([...mask.parts, p]);
                  selectMask(mask.id, p.id);
                }}
              >
                {short}
              </button>
            ))}
          </div>
        </div>
      )}

      {(!part || part.kind === 'brush') && (
        <div className="ig-group">
          <h3>Brush</h3>
          <Seg<'paint' | 'erase'>
            label="Brush mode"
            value={brush.erase ? 'erase' : 'paint'}
            options={[
              ['paint', 'Paint'],
              ['erase', 'Erase'],
            ]}
            onChange={(v) => setMaskBrush({ erase: v === 'erase' })}
          />
          <Slider
            id="mk-size"
            label="Size"
            value={Math.round(brush.size * 100)}
            min={1}
            max={40}
            reset={8}
            onChange={(v) => setMaskBrush({ size: v / 100 })}
          />
          <Slider
            id="mk-feather"
            label="Feather"
            value={brush.feather}
            min={0}
            max={100}
            reset={50}
            onChange={(feather) => setMaskBrush({ feather })}
          />
          <Slider
            id="mk-flow"
            label="Flow"
            value={brush.flow}
            min={1}
            max={100}
            reset={100}
            onChange={(flow) => setMaskBrush({ flow })}
          />
          <p className="hint">
            {mask
              ? 'Paint on the photo to add to the selected part; Erase takes away. Each pass builds up by the flow.'
              : 'Painting on the photo starts a new brush mask.'}
          </p>
        </div>
      )}
      {part && part.kind !== 'brush' && (
        <PartSettings part={part} onPatch={(patch, k) => patchPart(part.id, patch, `maskpart:${part.id}:${k}`)} />
      )}
    </div>
  );
}

/** Sliders for a gradient or range part: the keyboard's way to shape them, and the only way for a layer's mask. Positions and sizes show as per cent. */
export function PartSettings({
  part,
  onPatch,
  idPrefix = 'mk',
  inLayer = false,
}: {
  part: Exclude<MaskPart, { kind: 'brush' }>;
  onPatch: (patch: Partial<MaskPart>, key: string) => void;
  idPrefix?: string;
  /** A layer's mask: positions are within the layer, and there are no handles on the stage to mention. */
  inLayer?: boolean;
}) {
  const pct = (k: 'x' | 'y' | 'width' | 'rx' | 'ry', label: string) => {
    const [lo, hi] = PART_RANGES[k],
      v = (part as unknown as Record<string, number>)[k];
    return (
      <Slider
        key={k}
        id={`${idPrefix}-${k}`}
        label={label}
        value={Math.round(v * 100)}
        min={Math.round(lo * 100)}
        max={Math.round(hi * 100)}
        reset={k === 'x' || k === 'y' ? 50 : 30}
        onChange={(n) => onPatch({ [k]: n / 100 }, k)}
      />
    );
  };
  const num = (k: 'angle' | 'feather' | 'range' | 'lo' | 'hi' | 'smooth', label: string, reset = 0) => {
    const [lo, hi] = PART_RANGES[k];
    return (
      <Slider
        key={k}
        id={`${idPrefix}-${k}`}
        label={label}
        value={(part as unknown as Record<string, number>)[k]}
        min={lo}
        max={hi}
        reset={reset}
        onChange={(n) => onPatch({ [k]: n }, k)}
      />
    );
  };
  if (part.kind === 'linear')
    return (
      <div className="ig-group">
        <h3>Linear gradient</h3>
        <p className="hint">
          Full on one side, fading to nothing across its length.{' '}
          {inLayer ? 'Positions are within the layer.' : 'Drag on the photo to draw it, or move its handles.'}
        </p>
        {pct('x', 'Across')}
        {pct('y', 'Down')}
        {num('angle', 'Angle', 90)}
        {pct('width', 'Fade length')}
      </div>
    );
  if (part.kind === 'radial')
    return (
      <div className="ig-group">
        <h3>Radial gradient</h3>
        <p className="hint">
          Full inside, fading out towards its edge.{' '}
          {inLayer ? 'Positions and sizes are within the layer.' : 'Drag on the photo to draw a circle, or move its handles.'}
        </p>
        {pct('x', 'Across')}
        {pct('y', 'Down')}
        {pct('rx', 'Width')}
        {pct('ry', 'Height')}
        {num('angle', 'Angle')}
        {num('feather', 'Feather', 50)}
      </div>
    );
  if (part.kind === 'colour') {
    const hex = `#${[part.r, part.g, part.b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
    return (
      <div className="ig-group">
        <h3>Colour range</h3>
        <p className="ig-swatch">
          <span style={{ background: hex }} aria-hidden="true" /> Picked colour {hex}
        </p>
        <p className="hint">Click the photo to pick the colour; similar colours are chosen, in light and in shade.</p>
        {num('range', 'Range', 30)}
      </div>
    );
  }
  return (
    <div className="ig-group">
      <h3>Brightness range</h3>
      <p className="hint">Click the photo to choose the tones around that brightness, or set the range.</p>
      {num('lo', 'Darkest')}
      {num('hi', 'Lightest', 100)}
      {num('smooth', 'Smoothness', 20)}
    </div>
  );
}

/** The settings a mask can apply: the photo's light, colour and effects that make sense in one area. */
const SLIDERS: [keyof Adjustments, string, number, number, number?][] = [
  ['exposure', 'Exposure', -4, 4, 0.05],
  ['contrast', 'Contrast', -100, 100],
  ['highlights', 'Highlights', -100, 100],
  ['shadows', 'Shadows', -100, 100],
  ['whites', 'Whites', -100, 100],
  ['blacks', 'Blacks', -100, 100],
  ['temperature', 'Temperature', -100, 100],
  ['tint', 'Tint', -100, 100],
  ['saturation', 'Saturation', -100, 100],
  ['clarity', 'Clarity', -100, 100],
  ['dehaze', 'Dehaze', -100, 100],
  ['sharpen', 'Sharpening', 0, 100],
  ['noise', 'Noise reduction', 0, 100],
];

export function MaskInspector({ item }: { item: IgItem }) {
  const maskSel = useIg((s) => s.maskSel);
  const mask = item.edit.masks.find((m) => m.id === maskSel);
  if (!mask) return null;
  const a = mask.adjust,
    set = (k: keyof Adjustments, v: number) =>
      updateMask(item.id, mask.id, (m) => ({ ...m, adjust: { ...m.adjust, [k]: v } }), `maskadj:${mask.id}:${k}`);
  return (
    <div className="lp">
      <div className="ig-group">
        <h3>{mask.name}</h3>
        <p className="hint">These apply on top of the photo’s own settings, only where the mask is.</p>
        {SLIDERS.map(([k, label, min, max, step]) => (
          <Slider
            key={k}
            id={`mk-${k}`}
            label={label}
            value={a[k] as number}
            min={min}
            max={max}
            step={step}
            onChange={(v) => set(k, v)}
          />
        ))}
        <button
          type="button"
          className="sbtn"
          onClick={() => updateMask(item.id, mask.id, (m) => ({ ...m, adjust: { ...DEFAULT_ADJUST } }))}
        >
          Reset the mask’s settings
        </button>
      </div>
    </div>
  );
}
