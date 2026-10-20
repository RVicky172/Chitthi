/*
 * The rail's width (501 §6): wide (icon and label) by default, narrow (icon only) once the user chooses it. The choice
 * is kept per device and shared by both studios.
 */

/** Wide shows labels and group headings; narrow shows icons only. */
export type RailWidth = 'wide' | 'narrow';

/** Where the choice is kept. */
export const RAIL_KEY = 'chitthi-rail';

/** The part of `localStorage` the choice uses. */
type RailStorage = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * The rail's width from what was saved.
 * @param saved the stored value, whatever it is
 * @returns narrow only when narrow was saved, else wide
 */
export function railWidth(saved: unknown): RailWidth {
  return saved === 'narrow' ? 'narrow' : 'wide';
}

/**
 * The width this device chose.
 * @param storage where it is kept (localStorage by default)
 * @returns the width; wide when nothing (or nothing readable) is saved
 */
export function readRailWidth(storage?: RailStorage): RailWidth {
  try {
    return railWidth((storage ?? localStorage).getItem(RAIL_KEY));
  } catch {
    return 'wide';
  }
}

/**
 * Keeps the chosen width on this device.
 * @param width the width
 * @param storage where to keep it (localStorage by default)
 */
export function saveRailWidth(width: RailWidth, storage?: RailStorage): void {
  try {
    (storage ?? localStorage).setItem(RAIL_KEY, width);
  } catch {
    /* storage blocked: the rail still switches, it just isn't remembered */
  }
}
