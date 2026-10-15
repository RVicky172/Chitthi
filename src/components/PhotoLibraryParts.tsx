// Parts of the photo library (PhotoLibrary): a photo's card in the grid, the refine bar, and the slot it fills.
import type { Dispatch, SetStateAction } from 'react';
import type { Hue } from '../engine/analyze';
import { shortName } from '../lib/credits';
import { photoKey } from '../lib/photoKey';
import { dimsOf, shapeOf, SHAPE_LABEL, sharpness, slotDpi, slotInfo, type SlotInfo } from '../state/photoFit';
import { selectSlot } from '../state/photoSlots';
import { traitsOf } from '../state/traits';
import type { Design, Photo } from '../types';
import { PhotoCredit } from './common';
import { CropIcon, TrashIcon } from './icons';
import { HUE_SWATCH, type Item, type Refine } from './photoLibraryItems';

/** How sharp a photo will print, as the class of its badge. */
const QUALITY_CLASS: Record<ReturnType<typeof sharpness>, string> = { sharp: 'good', fine: 'ok', soft: 'low' };

/** A photo's card and what it can do. */
export interface LibraryCardProps {
  item: Item;
  /** Dimmed: it needs more cropping for the slot. */
  dim?: boolean;
  /** Photo slots in the layout, and the selected one. */
  count: number;
  active: number;
  /** The selected slot, measured. */
  slot: SlotInfo | null;
  /** The photos in the slots. */
  filled: (Photo | null | undefined)[];
  /** The selected slot's name ("slot 2", "the photo slot"). */
  where: string;
  /** How well the photo suits the slot, 0–1. */
  score: number;
  /** The photo waiting for a second tap to delete. */
  sure: string | null;
  onPlace: (item: Item) => void;
  onCrop: (item: Item) => void;
  onTakeOff: (item: Item) => void;
  onDelete: (id: string) => void;
  setSure: (id: string | null) => void;
}

/**
 * A photo in the grid: its picture (tap to use it), name, credit, size, sharpness in the slot, what the analysis
 * found, and Use, Crop, Take off and Delete (tap twice).
 * @param props the photo, the slots and the actions
 */
export function LibraryCard(props: Readonly<LibraryCardProps>) {
  const { item, count, active, slot, where, sure } = props;
  const dims = dimsOf(item.key),
    dpi = dims && slot ? slotDpi(dims.w, dims.h, slot) : null,
    quality = dpi ? sharpness(dpi) : null,
    inSlot = props.filled.findIndex((photo) => !!photo && photoKey(photo.url) === item.key),
    traits = traitsOf(item.key),
    asking = item.id !== undefined && sure === item.id;
  return (
    <li className={`lib-item${props.dim ? ' dim' : ''}`}>
      <button
        type="button"
        className="lib-ph"
        title={count ? `Put in ${where}` : item.name}
        onClick={() => props.onPlace(item)}
        disabled={!count}
      >
        <img src={item.view} alt={item.name} loading="lazy" decoding="async" />
        {inSlot >= 0 && <b className="lib-badge">{count > 1 ? `Slot ${inSlot + 1}` : 'On design'}</b>}
        {inSlot < 0 && item.card >= 0 && <b className="lib-badge muted">On design</b>}
      </button>
      <div className="lib-meta">
        <span className="lib-name">{shortName(item.name)}</span>
        <PhotoCredit name={item.name} />
        <span className="lib-facts">
          {dims
            ? `${dims.w.toLocaleString()} × ${dims.h.toLocaleString()} · ${SHAPE_LABEL[shapeOf(dims.w, dims.h)]}`
            : '…'}
          {quality && <em className={`q ${QUALITY_CLASS[quality]}`}>{`${quality} (${dpi} dpi)`}</em>}
        </span>
        {traits && (
          <span className="lib-tags">
            <b title="How well this photo suits the selected slot: shape, print sharpness, focus and colours">
              {Math.round(props.score * 100)}% match
            </b>
            {traits.tags.slice(0, 4).join(' · ')}
          </span>
        )}
      </div>
      <div className="lib-acts">
        {count > 0 && (
          <button type="button" className="sbtn accent" onClick={() => props.onPlace(item)}>
            {count > 1 ? `Use in slot ${active + 1}` : 'Use'}
          </button>
        )}
        {count > 0 && (
          <button type="button" className="sbtn" aria-label={`Crop ${item.name}`} onClick={() => props.onCrop(item)}>
            <CropIcon />
            Crop
          </button>
        )}
        {item.card >= 0 && (
          <button type="button" className="sbtn" onClick={() => props.onTakeOff(item)}>
            Take off
          </button>
        )}
        {item.id && (
          <button
            type="button"
            className={`sbtn danger${asking ? ' sure' : ''}`}
            aria-label={asking ? `Tap again to delete ${item.name}` : `Delete ${item.name} from the library`}
            onClick={() => {
              if (!item.id) return;
              if (asking) {
                props.setSure(null);
                props.onDelete(item.id);
              } else props.setSure(item.id);
            }}
          >
            <TrashIcon />
            {asking ? 'Sure?' : ''}
          </button>
        )}
      </div>
    </li>
  );
}

const LIGHTS = ['bright', 'dark'] as const;
const MOODS = ['colourful', 'muted', 'warm', 'cool'] as const;
const QUALITIES = [
  ['print', 'Print-sharp here'],
  ['sharp', 'In focus'],
] as const;

/**
 * Toggles one refine choice: chosen again, it is cleared.
 * @param previous the choices
 * @param key the choice
 * @param value its value
 * @returns the new choices
 */
function toggleRefine<Key extends keyof Refine>(previous: Refine, key: Key, value: Refine[Key]): Refine {
  return { ...previous, [key]: previous[key] === value ? undefined : value };
}

/** The refine choices and the colours found. */
interface RefineBarProps {
  hues: Hue[];
  refine: Refine;
  setRefine: Dispatch<SetStateAction<Refine>>;
  relevantOnly: boolean;
  onRelevantOnly: (on: boolean) => void;
}

/**
 * Refining by what is in the photos: colour, light, mood, quality, and relevant only.
 * @param props the colours found, the choices and their setters
 */
export function RefineBar({ hues, refine, setRefine, relevantOnly, onRelevantOnly }: Readonly<RefineBarProps>) {
  return (
    <div className="lib-refine" role="group" aria-label="Refine by what's in the photos">
      <span className="lib-refine-l">Colour</span>
      {hues.map((hue) => (
        <button
          key={hue}
          type="button"
          className="swatch"
          title={hue}
          aria-label={`${hue} photos`}
          aria-pressed={refine.hue === hue}
          style={{ background: HUE_SWATCH[hue] }}
          onClick={() => setRefine((previous) => toggleRefine(previous, 'hue', hue))}
        />
      ))}
      <span className="lib-refine-l">Light</span>
      {LIGHTS.map((light) => (
        <button
          key={light}
          type="button"
          className="chip"
          aria-pressed={refine.light === light}
          onClick={() => setRefine((previous) => toggleRefine(previous, 'light', light))}
        >
          {light}
        </button>
      ))}
      <span className="lib-refine-l">Mood</span>
      {MOODS.map((mood) => (
        <button
          key={mood}
          type="button"
          className="chip"
          aria-pressed={refine.mood === mood}
          onClick={() => setRefine((previous) => toggleRefine(previous, 'mood', mood))}
        >
          {mood}
        </button>
      ))}
      <span className="lib-refine-l">Quality</span>
      {QUALITIES.map(([quality, label]) => (
        <button
          key={quality}
          type="button"
          className="chip"
          aria-pressed={refine.quality === quality}
          onClick={() => setRefine((previous) => toggleRefine(previous, 'quality', quality))}
        >
          {label}
        </button>
      ))}
      <label className="check">
        <input type="checkbox" checked={relevantOnly} onChange={(event) => onRelevantOnly(event.target.checked)} />{' '}
        Relevant only
      </label>
    </div>
  );
}

/** The slots and the selected one. */
interface SlotChipsProps {
  design: Design;
  filled: unknown[];
  active: number;
}

/**
 * The slots to fill, one chip each with its shape.
 * @param props the design, the slots and the selected one
 */
export function SlotChips({ design, filled, active }: Readonly<SlotChipsProps>) {
  return (
    <div className="chips" role="radiogroup" aria-label="Slot to fill">
      {filled.map((_, slotIndex) => {
        const info = slotInfo(design, slotIndex);
        return (
          <button
            key={slotIndex}
            type="button"
            role="radio"
            className="chip"
            aria-checked={slotIndex === active}
            aria-pressed={slotIndex === active}
            onClick={() => selectSlot(slotIndex)}
          >
            Slot {slotIndex + 1}
            {info ? ` · ${SHAPE_LABEL[info.shape]}` : ''}
          </button>
        );
      })}
    </div>
  );
}
