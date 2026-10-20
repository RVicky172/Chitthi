import { DEFAULT_ADJUST, type Adjustments } from '../../engine/adjust';
import { isOneOf } from '../../engine/guards';
import {
  MASK_LIMITS,
  newMask,
  newPart,
  PART_RANGES,
  type AiPart,
  type Mask,
  type MaskCombine,
  type MaskPart,
  type PartKind,
} from '../../engine/masks';
import type { AiTarget } from '../../engine/segments';
import { selectMask, setMaskBrush, setMasks, updateMask, useIg, type IgItem } from '../../state/instagram';
import { Check, Seg } from '../common';
import { TrashIcon } from '../icons';
import { Slider } from './Slider';
import { findWithAi, useAiStatus, type AiStatus } from './useAiMask';

/*
 * The photo editor's masks (P1.6, P1.7, P1.8). The panel lists the photo's masks (add, select, switch off, delete), the parts
 * of the selected one (brush, linear and radial gradients, colour and brightness ranges, each joining the parts
 * before it by adding, subtracting or intersecting; AI parts find the subject or the sky on this device) and the
 * selected part's settings. Brushes are painted and
 * gradients dragged on the stage (PhotoWorkspace); every gradient and range setting is a slider here as well, so a
 * mask can be shaped from the keyboard. The inspector holds the selected mask's own settings.
 */

const COMBINES: [MaskCombine, string][] = [
  ['add', 'Add'],
  ['subtract', 'Subtract'],
  ['intersect', 'Intersect'],
];
const COMBINE_VALUES = COMBINES.map(([combine]) => combine);

/** Each kind: its name in lists, and in "New … mask" / "Add a … part" buttons. */
const PART_KINDS: [PartKind, string, string][] = [
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
  ai: 'AI',
};
const TARGETS: Record<AiTarget, string> = { subject: 'Subject', sky: 'Sky' };
const AI_TARGETS: AiTarget[] = ['subject', 'sky'];

/** A gradient or range part: the kinds with sliders. */
export type SettingsPart = Exclude<MaskPart, { kind: 'brush' } | { kind: 'ai' }>;
/** A gradient or range setting. */
type PartSetting = keyof typeof PART_RANGES;
/** Changed gradient or range settings; only settings the part's kind has. */
export type PartPatch = Partial<Record<PartSetting, number>>;

/**
 * "Brush 2": the part's kind (an AI part: what it finds) and its number among the parts of that kind.
 * @param parts the mask's parts
 * @param part the part
 * @returns its label
 */
export const partLabel = (parts: MaskPart[], part: MaskPart) => {
  const name = (candidate: MaskPart) => (candidate.kind === 'ai' ? TARGETS[candidate.target] : NAMES[candidate.kind]);
  return `${name(part)} ${parts.filter((candidate) => name(candidate) === name(part)).indexOf(part) + 1}`;
};

/** New masks found by AI: what each button makes (the background is the subject inverted). */
const AI_MASKS: [string, AiTarget, boolean][] = [
  ['Subject', 'subject', false],
  ['Background', 'subject', true],
  ['Sky', 'sky', false],
];

/**
 * An AI part finding `target` (inverted for the background).
 * @param target what it finds
 * @param invert whether it is inverted
 * @param first whether it is the mask's first part
 * @returns the part
 */
const aiPart = (target: AiTarget, invert = false, first = true): MaskPart => {
  const part = newPart('ai', first);
  return part.kind === 'ai' ? { ...part, target, invert } : part;
};

/**
 * The next free "Mask n" name.
 * @param masks the photo's masks
 * @param base the name before the number
 * @returns the name
 */
const nextName = (masks: Mask[], base: string) => {
  for (let number = masks.length + 1; ; number++)
    if (!masks.some((mask) => mask.name === `${base} ${number}`)) return `${base} ${number}`;
};

/**
 * Adds a mask of one kind to a photo and selects it.
 * @param item the photo
 * @param kind its first part's kind
 * @returns the mask, or null when the photo has the most masks allowed
 */
export function addMask(item: IgItem, kind: PartKind = 'brush'): Mask | null {
  if (item.edit.masks.length >= MASK_LIMITS.masks) return null;
  const mask = newMask(nextName(item.edit.masks, 'Mask'), kind);
  setMasks(item.id, [...item.edit.masks, mask]);
  selectMask(mask.id);
  return mask;
}

/**
 * Adds a mask that an AI model shapes, selects it and starts finding its target.
 * @param item the photo
 * @param name the mask's name before its number
 * @param target what to find
 * @param invert whether the part is inverted (the background)
 */
function addAiMask(item: IgItem, name: string, target: AiTarget, invert: boolean): void {
  if (item.edit.masks.length >= MASK_LIMITS.masks) return;
  const mask: Mask = { ...newMask(nextName(item.edit.masks, name), 'ai'), parts: [aiPart(target, invert)] };
  setMasks(item.id, [...item.edit.masks, mask]);
  selectMask(mask.id);
  void findWithAi(item, target);
}

/** The photo whose masks are edited. */
interface MaskItemProps {
  item: IgItem;
}

/**
 * The mask panel: the photo's masks, the selected mask's parts, and the selected part's settings.
 * @param props the photo
 */
export function MaskPanel({ item }: Readonly<MaskItemProps>) {
  const maskSel = useIg((state) => state.maskSel),
    partSel = useIg((state) => state.partSel);
  const mask = item.edit.masks.find((candidate) => candidate.id === maskSel),
    part = mask?.parts.find((candidate) => candidate.id === partSel);
  /**
   * Replaces one part of the selected mask.
   * @param next the part (its id says which)
   * @param key groups changes into one undo step
   */
  const replacePart = (next: MaskPart, key = '') => {
    if (!mask) return;
    const parts = mask.parts.map((old) => (old.id === next.id ? next : old));
    updateMask(item.id, mask.id, (old) => ({ ...old, parts }), key);
  };

  return (
    <div className="lp">
      <MaskList item={item} />
      {mask && <SelectedMask item={item} mask={mask} replacePart={replacePart} />}
      {(!part || part.kind === 'brush') && <BrushSettings hasMask={!!mask} />}
      {part?.kind === 'ai' && (
        <AiPartSettings
          item={item}
          part={part}
          onTarget={(target) => {
            replacePart({ ...part, target });
            void findWithAi(item, target);
          }}
        />
      )}
      {part && part.kind !== 'brush' && part.kind !== 'ai' && (
        <PartSettings
          part={part}
          onPatch={(patch, setting) => replacePart({ ...part, ...patch }, `maskpart:${part.id}:${setting}`)}
        />
      )}
    </div>
  );
}

/**
 * The photo's masks: new ones (by kind or found by AI), and the list (select, switch off, delete).
 * @param props the photo
 */
function MaskList({ item }: Readonly<MaskItemProps>) {
  const maskSel = useIg((state) => state.maskSel);
  const masks = item.edit.masks;
  return (
    <div className="ig-group">
      <p className="hint">Shape it here and on the photo, then set its settings in the inspector.</p>
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
      <div className="ig-newmask" role="group" aria-label="New mask found by AI">
        <span className="hint">Find:</span>
        {AI_MASKS.map(([name, target, invert]) => (
          <button
            key={name}
            type="button"
            className="sbtn"
            aria-label={`New ${name.toLowerCase()} mask, found by AI`}
            disabled={masks.length >= MASK_LIMITS.masks}
            onClick={() => addAiMask(item, name, target, invert)}
          >
            {name}
          </button>
        ))}
      </div>
      {masks.length > 0 && (
        <ul className="ig-masks" aria-label="Masks of this photo">
          {masks.map((mask) => (
            <li key={mask.id} className={mask.id === maskSel ? 'on' : ''}>
              <button
                type="button"
                className="ig-mask-name"
                aria-pressed={mask.id === maskSel}
                onClick={() => selectMask(mask.id === maskSel ? null : mask.id)}
              >
                {mask.name}
              </button>
              <label className="ig-mask-on">
                <input
                  type="checkbox"
                  checked={mask.on}
                  onChange={(event) => updateMask(item.id, mask.id, (old) => ({ ...old, on: event.target.checked }))}
                />
                <span className="vh">Apply {mask.name}</span>
              </label>
              <button
                type="button"
                className="sbtn"
                aria-label={`Delete mask ${mask.name}`}
                onClick={() => {
                  setMasks(
                    item.id,
                    masks.filter((other) => other.id !== mask.id),
                  );
                  if (mask.id === maskSel) selectMask(null);
                }}
              >
                <TrashIcon />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The selected mask and how to change its parts. */
interface SelectedMaskProps {
  item: IgItem;
  mask: Mask;
  /** Replaces one of its parts (same id); `key` groups changes into one undo step. */
  replacePart: (part: MaskPart, key?: string) => void;
}

/**
 * The selected mask: its name, invert, the red overlay, its parts (select, join, invert, clear, delete) and adding
 * parts.
 * @param props the photo, the mask and replacing a part
 */
function SelectedMask({ item, mask, replacePart }: Readonly<SelectedMaskProps>) {
  const partSel = useIg((state) => state.partSel),
    brush = useIg((state) => state.maskBrush);
  const masks = item.edit.masks;
  const setParts = (parts: MaskPart[]) => {
    updateMask(item.id, mask.id, (old) => ({ ...old, parts }), '');
  };
  const addPart = (part: MaskPart) => {
    setParts([...mask.parts, part]);
    selectMask(mask.id, part.id);
  };
  return (
    <div className="ig-group">
      <h3>Selected mask</h3>
      <div className="ig-slider">
        <label htmlFor="mk-name">Name</label>
        <input
          id="mk-name"
          type="text"
          maxLength={MASK_LIMITS.name}
          value={mask.name}
          onChange={(event) =>
            updateMask(item.id, mask.id, (old) => ({ ...old, name: event.target.value }), `maskname:${mask.id}`)
          }
          onBlur={(event) => {
            if (!event.target.value.trim())
              updateMask(item.id, mask.id, (old) => ({ ...old, name: nextName(masks, 'Mask') }));
          }}
        />
      </div>
      <Check checked={mask.invert} onChange={(invert) => updateMask(item.id, mask.id, (old) => ({ ...old, invert }))}>
        Invert the mask
      </Check>
      <Check checked={brush.overlay} onChange={(overlay) => setMaskBrush({ overlay })}>
        Show the mask in red
      </Check>
      <ul className="ig-parts" aria-label={`Parts of ${mask.name}`}>
        {mask.parts.map((part, partIndex) => (
          <PartRow
            key={part.id}
            mask={mask}
            part={part}
            first={partIndex === 0}
            selected={part.id === partSel}
            replacePart={replacePart}
            onDelete={() => {
              setParts(mask.parts.filter((other) => other.id !== part.id));
              if (part.id === partSel) selectMask(mask.id);
            }}
          />
        ))}
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
            onClick={() => addPart(newPart(kind, false))}
          >
            {short}
          </button>
        ))}
        {AI_TARGETS.map((target) => (
          <button
            key={target}
            type="button"
            className="sbtn"
            aria-label={`Add a ${target} part, found by AI`}
            disabled={mask.parts.length >= MASK_LIMITS.parts}
            onClick={() => {
              addPart(aiPart(target, false, !mask.parts.length));
              void findWithAi(item, target);
            }}
          >
            {TARGETS[target]}
          </button>
        ))}
      </div>
    </div>
  );
}

/** One part in the selected mask's list. */
interface PartRowProps {
  mask: Mask;
  part: MaskPart;
  /** The mask's first part (it joins nothing). */
  first: boolean;
  selected: boolean;
  replacePart: (part: MaskPart, key?: string) => void;
  onDelete: () => void;
}

/**
 * A part's row: select it, how it joins the parts before it, invert, clear (brush) and delete.
 * @param props the mask, the part, its place and the actions
 */
function PartRow({ mask, part, first, selected, replacePart, onDelete }: Readonly<PartRowProps>) {
  const label = partLabel(mask.parts, part);
  return (
    <li className={selected ? 'on' : ''}>
      <button
        type="button"
        className="ig-mask-name"
        aria-pressed={selected}
        onClick={() => selectMask(mask.id, part.id)}
      >
        {label}
        {part.kind === 'brush' && (
          <small>
            {' '}
            · {part.strokes.length} stroke{part.strokes.length === 1 ? '' : 's'}
          </small>
        )}
      </button>
      {!first && (
        <select
          aria-label={`How ${label} joins the parts before it`}
          value={part.combine}
          onChange={(event) => {
            const combine = event.target.value;
            if (isOneOf(COMBINE_VALUES, combine)) replacePart({ ...part, combine });
          }}
        >
          {COMBINES.map(([combine, name]) => (
            <option key={combine} value={combine}>
              {name}
            </option>
          ))}
        </select>
      )}
      <label className="ig-mask-on">
        <input
          type="checkbox"
          checked={part.invert}
          onChange={(event) => replacePart({ ...part, invert: event.target.checked })}
        />
        <span>Invert</span>
        <span className="vh"> {label}</span>
      </label>
      {part.kind === 'brush' && (
        <button
          type="button"
          className="sbtn"
          aria-label={`Clear the strokes of ${label}`}
          disabled={!part.strokes.length}
          onClick={() => replacePart({ ...part, strokes: [] })}
        >
          Clear
        </button>
      )}
      {mask.parts.length > 1 && (
        <button type="button" className="sbtn" aria-label={`Delete ${label}`} onClick={onDelete}>
          <TrashIcon />
        </button>
      )}
    </li>
  );
}

/** Whether a mask is selected (the hint differs). */
interface BrushSettingsProps {
  hasMask: boolean;
}

/**
 * The mask brush: paint or erase, size, feather and flow.
 * @param props whether a mask is selected
 */
function BrushSettings({ hasMask }: Readonly<BrushSettingsProps>) {
  const brush = useIg((state) => state.maskBrush);
  return (
    <div className="ig-group">
      <h3>Brush</h3>
      <Seg<'paint' | 'erase'>
        label="Brush mode"
        value={brush.erase ? 'erase' : 'paint'}
        options={[
          ['paint', 'Paint'],
          ['erase', 'Erase'],
        ]}
        onChange={(mode) => setMaskBrush({ erase: mode === 'erase' })}
      />
      <Slider
        id="mk-size"
        label="Size"
        value={Math.round(brush.size * 100)}
        min={1}
        max={40}
        reset={8}
        onChange={(size) => setMaskBrush({ size: size / 100 })}
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
        {hasMask
          ? 'Paint on the photo to add to the selected part; Erase takes away. Each pass builds up by the flow.'
          : 'Painting on the photo starts a new brush mask.'}
      </p>
    </div>
  );
}

/**
 * A gradient or range setting of a part.
 * @param part the part
 * @param setting the setting
 * @returns its value (0 when the part's kind has no such setting)
 */
function settingOf(part: SettingsPart, setting: PartSetting): number {
  const value: unknown = Object.entries(part).find(([name]) => name === setting)?.[1];
  return typeof value === 'number' ? value : 0;
}

/** A gradient or range part and where its changes go. */
interface PartSettingsProps {
  part: SettingsPart;
  /** Changed settings; `setting` names the one that changed (for grouping undo steps). */
  onPatch: (patch: PartPatch, setting: PartSetting) => void;
  idPrefix?: string;
  /** A layer's mask: positions are within the layer, and there are no handles on the stage to mention. */
  inLayer?: boolean;
}

/**
 * Sliders for a gradient or range part: the keyboard's way to shape them, and the only way for a layer's mask.
 * Positions and sizes show as per cent.
 * @param props the part, its change handler, the id prefix and whether it is a layer's mask
 */
export function PartSettings({ part, onPatch, idPrefix = 'mk', inLayer = false }: Readonly<PartSettingsProps>) {
  const percent = (setting: 'x' | 'y' | 'width' | 'rx' | 'ry', label: string) => {
    const [low, high] = PART_RANGES[setting];
    return (
      <Slider
        key={setting}
        id={`${idPrefix}-${setting}`}
        label={label}
        value={Math.round(settingOf(part, setting) * 100)}
        min={Math.round(low * 100)}
        max={Math.round(high * 100)}
        reset={setting === 'x' || setting === 'y' ? 50 : 30}
        onChange={(value) => onPatch({ [setting]: value / 100 }, setting)}
      />
    );
  };
  const plain = (setting: 'angle' | 'feather' | 'range' | 'lo' | 'hi' | 'smooth', label: string, reset = 0) => {
    const [low, high] = PART_RANGES[setting];
    return (
      <Slider
        key={setting}
        id={`${idPrefix}-${setting}`}
        label={label}
        value={settingOf(part, setting)}
        min={low}
        max={high}
        reset={reset}
        onChange={(value) => onPatch({ [setting]: value }, setting)}
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
        {percent('x', 'Across')}
        {percent('y', 'Down')}
        {plain('angle', 'Angle', 90)}
        {percent('width', 'Fade length')}
      </div>
    );
  if (part.kind === 'radial')
    return (
      <div className="ig-group">
        <h3>Radial gradient</h3>
        <p className="hint">
          Full inside, fading out towards its edge.{' '}
          {inLayer
            ? 'Positions and sizes are within the layer.'
            : 'Drag on the photo to draw a circle, or move its handles.'}
        </p>
        {percent('x', 'Across')}
        {percent('y', 'Down')}
        {percent('rx', 'Width')}
        {percent('ry', 'Height')}
        {plain('angle', 'Angle')}
        {plain('feather', 'Feather', 50)}
      </div>
    );
  if (part.kind === 'colour') {
    const hex = `#${[part.r, part.g, part.b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
    return (
      <div className="ig-group">
        <h3>Colour range</h3>
        <p className="ig-swatch">
          <span style={{ background: hex }} aria-hidden="true" /> Picked colour {hex}
        </p>
        <p className="hint">Click the photo to pick the colour; similar colours are chosen, in light and in shade.</p>
        {plain('range', 'Range', 30)}
      </div>
    );
  }
  return (
    <div className="ig-group">
      <h3>Brightness range</h3>
      <p className="hint">Click the photo to choose the tones around that brightness, or set the range.</p>
      {plain('lo', 'Darkest')}
      {plain('hi', 'Lightest', 100)}
      {plain('smooth', 'Smoothness', 20)}
    </div>
  );
}

/**
 * What an AI part's panel says about the segmenter.
 * @param status what it is doing, or undefined when idle
 * @param target what the part finds
 * @returns the text
 */
function aiStatusText(status: AiStatus | undefined, target: AiTarget): string {
  if (status?.state === 'working') {
    const progress =
      status.progress === undefined ? '…' : `: downloading the model, ${Math.round(status.progress * 100)} %`;
    return `Finding the ${target}${progress}`;
  }
  if (status?.state === 'error') return status.message;
  if (status?.state === 'download')
    return `Finding the sky needs a one-time download of the sky model (${Math.round(status.bytes / 1e6)} MB, MIT licence) from Hugging Face. It stays on this device; your photos never leave it.`;
  return `Found on this device by an AI model. To refine it, paint on the photo: Paint adds to the mask, Erase takes away. Tick Invert for everything but the ${target}.`;
}

/** An AI part of a photo's mask. */
interface AiPartSettingsProps {
  item: IgItem;
  part: AiPart;
  onTarget: (target: AiTarget) => void;
}

/**
 * An AI part: what it finds, and what the segmenter is doing (asking before a download, working, failed).
 * @param props the photo, the part and changing its target
 */
function AiPartSettings({ item, part, onTarget }: Readonly<AiPartSettingsProps>) {
  const status = useAiStatus(item.id, part.target);
  return (
    <div className="ig-group">
      <h3>Found by AI</h3>
      <Seg<AiTarget>
        label="What to find"
        value={part.target}
        options={[
          ['subject', 'Subject'],
          ['sky', 'Sky'],
        ]}
        onChange={onTarget}
      />
      <p className="hint" role="status">
        {aiStatusText(status, part.target)}
      </p>
      {status?.state === 'download' && (
        <button type="button" className="btn" onClick={() => void findWithAi(item, part.target, true)}>
          Download the sky model
        </button>
      )}
      {status?.state === 'error' && (
        <button type="button" className="sbtn" onClick={() => void findWithAi(item, part.target)}>
          Try again
        </button>
      )}
    </div>
  );
}

/** The photo settings that hold a number. */
type NumericAdjustment = {
  [Key in keyof Adjustments]: Adjustments[Key] extends number ? Key : never;
}[keyof Adjustments];

/** The settings a mask can apply: the photo's light, colour and effects that make sense in one area. */
const SLIDERS: [NumericAdjustment, string, number, number, number?][] = [
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

/**
 * The inspector for the selected mask: the settings it applies where it is, and their reset.
 * @param props the photo
 */
export function MaskInspector({ item }: Readonly<MaskItemProps>) {
  const maskSel = useIg((state) => state.maskSel);
  const mask = item.edit.masks.find((candidate) => candidate.id === maskSel);
  if (!mask) return null;
  const setSetting = (setting: NumericAdjustment, value: number) =>
    updateMask(
      item.id,
      mask.id,
      (old) => ({ ...old, adjust: { ...old.adjust, [setting]: value } }),
      `maskadj:${mask.id}:${setting}`,
    );
  return (
    <div className="lp">
      <div className="ig-group">
        <h3>{mask.name}</h3>
        <p className="hint">These apply on top of the photo’s own settings, only where the mask is.</p>
        {SLIDERS.map(([setting, label, min, max, step]) => (
          <Slider
            key={setting}
            id={`mk-${setting}`}
            label={label}
            value={mask.adjust[setting]}
            min={min}
            max={max}
            step={step}
            onChange={(value) => setSetting(setting, value)}
          />
        ))}
        <button
          type="button"
          className="sbtn"
          onClick={() => updateMask(item.id, mask.id, (old) => ({ ...old, adjust: { ...DEFAULT_ADJUST } }))}
        >
          Reset the mask’s settings
        </button>
      </div>
    </div>
  );
}
