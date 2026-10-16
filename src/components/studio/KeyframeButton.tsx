// The inspector's keyframe controls (205 §7, AC-6): a diamond beside each animatable value, and previous / next
// keyframe buttons for the selected clip or layer.
import { formatTime } from '../../engine/timeline';
import { NextIcon, PrevIcon } from '../icons';
import { MoreMenu } from '../MoreMenu';

/** Not animated, at a keyframe, or animated between keyframes (keyState). */
export type KeyButtonState = 'none' | 'key' | 'between';

/** A diamond's state. */
interface DiamondProps {
  state: KeyButtonState;
}

/**
 * The diamond: empty when not animated, filled at a keyframe, half filled between keyframes.
 * @param props the value's state
 */
function Diamond({ state }: Readonly<DiamondProps>) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
      {state === 'between' && <path d="M8 2 L2 8 L8 14 Z" fill="currentColor" />}
      <path d="M8 2 L14 8 L8 14 L2 8 Z" fill={state === 'key' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

/** A value's keyframe button. */
interface KeyframeButtonProps {
  /** The value's name, as its field shows it ("X", "Opacity", "Clip sound"). */
  label: string;
  /** The value's state at the playhead. */
  state: KeyButtonState;
  /** The playhead, timeline seconds (spoken in the button's name). */
  time: number;
  /** Adds or removes the keyframe at the playhead. */
  onToggle: () => void;
  /** Remove animation. */
  onRemove: () => void;
}

/**
 * A value's keyframe button: pressing it starts animating the value with a keyframe at the playhead, adds one there,
 * or removes the one there; its menu (when animated) removes the animation, keeping the value at the playhead.
 * @param props the value's name, its state, the playhead and the actions
 */
export function KeyframeButton({ label, state, time, onToggle, onRemove }: Readonly<KeyframeButtonProps>) {
  const at = formatTime(time);
  const names: Record<KeyButtonState, string> = {
    none: `${label}: animate, with a keyframe at ${at}`,
    key: `${label}: keyframe at ${at}, press to remove`,
    between: `${label}: animated, add a keyframe at ${at}`,
  };
  const name = names[state];
  return (
    <span className="kf">
      <button type="button" className={`kf-btn kf-${state}`} aria-pressed={state === 'key'} aria-label={name} title={name} onClick={onToggle}>
        <Diamond state={state} />
      </button>
      {state !== 'none' && <MoreMenu className="kf-menu" label={`${label} animation`} items={[{ key: 'remove', label: 'Remove animation', onSelect: onRemove }]} />}
    </span>
  );
}

/** Previous / next keyframe buttons. */
interface KeyframeNavProps {
  /** The item's name for the buttons' names ("clip", "layer"). */
  what: string;
  /** The previous keyframe's timeline time, or null. */
  previous: number | null;
  /** The next keyframe's timeline time, or null. */
  next: number | null;
  /** Moves the playhead. */
  onSeek: (time: number) => void;
}

/**
 * Previous / next keyframe buttons: they move the playhead to the selected clip's or layer's keyframes.
 * @param props the item's name, the previous and next keyframes' times and seeking
 */
export function KeyframeNav({ what, previous, next, onSeek }: Readonly<KeyframeNavProps>) {
  return (
    <span className="kf-nav" role="group" aria-label={`Keyframes of the ${what}`}>
      <button type="button" className="kf-btn" disabled={previous === null} aria-label={`Previous keyframe of the ${what}`} title="Previous keyframe (Alt + [)" onClick={() => {
          if (previous !== null) onSeek(previous);
        }}>
        <PrevIcon />
      </button>
      <button type="button" className="kf-btn" disabled={next === null} aria-label={`Next keyframe of the ${what}`} title="Next keyframe (Alt + ])" onClick={() => {
          if (next !== null) onSeek(next);
        }}>
        <NextIcon />
      </button>
    </span>
  );
}
