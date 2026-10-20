import { useSyncExternalStore } from 'react';

/*
 * Whether the Record voice controls are open, and for which track (209 §8). Kept apart from the recorder, which loads
 * only when they open, so a Voice track's record button (TrackHead) can open them without loading it.
 */

/** The controls' state. */
export interface RecordVoiceOpen {
  open: boolean;
  /** The track whose record button opened them, or null. */
  track: string | null;
}

/** Fired on the document when the controls open, so the workspace shows the Audio panel. */
export const OPEN_RECORD_VOICE = 'chitthi:record-voice';

let state: RecordVoiceOpen = { open: false, track: null };
const listeners = new Set<() => void>();

/**
 * Changes the state and tells the subscribers.
 * @param next the new state
 */
function set(next: RecordVoiceOpen): void {
  state = next;
  for (const listener of listeners) listener();
}

/**
 * Opens the Record voice controls.
 * @param track the track to record onto, or null for the recorder's own choice
 */
export function openRecordVoice(track: string | null = null): void {
  set({ open: true, track });
  if (typeof document !== 'undefined') document.dispatchEvent(new CustomEvent(OPEN_RECORD_VOICE));
}

/** Closes them (the microphone closes with them). */
export function closeRecordVoice(): void {
  set({ open: false, track: null });
}

/** @returns the state now */
export const recordVoiceOpen = (): RecordVoiceOpen => state;

/**
 * The state in a component.
 * @returns the state, re-rendering when it changes
 */
export function useRecordVoiceOpen(): RecordVoiceOpen {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}
