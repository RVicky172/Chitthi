// The inspector's keyframe controls (205 §7, AC-6): a diamond beside each animatable value, and previous / next
// keyframe buttons for the selected clip or layer.
import { fmtTime } from '../../engine/video';
import { NextIcon, PrevIcon } from '../icons';
import { MoreMenu } from '../MoreMenu';

/** Not animated, at a keyframe, or animated between keyframes (keyState). */
export type KeyButtonState = 'none' | 'key' | 'between';

/** The diamond: empty when not animated, filled at a keyframe, half filled between keyframes. */
function Diamond({ state }: { state: KeyButtonState }) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
      {state === 'between' && <path d="M8 2 L2 8 L8 14 Z" fill="currentColor" />}
      <path d="M8 2 L14 8 L8 14 L2 8 Z" fill={state === 'key' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * A value's keyframe button: pressing it starts animating the value with a keyframe at the playhead, adds one there,
 * or removes the one there; its menu (when animated) removes the animation, keeping the value at the playhead.
 * @param label the value's name, as its field shows it ("X", "Opacity", "Clip sound")
 * @param state the value's state at the playhead
 * @param time the playhead, timeline seconds (spoken in the button's name)
 * @param onToggle adds or removes the keyframe at the playhead
 * @param onRemove Remove animation
 */
export function KeyframeButton({ label, state, time, onToggle, onRemove }: { label: string; state: KeyButtonState; time: number; onToggle: () => void; onRemove: () => void }) {
  const at = fmtTime(time);
  const name =
    state === 'none' ? `${label}: animate, with a keyframe at ${at}` : state === 'key' ? `${label}: keyframe at ${at}, press to remove` : `${label}: animated, add a keyframe at ${at}`;
  return (
    <span className="kf">
      <button type="button" className={`kf-btn kf-${state}`} aria-pressed={state === 'key'} aria-label={name} title={name} onClick={onToggle}>
        <Diamond state={state} />
      </button>
      {state !== 'none' && <MoreMenu className="kf-menu" label={`${label} animation`} items={[{ key: 'remove', label: 'Remove animation', onSelect: onRemove }]} />}
    </span>
  );
}

/**
 * Previous / next keyframe buttons: they move the playhead to the selected clip's or layer's keyframes.
 * @param what the item's name for the buttons' names ("clip", "layer")
 * @param previous the previous keyframe's timeline time, or null
 * @param next the next keyframe's timeline time, or null
 * @param onSeek moves the playhead
 */
export function KeyframeNav({ what, previous, next, onSeek }: { what: string; previous: number | null; next: number | null; onSeek: (t: number) => void }) {
  return (
    <span className="kf-nav" role="group" aria-label={`Keyframes of the ${what}`}>
      <button type="button" className="kf-btn" disabled={previous === null} aria-label={`Previous keyframe of the ${what}`} title="Previous keyframe (Alt + [)" onClick={() => previous !== null && onSeek(previous)}>
        <PrevIcon />
      </button>
      <button type="button" className="kf-btn" disabled={next === null} aria-label={`Next keyframe of the ${what}`} title="Next keyframe (Alt + ])" onClick={() => next !== null && onSeek(next)}>
        <NextIcon />
      </button>
    </span>
  );
}
