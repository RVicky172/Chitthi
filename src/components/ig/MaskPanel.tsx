import { DEFAULT_ADJUST, type Adjustments } from '../../engine/adjust';
import { MASK_LIMITS, newBrushPart, newMask, type Mask, type MaskCombine, type MaskPart } from '../../engine/masks';
import { selectMask, setMaskBrush, setMasks, updateMask, useIg, type IgItem } from '../../state/instagram';
import { Check, Seg } from '../common';
import { TrashIcon } from '../icons';
import { Slider } from './Slider';

/*
 * The photo editor's masks (P1.6). The panel lists the photo's masks (add, select, switch off, delete), the parts of the
 * selected one (each a brush that joins the parts before it by adding, subtracting or intersecting) and the brush;
 * painting happens on the stage (PhotoWorkspace). The inspector holds the selected mask's own settings, which apply
 * only where it is.
 */

const COMBINES: [MaskCombine, string][] = [
  ['add', 'Add'],
  ['subtract', 'Subtract'],
  ['intersect', 'Intersect'],
];

/** The next free "Mask n" name. */
const nextName = (masks: Mask[], base: string) => {
  for (let i = masks.length + 1; ; i++) if (!masks.some((m) => m.name === `${base} ${i}`)) return `${base} ${i}`;
};

/** Adds a brush mask to a photo and selects it. */
export function addBrushMask(item: IgItem): Mask | null {
  if (item.edit.masks.length >= MASK_LIMITS.masks) return null;
  const m = newMask(nextName(item.edit.masks, 'Mask'));
  setMasks(item.id, [...item.edit.masks, m]);
  selectMask(m.id);
  return m;
}

export function MaskPanel({ item }: { item: IgItem }) {
  const maskSel = useIg((s) => s.maskSel),
    partSel = useIg((s) => s.partSel),
    brush = useIg((s) => s.maskBrush);
  const masks = item.edit.masks,
    mask = masks.find((m) => m.id === maskSel);
  const setParts = (parts: MaskPart[], key = '') => mask && updateMask(item.id, mask.id, (m) => ({ ...m, parts }), key);
  const patchPart = (id: string, patch: Partial<MaskPart>) =>
    mask && setParts(mask.parts.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  return (
    <div className="lp">
      <div className="ig-group">
        <h3>Masks</h3>
        <p className="hint">
          A mask limits its own settings to part of the photo: paint where they apply, then set them in the inspector.
        </p>
        <button
          type="button"
          className="sbtn accent"
          disabled={masks.length >= MASK_LIMITS.masks}
          onClick={() => addBrushMask(item)}
        >
          New brush mask
        </button>
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
            {mask.parts.map((p, k) => (
              <li key={p.id} className={p.id === partSel ? 'on' : ''}>
                <button
                  type="button"
                  className="ig-mask-name"
                  aria-pressed={p.id === partSel}
                  onClick={() => selectMask(mask.id, p.id)}
                >
                  Brush {k + 1}
                  <small>
                    {' '}
                    · {p.strokes.length} stroke{p.strokes.length === 1 ? '' : 's'}
                  </small>
                </button>
                {k > 0 && (
                  <select
                    aria-label={`How brush ${k + 1} joins the parts before it`}
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
                </label>
                <button
                  type="button"
                  className="sbtn"
                  aria-label={`Clear the strokes of brush ${k + 1}`}
                  disabled={!p.strokes.length}
                  onClick={() => patchPart(p.id, { strokes: [] })}
                >
                  Clear
                </button>
                {mask.parts.length > 1 && (
                  <button
                    type="button"
                    className="sbtn"
                    aria-label={`Delete brush ${k + 1}`}
                    onClick={() => {
                      setParts(mask.parts.filter((x) => x.id !== p.id));
                      if (p.id === partSel) selectMask(mask.id);
                    }}
                  >
                    <TrashIcon />
                  </button>
                )}
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="sbtn"
            disabled={mask.parts.length >= MASK_LIMITS.parts}
            onClick={() => {
              const part = newBrushPart('add');
              setParts([...mask.parts, part]);
              selectMask(mask.id, part.id);
            }}
          >
            Add a brush part
          </button>
        </div>
      )}

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
            : 'Painting on the photo starts a new mask.'}
        </p>
      </div>
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
