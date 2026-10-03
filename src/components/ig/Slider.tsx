/*
 * A labelled range slider with its value shown, for the media studio's panels. Double-click resets it.
 */

export function Slider({
  id,
  label,
  value,
  min,
  max,
  step = 1,
  reset = min < 0 ? 0 : min,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  /** What a double-click sets: 0, or the minimum when 0 is out of range, unless given. */
  reset?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="ig-slider">
      <label htmlFor={id}>
        {label} <output htmlFor={id}>{step < 1 ? value.toFixed(2) : Math.round(value)}</output>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(+e.target.value)}
        onDoubleClick={() => onChange(reset)}
      />
    </div>
  );
}
