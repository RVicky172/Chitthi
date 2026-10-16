import { useState } from 'react';
import { HSL_BANDS, type ColourMixer as Mixer } from '../../engine/hsl';
import { Seg } from '../common';

/*
 * The colour mixer panel (P1.2): hue, saturation or luminance for eight colour bands, one slider each. Double-click a
 * slider to reset it. The bands' colours are shown beside their names.
 */

type Part = keyof Mixer;
const PART_NAMES: Record<Part, string> = { hue: 'Hue', sat: 'Saturation', lum: 'Luminance' };
const PART_ORDER: Part[] = ['hue', 'sat', 'lum'];
const PARTS: [Part, string][] = PART_ORDER.map((part) => [part, PART_NAMES[part]]);
const NAMES: Record<(typeof HSL_BANDS)[number], [string, string]> = {
  red: ['Red', '#e0453a'],
  orange: ['Orange', '#ee8a2c'],
  yellow: ['Yellow', '#e8c823'],
  green: ['Green', '#3fa34d'],
  aqua: ['Aqua', '#2fb5b5'],
  blue: ['Blue', '#3a6fd8'],
  purple: ['Purple', '#8a4fd0'],
  magenta: ['Magenta', '#d34fb4'],
};

/** The mixer's values and where changes go. */
interface ColourMixerProps {
  mixer: Mixer;
  onChange: (mixer: Mixer) => void;
  /** Prefix for the sliders' ids, unique on the page. */
  idPrefix: string;
}

/**
 * The colour mixer: one setting (hue, saturation or luminance) at a time, a slider per colour band, and a reset for
 * the setting shown.
 * @param props the mixer, its change handler and the id prefix
 */
export function ColourMixer({ mixer, onChange, idPrefix }: Readonly<ColourMixerProps>) {
  const [part, setPart] = useState<Part>('hue');
  const values = mixer[part];
  const setBand = (bandIndex: number, value: number) =>
    onChange({ ...mixer, [part]: values.map((old, index) => (index === bandIndex ? value : old)) });
  const anyMoved = values.some((value) => value !== 0);
  return (
    <div className="mixer">
      <Seg<Part> label="Colour mixer setting" value={part} options={PARTS} onChange={setPart} />
      {HSL_BANDS.map((band, bandIndex) => {
        const [name, colour] = NAMES[band],
          id = `${idPrefix}-${part}-${band}`,
          value = values[bandIndex] ?? 0;
        return (
          <div key={band} className="ig-slider">
            <label htmlFor={id}>
              <span>
                <i className="mixer-dot" style={{ background: colour }} aria-hidden="true" />
                {name}
              </span>
              <output htmlFor={id}>{Math.round(value)}</output>
            </label>
            <input
              id={id}
              type="range"
              min={-100}
              max={100}
              step={1}
              value={value}
              onChange={(event) => setBand(bandIndex, +event.target.value)}
              onDoubleClick={() => setBand(bandIndex, 0)}
            />
          </div>
        );
      })}
      <button
        type="button"
        className="sbtn"
        disabled={!anyMoved}
        onClick={() => onChange({ ...mixer, [part]: values.map(() => 0) })}
      >
        Reset {PART_NAMES[part].toLowerCase()}
      </button>
    </div>
  );
}
