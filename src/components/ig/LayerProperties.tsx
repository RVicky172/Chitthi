// The selected layer's properties, shared by the photo and video editors: its kind's own (text, shape), size, turn,
// opacity, blend mode, mask, timing on a video, duplicate and centre.
import type { ReactNode } from 'react';
import { shapeDef, TEXT_FONTS } from '../../data/layers';
import { isOneOf } from '../../engine/guards';
import {
  BLEND_MODES,
  layerName,
  scaleLayer,
  type Layer,
  type LayerMask,
  type ShapeLayer,
  type TextLayer,
} from '../../engine/layers';
import { newPart, type MaskPart } from '../../engine/masks';
import type { LayerKeyProp } from '../../engine/keyframes';
import { Check, Seg } from '../common';
import { FontPicker } from '../FontPicker';
import { PlusIcon } from '../icons';
import { FoldSection } from '../panel';
import { formatClock, LpRange, Swatches } from './LayerControls';
import type { LayerPanelProps } from './LayerPanel';
import { PartSettings } from './MaskPanel';

const BLEND_VALUES = BLEND_MODES.map(([mode]) => mode);

/** Changes some of a layer's properties; `key` groups changes into one undo step ('' for a step of its own). */
type Update<Kind extends Layer = Layer> = (patch: Partial<Kind>, key?: string) => void;

/**
 * The turn shown on the slider: -180° to 180° instead of 0° to 360°.
 * @param rot the stored turn, degrees
 * @returns the shown turn
 */
const shownTurn = (rot: number) => (rot > 180 ? rot - 360 : rot);

/**
 * The selected layer's properties: its kind's own, size, turn, opacity, blend, mask, timing and actions.
 * @param props the panel's props and the selected layer
 */
export function LayerProperties({
  layer,
  onUpdate,
  onAdd,
  timing,
  keyframes,
  keyNav,
}: Readonly<LayerPanelProps & { layer: Layer }>) {
  const update: Update = (patch, key = `prop:${layer.id}:${Object.keys(patch).join(',')}`) =>
    onUpdate(layer.id, patch, key);
  /**
   * A control with its keyframe button beside it (video), or alone (photos).
   * @param control the control
   * @param props the values the button keys
   * @param label the values' name
   * @returns the row
   */
  const keyed = (control: ReactNode, props: LayerKeyProp[], label: string) =>
    keyframes ? (
      <div className="kf-row">
        {control}
        {keyframes(props, label)}
      </div>
    ) : (
      control
    );
  // 503: the layer's name stays above; its own settings, placement, mask and timing fold, one open at a time.
  return (
    <div className="lp-props">
      <p className="hint ig-name">{layerName(layer)}</p>
      {layer.kind === 'draw' && (
        <p className="hint">
          A drawing. Move, resize or turn it like any layer; with the Draw tool, new strokes go into it while it is
          selected and not turned.
        </p>
      )}
      {layer.kind === 'text' && (
        <FoldSection id="layer.text" title="Text">
          <TextProps layer={layer} update={update} />
        </FoldSection>
      )}
      {layer.kind === 'shape' && (
        <FoldSection id="layer.shape" title="Shape">
          <ShapeProps layer={layer} update={update} />
        </FoldSection>
      )}
      <FoldSection id="layer.place" title="Position and size" actions={keyNav}>
        <PlaceProps layer={layer} update={update} onUpdate={onUpdate} keyed={keyed} hasKeys={!!keyframes} />
      </FoldSection>
      <FoldSection id="layer.mask" title="Mask" note={maskNote(layer)}>
        <LayerMaskProps layer={layer} update={update} />
      </FoldSection>
      {timing && (
        <FoldSection id="layer.timing" title="Timing">
          <LayerTiming layer={layer} duration={timing.duration} update={update} />
        </FoldSection>
      )}

      <div className="inline ig-tools">
        <button
          type="button"
          className="sbtn"
          onClick={() =>
            onAdd({
              ...layer,
              id: `${layer.id}d${Date.now().toString(36)}`,
              x: Math.min(0.95, layer.x + 0.04),
              y: Math.min(0.95, layer.y + 0.04),
            })
          }
        >
          <PlusIcon />
          Duplicate
        </button>
        <button type="button" className="sbtn" onClick={() => update({ x: 0.5, y: 0.5, rot: 0 }, '')}>
          Centre and straighten
        </button>
      </div>
    </div>
  );
}

/**
 * The Mask section's summary.
 * @param layer the layer
 * @returns "Fade", "Spot" or nothing
 */
function maskNote(layer: Layer): string | undefined {
  const part = layer.mask?.parts[0];
  if (part?.kind === 'linear') return 'Fade';
  if (part?.kind === 'radial') return 'Spot';
  return undefined;
}

/** A layer's placement and how to change it. */
interface PlacePropsProps extends LayerEditProps {
  onUpdate: LayerPanelProps['onUpdate'];
  /** A control with its keyframe button beside it (video), or alone. */
  keyed: (control: ReactNode, props: LayerKeyProp[], label: string) => ReactNode;
  /** Whether the layer can have keyframes (video). */
  hasKeys: boolean;
}

/**
 * A layer's position key (video), size, turn, opacity and blend.
 * @param props the layer, its updates, the keyframe buttons and whether they apply
 */
function PlaceProps({ layer, update, onUpdate, keyed, hasKeys }: Readonly<PlacePropsProps>) {
  return (
    <>
      {hasKeys && keyed(<span className="lp-label">Position</span>, ['x', 'y'], 'Position')}
      {keyed(
        <LpRange
          id="lp-size"
          label="Size"
          value={layer.w}
          min={0.03}
          max={2}
          show={`${Math.round(layer.w * 100)}%`}
          onChange={(width) => onUpdate(layer.id, (old) => scaleLayer(old, width / old.w), `size:${layer.id}`)}
        />,
        ['w'],
        'Size',
      )}
      {keyed(
        <LpRange
          id="lp-rot"
          label="Turn"
          value={shownTurn(layer.rot)}
          min={-180}
          max={180}
          step={1}
          show={`${Math.round(shownTurn(layer.rot))}°`}
          onChange={(turn) => update({ rot: (turn + 360) % 360 })}
        />,
        ['rot'],
        'Turn',
      )}
      {keyed(
        <LpRange
          id="lp-op"
          label="Opacity"
          value={layer.opacity}
          min={0.05}
          max={1}
          show={`${Math.round(layer.opacity * 100)}%`}
          onChange={(opacity) => update({ opacity })}
        />,
        ['opacity'],
        'Opacity',
      )}
      <div className="ig-slider">
        <label htmlFor="lp-blend">Blend</label>
        <select
          id="lp-blend"
          value={layer.blend ?? 'normal'}
          onChange={(event) => {
            const blend = event.target.value;
            if (isOneOf(BLEND_VALUES, blend)) update({ blend: blend === 'normal' ? undefined : blend }, '');
          }}
        >
          {BLEND_MODES.map(([mode, name]) => (
            <option key={mode} value={mode}>
              {name}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}

/** A layer on a video and the timeline length. */
interface LayerTimingProps {
  layer: Layer;
  duration: number;
  update: Update;
}

/**
 * When a layer shows on a video: appears at, disappears at (the end when at or past it).
 * @param props the layer, the timeline length and the update
 */
function LayerTiming({ layer, duration, update }: Readonly<LayerTimingProps>) {
  return (
    <>
      <LpRange
        id="lp-start"
        label="Appears at"
        value={layer.start ?? 0}
        min={0}
        max={Math.max(0.1, duration - 0.1)}
        step={0.1}
        show={formatClock(layer.start ?? 0)}
        onChange={(start) =>
          update(layer.end !== undefined && layer.end <= start ? { start, end: undefined } : { start })
        }
      />
      <LpRange
        id="lp-end"
        label="Disappears at"
        value={Math.min(layer.end ?? duration, duration)}
        min={0.1}
        max={duration}
        step={0.1}
        show={layer.end === undefined || layer.end >= duration ? 'the end' : formatClock(layer.end)}
        onChange={(end) =>
          update({ end: end >= duration - 0.05 ? undefined : Math.max(end, (layer.start ?? 0) + 0.1) })
        }
      />
    </>
  );
}

/** A layer and how to change it. */
interface LayerEditProps<Kind extends Layer = Layer> {
  layer: Kind;
  update: Update<Kind>;
}

/**
 * A new fade for a layer: across the middle, fading upwards over most of the layer.
 * @returns the part
 */
function layerFade(): MaskPart {
  const part = newPart('linear');
  return part.kind === 'linear' ? { ...part, x: 0.5, y: 0.5, angle: 90, width: 0.8 } : part;
}

/**
 * A new spot for a layer: a soft ellipse filling the layer.
 * @returns the part
 */
function layerSpot(): MaskPart {
  const part = newPart('radial');
  return part.kind === 'radial' ? { ...part, rx: 0.5, ry: 0.5, feather: 60 } : part;
}

/**
 * A layer's mask (P1.10): a fade (linear gradient) or a spot (radial gradient) placed within the layer, so it moves,
 * turns and grows with it; inverted, the layer fades the other way or shows only outside the spot.
 * @param props the layer and its update
 */
function LayerMaskProps({ layer, update }: Readonly<LayerEditProps>) {
  const mask = layer.mask;
  const part = mask?.parts[0];
  const setMask = (next: LayerMask | undefined, key = '') => update({ mask: next }, key);
  if (!mask || !part || (part.kind !== 'linear' && part.kind !== 'radial'))
    return (
      <div className="ig-newmask" role="group" aria-label="Layer mask">
        <span className="hint">Mask:</span>
        <button type="button" className="sbtn" onClick={() => setMask({ invert: false, parts: [layerFade()] })}>
          Fade
        </button>
        <button type="button" className="sbtn" onClick={() => setMask({ invert: false, parts: [layerSpot()] })}>
          Spot
        </button>
      </div>
    );
  return (
    <div className="lp-mask">
      <PartSettings
        idPrefix="lp-mask"
        inLayer
        part={part}
        onPatch={(patch, setting) =>
          setMask({ ...mask, parts: [{ ...part, ...patch }] }, `lpmask:${layer.id}:${setting}`)
        }
      />
      <div className="inline ig-tools">
        <Check checked={mask.invert} onChange={(invert) => setMask({ ...mask, invert })}>
          Invert the mask
        </Check>
        <button type="button" className="sbtn" onClick={() => setMask(undefined)}>
          Remove the mask
        </button>
      </div>
    </div>
  );
}

/**
 * A text layer's properties: words, font, size, box width, alignment, bold, italic, colours and shadow.
 * @param props the layer and its update
 */
function TextProps({ layer, update }: Readonly<LayerEditProps<TextLayer>>) {
  return (
    <>
      <label className="f" htmlFor="layer-text">
        Text
      </label>
      <textarea
        id="layer-text"
        className="lp-text"
        rows={3}
        value={layer.text}
        onChange={(event) => update({ text: event.target.value })}
      />
      <FontPicker
        label="Font"
        value={layer.font}
        sample={layer.text || 'Your words'}
        weight={layer.bold ? 'hw' : 'bw'}
        onChange={(font) => update({ font }, '')}
      />
      <div className="lp-fonts" aria-label="Quick fonts">
        {TEXT_FONTS.slice(0, 6).map((font) => (
          <button
            key={font}
            type="button"
            className="chip"
            aria-pressed={layer.font === font}
            style={{ fontFamily: `"${font}", sans-serif` }}
            onClick={() => update({ font }, '')}
          >
            {font}
          </button>
        ))}
      </div>
      <LpRange
        id="lp-tsize"
        label="Text size"
        value={layer.size}
        min={0.02}
        max={0.3}
        step={0.002}
        show={`${Math.round(layer.size * 1080)} px`}
        onChange={(size) => update({ size })}
      />
      <LpRange
        id="lp-tw"
        label="Box width"
        value={layer.w}
        min={0.1}
        max={1}
        show={`${Math.round(layer.w * 100)}%`}
        onChange={(width) => update({ w: width })}
      />
      <div className="inline ig-tools">
        <Seg<TextLayer['align']>
          label="Alignment"
          value={layer.align}
          options={[
            ['left', 'Left'],
            ['center', 'Centre'],
            ['right', 'Right'],
          ]}
          onChange={(align) => update({ align }, '')}
        />
        <button
          type="button"
          className="sbtn"
          aria-pressed={layer.bold}
          onClick={() => update({ bold: !layer.bold }, '')}
        >
          <b>B</b> Bold
        </button>
        <button
          type="button"
          className="sbtn"
          aria-pressed={layer.italic}
          onClick={() => update({ italic: !layer.italic }, '')}
        >
          <i>I</i> Italic
        </button>
      </div>
      <span className="lp-label">Colour</span>
      <Swatches label="Text colour" value={layer.color} onChange={(color) => update({ color })} />
      <span className="lp-label">Outline</span>
      <Swatches label="Outline colour" none value={layer.outline} onChange={(outline) => update({ outline })} />
      <span className="lp-label">Background</span>
      <Swatches label="Background colour" none value={layer.bg} onChange={(bg) => update({ bg })} />
      <Check checked={layer.shadow} onChange={(shadow) => update({ shadow }, '')}>
        Shadow
      </Check>
    </>
  );
}

/**
 * A shape's properties: fill, border, height and (for shapes that hold them) words with their font, size and colour.
 * @param props the layer and its update
 */
function ShapeProps({ layer, update }: Readonly<LayerEditProps<ShapeLayer>>) {
  const holdsText = shapeDef(layer.shape).holdsText;
  return (
    <>
      <span className="lp-label">Fill</span>
      <Swatches label="Fill colour" none value={layer.fill} onChange={(fill) => update({ fill })} />
      <span className="lp-label">Border</span>
      <Swatches label="Border colour" none value={layer.stroke} onChange={(stroke) => update({ stroke })} />
      {layer.stroke && (
        <LpRange
          id="lp-sw"
          label="Border width"
          value={layer.strokeW}
          min={0.001}
          max={0.04}
          step={0.001}
          show={`${Math.round(layer.strokeW * 1080)} px`}
          onChange={(strokeW) => update({ strokeW })}
        />
      )}
      <LpRange
        id="lp-sh"
        label="Height"
        value={layer.h}
        min={0.01}
        max={1.5}
        show={`${Math.round((layer.h / layer.w) * 100)}% of the width`}
        onChange={(height) => update({ h: height })}
      />
      {holdsText && (
        <>
          <label className="f" htmlFor="layer-text">
            Words inside
          </label>
          <textarea
            id="layer-text"
            className="lp-text"
            rows={2}
            value={layer.text}
            onChange={(event) => update({ text: event.target.value })}
          />
          {layer.text && (
            <>
              <FontPicker
                label="Font"
                value={layer.font}
                sample={layer.text}
                weight={layer.bold ? 'hw' : 'bw'}
                onChange={(font) => update({ font }, '')}
              />
              <LpRange
                id="lp-stsize"
                label="Text size"
                value={layer.textSize}
                min={0.02}
                max={0.2}
                step={0.002}
                show={`${Math.round(layer.textSize * 1080)} px`}
                onChange={(textSize) => update({ textSize })}
              />
              <span className="lp-label">Text colour</span>
              <Swatches label="Text colour" value={layer.textColor} onChange={(textColor) => update({ textColor })} />
              <Check checked={layer.bold} onChange={(bold) => update({ bold }, '')}>
                Bold
              </Check>
            </>
          )}
        </>
      )}
    </>
  );
}
