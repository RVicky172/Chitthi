import { useState } from 'react';
import type { keyState } from '../../engine/keyframes';
import { removeAnimation, toggleKey, type KeyProp, type KeyTarget } from '../../state/videoKeys';
import { KeyframeButton } from './KeyframeButton';
import { tell } from './timelineActions';

/* The video editor's inspector fields: a labelled slider, a number field, and a keyframe button wired to the store. */

/** A labelled slider. */
interface RangeProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  /** The value as shown next to the label. */
  show: string;
  onChange: (value: number) => void;
}

/**
 * A labelled slider with its value shown.
 * @param props its id, label, value, range, step, shown value and handler
 */
export function Range({ id, label, value, min, max, step = 0.1, show, onChange }: Readonly<RangeProps>) {
  return (
    <div className="ig-slider">
      <label htmlFor={id}>
        {label} <output htmlFor={id}>{show}</output>
      </label>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </div>
  );
}

/** A keyframe button wired to the store. */
interface KeyButtonProps {
  target: KeyTarget;
  props: KeyProp[];
  label: string;
  state: ReturnType<typeof keyState>;
  time: number;
}

/**
 * A keyframe button wired to the store (205): toggles the value(s) at the playhead; its menu removes the animation.
 * @param props what it keys, its label, its state and the playhead
 */
export function KeyButton({ target, props, label, state, time }: Readonly<KeyButtonProps>) {
  return <KeyframeButton label={label} state={state} time={time} onToggle={() => tell(toggleKey(target, props))} onRemove={() => tell(removeAnimation(target, props))} />;
}

/** A number field. */
interface NumberFieldProps {
  label: string;
  /** Shown after the field. */
  unit: string;
  min: number;
  max: number;
  /** The value shown when not typing. */
  value: number;
  /** The arrows' step; 1 when missing. */
  step?: number;
  /** Gets each valid number typed or stepped. */
  onChange: (value: number) => void;
}

/**
 * A number field that keeps what is being typed until it is a number within range, then reports it; a new value from
 * outside replaces the draft.
 * @param props its label, unit, range, value, step and handler
 */
export function NumberField({ label, unit, min, max, value, step = 1, onChange }: Readonly<NumberFieldProps>) {
  const [draft, setDraft] = useState(String(value));
  const [valueShown, setValueShown] = useState(value);
  if (value !== valueShown) {
    setValueShown(value);
    setDraft(String(value));
  }
  return (
    <label className="v-number">
      <span>{label}</span>
      <input
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          const typed = Number(event.target.value);
          if (event.target.value.trim() !== '' && Number.isFinite(typed) && typed >= min && typed <= max) onChange(typed);
        }}
        onBlur={() => setDraft(String(value))}
      />
      <span aria-hidden="true">{unit}</span>
    </label>
  );
}
