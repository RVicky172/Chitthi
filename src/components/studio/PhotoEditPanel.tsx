import { igFormat } from '../../data/instagram';
import type { Adjustments } from '../../engine/adjust';
import { showsBackground, type IgEdit, type IgRotation } from '../../engine/instagram';
import { toast } from '../../lib/toast';
import { adjustAll, adjustPhoto, applyLookToAll, editPhoto, resetPhoto, setPicking, useIg, type IgItem } from '../../state/instagram';
import { Check, Seg } from '../common';
import { ColourMixer } from '../ig/ColourMixer';
import { CurveEditor } from '../ig/CurveEditor';
import { LookPicker } from '../ig/LookPicker';
import { Slider } from '../ig/Slider';
import { AdjustIcon, FlipIcon, PipetteIcon, ResetIcon, RotateLeftIcon, RotateRightIcon } from '../icons';
import { FoldSection } from '../panel';

/*
 * The photo editor's inspector for a photo: framing, presets and LUTs, light, colour (with the white-balance
 * eyedropper), tone curve, colour mixer, detail and effects, and applying the look to every photo.
 */

/** A photo in the inspector. */
interface PhotoProps {
  item: IgItem;
}

/** The turns a photo can have. */
const ROTATIONS: readonly IgRotation[] = [0, 90, 180, 270];

/**
 * A quarter turn more or less.
 * @param rotation the photo's turn
 * @param by +90 or -90
 * @returns the new turn, 0–270
 */
const turned = (rotation: IgRotation, by: 90 | -90): IgRotation => ROTATIONS.find((turn) => turn === (((rotation + by) % 360) + 360) % 360) ?? 0;

/**
 * The summary of a closed section that holds edits.
 * @param adjust the photo's settings
 * @param keys the settings the section holds (each 0 when unchanged)
 * @returns "Changed" when any of them is set, else nothing
 */
function changedNote(adjust: Adjustments, keys: readonly NumericAdjustment[]): string | undefined {
  return keys.some((key) => adjust[key] !== 0) ? 'Changed' : undefined;
}

/** The photo settings that hold a number. */
type NumericAdjustment = { [Key in keyof Adjustments]: Adjustments[Key] extends number ? Key : never }[keyof Adjustments];

const LIGHT_KEYS: readonly NumericAdjustment[] = ['exposure', 'contrast', 'highlights', 'shadows', 'whites', 'blacks', 'brightness'];
const COLOUR_KEYS: readonly NumericAdjustment[] = ['temperature', 'tint', 'saturation', 'warmth'];
const DETAIL_KEYS: readonly NumericAdjustment[] = ['sharpen', 'noise'];
const EFFECT_KEYS: readonly NumericAdjustment[] = ['clarity', 'dehaze', 'vignette', 'grain'];

/**
 * The photo's name and size, always in view above the sections (as the clip inspector's, 503 D4).
 * @param props the photo
 */
function PhotoName({ item }: Readonly<PhotoProps>) {
  return (
    <p className="hint ig-name" title={item.name}>
      <AdjustIcon /> {item.name} · {item.w}×{item.h} px
      {Math.max(item.w, item.h) < 1080 ? ' · smaller than Instagram’s 1080 px, so it may look soft' : ''}
    </p>
  );
}

/**
 * How the photo fills the frame, its background, zoom, turns, mirror and centring.
 * @param props the photo
 */
function FrameGroup({ item }: Readonly<PhotoProps>) {
  const format = igFormat(useIg((state) => state.format));
  const { edit } = item;
  const set = (patch: Partial<IgEdit>) => editPhoto(item.id, patch);
  const bgShows = showsBackground(item.preview.width, item.preview.height, edit, format.w, format.h);
  return (
    <FoldSection id="photo.frame" title="Frame" defaultOpen={false}>
      <Seg<IgEdit['fit']>
        label="How the photo fills the frame"
        value={edit.fit}
        options={[
          ['fill', 'Fill the frame'],
          ['fit', 'Whole photo'],
        ]}
        onChange={(fit) => set({ fit, px: 0, py: 0 })}
      />
      {(edit.fit === 'fit' || bgShows) && (
        <div className="ig-bg">
          <span className="hint">Background</span>
          <Check checked={edit.bg === 'blur'} onChange={(isBlurred) => set({ bg: isBlurred ? 'blur' : '#ffffff' })}>
            Blurred photo
          </Check>
          {edit.bg !== 'blur' && (
            <label className="ig-colour">
              <span className="vh">Background colour</span>
              <input type="color" value={edit.bg} onChange={(event) => set({ bg: event.target.value })} />
            </label>
          )}
        </div>
      )}
      <Slider id="ig-zoom" label="Zoom" value={edit.zoom} min={1} max={4} step={0.01} onChange={(zoom) => set({ zoom })} />
      <div className="inline ig-tools">
        <button type="button" className="sbtn" onClick={() => set({ rot: turned(edit.rot, -90), px: 0, py: 0 })}>
          <RotateLeftIcon />
          Rotate left
        </button>
        <button type="button" className="sbtn" onClick={() => set({ rot: turned(edit.rot, 90), px: 0, py: 0 })}>
          <RotateRightIcon />
          Rotate right
        </button>
        <button type="button" className="sbtn" aria-pressed={edit.flip} onClick={() => set({ flip: !edit.flip })}>
          <FlipIcon />
          Mirror
        </button>
        <button type="button" className="sbtn" onClick={() => set({ zoom: 1, px: 0, py: 0 })}>
          <ResetIcon />
          Centre
        </button>
      </div>
    </FoldSection>
  );
}

/** The photo's colour settings and how to change them. */
interface AdjustProps {
  adjust: Adjustments;
  setAdjust: (patch: Partial<Adjustments>) => void;
}

/**
 * Exposure, contrast, highlights, shadows, whites, blacks (and the older Brightness when it is set).
 * @param props the settings and their setter
 */
function LightGroup({ adjust, setAdjust }: Readonly<AdjustProps>) {
  return (
    <FoldSection id="photo.light" title="Light" note={changedNote(adjust, LIGHT_KEYS)}>
      <Slider id="ig-ex" label="Exposure" value={adjust.exposure} min={-4} max={4} step={0.05} onChange={(exposure) => setAdjust({ exposure })} />
      <Slider id="ig-ct" label="Contrast" value={adjust.contrast} min={-100} max={100} onChange={(contrast) => setAdjust({ contrast })} />
      <Slider id="ig-hi" label="Highlights" value={adjust.highlights} min={-100} max={100} onChange={(highlights) => setAdjust({ highlights })} />
      <Slider id="ig-sh" label="Shadows" value={adjust.shadows} min={-100} max={100} onChange={(shadows) => setAdjust({ shadows })} />
      <Slider id="ig-wh" label="Whites" value={adjust.whites} min={-100} max={100} onChange={(whites) => setAdjust({ whites })} />
      <Slider id="ig-bl" label="Blacks" value={adjust.blacks} min={-100} max={100} onChange={(blacks) => setAdjust({ blacks })} />
      {adjust.brightness !== 0 && <Slider id="ig-br" label="Brightness" value={adjust.brightness} min={-100} max={100} onChange={(brightness) => setAdjust({ brightness })} />}
    </FoldSection>
  );
}

/**
 * The white-balance eyedropper, temperature, tint, saturation (and the older Warmth when it is set).
 * @param props the settings and their setter
 */
function ColourGroup({ adjust, setAdjust }: Readonly<AdjustProps>) {
  const isPicking = useIg((state) => state.picking);
  return (
    <FoldSection id="photo.colour" title="Colour" note={changedNote(adjust, COLOUR_KEYS)}>
      <div className="inline ig-tools">
        <button
          type="button"
          className="sbtn"
          aria-pressed={isPicking}
          onClick={() => {
            setPicking(!isPicking);
            // On a phone the inspector sits below the photo: bring the photo into view to be clicked.
            if (!isPicking) document.querySelector('.mst-canvas')?.scrollIntoView({ block: 'nearest' });
          }}
        >
          <PipetteIcon />
          {isPicking ? 'Click something grey or white…' : 'Pick a neutral grey'}
        </button>
      </div>
      <Slider id="ig-te" label="Temperature" value={adjust.temperature} min={-100} max={100} onChange={(temperature) => setAdjust({ temperature })} />
      <Slider id="ig-ti" label="Tint" value={adjust.tint} min={-100} max={100} onChange={(tint) => setAdjust({ tint })} />
      <Slider id="ig-sa" label="Saturation" value={adjust.saturation} min={-100} max={100} onChange={(saturation) => setAdjust({ saturation })} />
      {adjust.warmth !== 0 && <Slider id="ig-wa" label="Warmth" value={adjust.warmth} min={-100} max={100} onChange={(warmth) => setAdjust({ warmth })} />}
    </FoldSection>
  );
}

/**
 * Sharpening (its radius and masking once it is on), noise reduction, then clarity, dehaze, vignette and grain.
 * @param props the settings and their setter
 */
function DetailGroups({ adjust, setAdjust }: Readonly<AdjustProps>) {
  return (
    <>
      <FoldSection id="photo.detail" title="Detail" note={changedNote(adjust, DETAIL_KEYS)}>
        <Slider id="ig-sp" label="Sharpening" value={adjust.sharpen} min={0} max={100} onChange={(sharpen) => setAdjust({ sharpen })} />
        {adjust.sharpen > 0 && (
          <>
            <Slider id="ig-sr" label="Radius" value={adjust.sharpenRadius} min={0.5} max={3} step={0.1} reset={1} onChange={(sharpenRadius) => setAdjust({ sharpenRadius })} />
            <Slider id="ig-sm" label="Masking" value={adjust.sharpenMask} min={0} max={100} onChange={(sharpenMask) => setAdjust({ sharpenMask })} />
          </>
        )}
        <Slider id="ig-nr" label="Noise reduction" value={adjust.noise} min={0} max={100} onChange={(noise) => setAdjust({ noise })} />
      </FoldSection>
      <FoldSection id="photo.effects" title="Effects" note={changedNote(adjust, EFFECT_KEYS)}>
        <Slider id="ig-cl" label="Clarity" value={adjust.clarity} min={-100} max={100} onChange={(clarity) => setAdjust({ clarity })} />
        <Slider id="ig-dh" label="Dehaze" value={adjust.dehaze} min={-100} max={100} onChange={(dehaze) => setAdjust({ dehaze })} />
        <Slider id="ig-vi" label="Vignette" value={adjust.vignette} min={0} max={100} onChange={(vignette) => setAdjust({ vignette })} />
        <Slider id="ig-gr" label="Grain" value={adjust.grain} min={0} max={100} onChange={(grain) => setAdjust({ grain })} />
        <p className="hint">Double-click a slider to reset it.</p>
      </FoldSection>
    </>
  );
}

/**
 * The inspector for a photo (see the file's comment).
 * @param props the photo
 */
export function PhotoEditPanel({ item }: Readonly<PhotoProps>) {
  const hasMany = useIg((state) => state.items.length > 1);
  const { adjust } = item.edit;
  const setAdjust = (patch: Partial<Adjustments>) => adjustPhoto(item.id, patch);
  const applyToAll = (preset: Partial<Adjustments>) => {
    adjustAll(preset);
    toast('Preset applied to every photo.');
  };
  return (
    <div className="lp">
      <PhotoName item={item} />
      {/* Light opens first: Frame and Presets are not the default (503 T024). */}
      <FrameGroup item={item} />
      <FoldSection id="photo.looks" title="Presets and LUTs" defaultOpen={false}>
        <LookPicker idPrefix="ig" adjust={adjust} onChange={setAdjust} onApplyAll={hasMany ? applyToAll : undefined} />
      </FoldSection>
      <LightGroup adjust={adjust} setAdjust={setAdjust} />
      <ColourGroup adjust={adjust} setAdjust={setAdjust} />
      <FoldSection id="photo.curve" title="Tone curve">
        <CurveEditor curve={adjust.curve} onChange={(curve) => setAdjust({ curve })} />
      </FoldSection>
      <FoldSection id="photo.mixer" title="Colour mixer">
        <ColourMixer idPrefix="ig-mix" mixer={adjust.mixer} onChange={(mixer) => setAdjust({ mixer })} />
      </FoldSection>
      <DetailGroups adjust={adjust} setAdjust={setAdjust} />
      <div className="inline ig-tools">
        {hasMany && (
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
