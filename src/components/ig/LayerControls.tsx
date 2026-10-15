// Small controls shared by the layer panel, the layer properties and the transition panel: colour swatches, a range
// slider showing its value as given, and m:ss.s times.
import { PALETTE } from '../../data/layers';

/** A colour choice from the palette, any colour, or (when offered) none. */
interface SwatchesProps {
  value: string;
  onChange: (colour: string) => void;
  /** Offer "None" (an empty value). */
  none?: boolean;
  label: string;
}

/**
 * Colour swatches: the palette, a colour input for any colour, and optionally "None".
 * @param props the colour, its change handler, whether to offer none, and the group's label
 */
export function Swatches({ value, onChange, none, label }: Readonly<SwatchesProps>) {
  return (
    <div className="lp-swatches" role="radiogroup" aria-label={label}>
      {none && (
        <button
          type="button"
          role="radio"
          aria-checked={!value}
          className="lp-sw lp-none"
          title="None"
          aria-label="None"
          onClick={() => onChange('')}
        />
      )}
      {PALETTE.map((colour) => (
        <button
          key={colour}
          type="button"
          role="radio"
          aria-checked={value.toLowerCase() === colour}
          className="lp-sw"
          style={{ background: colour }}
          title={colour}
          aria-label={colour}
          onClick={() => onChange(colour)}
        />
      ))}
      <label className="lp-sw lp-own" title="Any colour">
        <span className="vh">{label}: any colour</span>
        <input type="color" value={value || '#ffffff'} onChange={(event) => onChange(event.target.value)} />
      </label>
    </div>
  );
}

/** A labelled range with its value shown as given. */
interface RangeProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  /** The value as shown beside the label ("40%", "0:02.5"). */
  show: string;
  onChange: (value: number) => void;
}

/**
 * A labelled range slider that shows its value as given.
 * @param props the id, label, range, value, its text and change handler
 */
export function LpRange({ id, label, value, min, max, step = 0.01, show, onChange }: Readonly<RangeProps>) {
  return (
    <div className="ig-slider">
      <label htmlFor={id}>
        {label} <output htmlFor={id}>{show}</output>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(+event.target.value)}
      />
    </div>
  );
}

/**
 * Seconds as m:ss.s ("1:02.5").
 * @param seconds the time
 * @returns the text
 */
export const formatClock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4, '0')}`;
