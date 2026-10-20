/*
 * The video workspace's recording keys (209 AC-10, Q11): Shift + R records and stops (R alone is left for a later
 * tool), Esc cancels the count-in. Space plays and pauses as before, which stops a take too (the recorder follows
 * the preview).
 */

/** What a key does to the recording. */
export type RecordKey = 'toggle' | 'cancel' | null;

/**
 * What a key press does to the recording.
 * @param event the key and its modifiers
 * @param counting whether the count-in runs
 * @returns 'toggle' (record, cancel the count-in or stop), 'cancel' (the count-in), or null
 */
export function recordKeyAction(event: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'ctrlKey' | 'metaKey' | 'altKey'>, counting: boolean): RecordKey {
  if (event.key.toLowerCase() === 'r' && event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) return 'toggle';
  if (event.key === 'Escape' && counting) return 'cancel';
  return null;
}
