/*
 * Folding sections, one open per group (503 §1, §2): which section a group shows, and remembering it per panel and
 * mode on this device. Framework-free, so the rules are tested without React.
 */

/** A group's open section, or null for none. */
export type FoldOpen = string | null;

/** Where each group's open section is kept. */
export const FOLDS_KEY = 'chitthi-folds';
/** Before 503 each section folded on its own and was kept here; it means nothing under one-open. */
const OLD_KEY = 'chitthi-sections';

/** The part of `localStorage` the folds use. */
type FoldStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/**
 * The open section after the user clicks a section's title.
 * @param open the section open now, or null
 * @param id the section clicked
 * @param allowNone whether the group may have none open
 * @returns the clicked section, or null when it was open and the group allows none
 */
export function toggleFold(open: FoldOpen, id: string, allowNone: boolean): FoldOpen {
  if (open !== id) return id;
  return allowNone ? null : id;
}

/**
 * The section a group shows when it opens.
 * @param saved what was remembered for the group (undefined for nothing)
 * @param present the ids of the sections on screen
 * @param fallback the group's default section
 * @returns the saved section when it is on screen or a saved "none", else the default
 */
export function resolveFold(saved: FoldOpen | undefined, present: readonly string[], fallback: FoldOpen): FoldOpen {
  if (saved === null) return null;
  if (saved !== undefined && present.includes(saved)) return saved;
  return fallback;
}

/**
 * Whether a section asking to open itself (`openWhen`) should open now: only when the need appears.
 * @param previous the value on the last render
 * @param now the value now
 * @returns true on false → true
 */
export function opensNow(previous: boolean | undefined, now: boolean | undefined): boolean {
  return now === true && previous !== true;
}

/**
 * Every group's remembered section on this device.
 * @param storage where they are kept (localStorage by default)
 * @returns group id → open section or null; empty when nothing (readable) is saved
 */
export function readFolds(storage?: FoldStorage): Record<string, FoldOpen> {
  try {
    const parsed: unknown = JSON.parse((storage ?? localStorage).getItem(FOLDS_KEY) ?? '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const folds: Record<string, FoldOpen> = {};
    for (const [group, open] of Object.entries(parsed as Record<string, unknown>)) if (open === null || typeof open === 'string') folds[group] = open;
    return folds;
  } catch {
    return {};
  }
}

/**
 * Remembers a group's open section on this device, and drops the per-section folds kept before 503.
 * @param group the group's id, e.g. "reel:audio"
 * @param open its open section, or null
 * @param storage where to keep it (localStorage by default)
 */
export function saveFold(group: string, open: FoldOpen, storage?: FoldStorage): void {
  try {
    const store = storage ?? localStorage;
    store.setItem(FOLDS_KEY, JSON.stringify({ ...readFolds(store), [group]: open }));
    store.removeItem(OLD_KEY);
  } catch {
    /* storage blocked: the section still opens, it just isn't remembered */
  }
}
