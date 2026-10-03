import { useState } from 'react';
import { HSL_BANDS, type ColourMixer as Mixer } from '../../engine/hsl';
import { Seg } from '../common';

/*
 * The colour mixer panel (P1.2): hue, saturation or luminance for eight colour bands, one slider each. Double-click a
 * slider to reset it. The bands' colours are shown beside their names.
 */

type Part = keyof Mixer;
const PARTS: [Part, string][] = [
  ['hue', 'Hue'],
  ['sat', 'Saturation'],
  ['lum', 'Luminance'],
];
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

export function ColourMixer({
  mixer,
  onChange,
  idPrefix,
}: {
  mixer: Mixer;
  onChange: (m: Mixer) => void;
  idPrefix: string;
}) {
  const [part, setPart] = useState<Part>('hue');
  const values = mixer[part];
  const set = (i: number, v: number) => onChange({ ...mixer, [part]: values.map((x, k) => (k === i ? v : x)) });
  const any = values.some((v) => v !== 0);
  return (
    <div className="mixer">
      <Seg<Part> label="Colour mixer setting" value={part} options={PARTS} onChange={setPart} />
      {HSL_BANDS.map((band, i) => {
        const [name, colour] = NAMES[band],
          id = `${idPrefix}-${part}-${band}`;
        return (
          <div key={band} className="ig-slider">
            <label htmlFor={id}>
              <span>
                <i className="mixer-dot" style={{ background: colour }} aria-hidden="true" />
                {name}
              </span>
              <output htmlFor={id}>{Math.round(values[i])}</output>
            </label>
            <input
              id={id}
              type="range"
              min={-100}
              max={100}
              step={1}
              value={values[i]}
              onChange={(e) => set(i, +e.target.value)}
              onDoubleClick={() => set(i, 0)}
            />
          </div>
        );
      })}
      <button
        type="button"
        className="sbtn"
        disabled={!any}
        onClick={() => onChange({ ...mixer, [part]: values.map(() => 0) })}
      >
        Reset {PARTS.find(([p]) => p === part)![1].toLowerCase()}
      </button>
    </div>
  );
}
