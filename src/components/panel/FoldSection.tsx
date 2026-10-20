import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ChevronIcon } from '../icons';
import { opensNow, readFolds, saveFold, toggleFold, type FoldOpen } from './foldGroups';

/*
 * Folding sections, one open per group (503): a group is one panel in one mode ("reel:audio"), one kind of inspector
 * or one print step. The open section of each group is kept in a small store, remembered on this device.
 */

/** Each group's open section, as the store holds it; a missing group has nothing remembered. */
let folds: Readonly<Record<string, FoldOpen>> | null = null;
const listeners = new Set<() => void>();

/**
 * The store's state, read from this device the first time.
 * @returns group id → open section
 */
function snapshot(): Readonly<Record<string, FoldOpen>> {
  folds ??= readFolds();
  return folds;
}

/**
 * Listens for changes to the open sections.
 * @param listener called on every change
 * @returns stops listening
 */
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Opens a section of a group (or none), and remembers it unless asked not to.
 * @param group the group's id
 * @param open the section to open, null for none, undefined to forget (the group's default shows)
 * @param remember whether to keep the choice on this device
 */
function setFold(group: string, open: FoldOpen | undefined, remember = true): void {
  const others = Object.fromEntries(Object.entries(snapshot()).filter(([key]) => key !== group));
  folds = open === undefined ? others : { ...others, [group]: open };
  if (remember && open !== undefined) saveFold(group, open);
  for (const listener of listeners) listener();
}

/**
 * Closes every section of a group ("Collapse all").
 * @param group the group's id, as given to FoldGroup
 */
export function collapseAll(group: string): void {
  setFold(group, null);
}

/** What a group tells its sections. */
interface FoldGroupInfo {
  id: string;
  allowNone: boolean;
  /** The section the group opens when nothing is remembered; else the first section that may be the default. */
  defaultOpen: string | undefined;
  /** The sections on screen that may be the default, in the order they rendered. */
  candidates: string[];
  /** The sections on screen. */
  present: Set<string>;
}

const GroupContext = createContext<FoldGroupInfo | null>(null);

/** A group of folding sections: its id, whether it may have none open, and its default section. */
export interface FoldGroupProps {
  /** Unique per panel and mode, e.g. "reel:audio", "photos:inspector:layer", "print:Photos". */
  id: string;
  /** Whether clicking the open section's title closes it, leaving none open (D-068: yes). */
  allowNone?: boolean;
  /** The section open when nothing is remembered; by default the first one. */
  defaultOpen?: string;
  children: ReactNode;
}

/**
 * Folding sections of which only one is open at a time; the open one is remembered on this device.
 * @param props the group's id, whether none may be open, its default section and its sections
 */
export function FoldGroup({ id, allowNone = true, defaultOpen, children }: Readonly<FoldGroupProps>) {
  // The lists are filled as the sections render (in document order) and emptied as they unmount. They are new for
  // each id: the shell keeps one FoldGroup while the tool changes, and the old panel's sections leave only after the
  // new ones have rendered (and picked the default).
  const lists = useMemo(() => ({ id, candidates: [] as string[], present: new Set<string>() }), [id]);
  const saved = useSyncExternalStore(subscribe, () => snapshot()[id], () => snapshot()[id]);
  // A remembered section that is not on screen (a clip of another kind, a mask type): show the default instead.
  useEffect(() => {
    if (typeof saved === 'string' && !lists.present.has(saved)) setFold(id, undefined, false);
  }, [id, saved, lists]);
  const info: FoldGroupInfo = { id, allowNone, defaultOpen, candidates: lists.candidates, present: lists.present };
  return <GroupContext.Provider value={info}>{children}</GroupContext.Provider>;
}

/*
 * Revealing a section from elsewhere (the feature finder): it opens, scrolls into view and focuses its first field.
 * The step may not be on screen yet, so the request waits for that section to mount.
 */
let pendingReveal: string | null = null;
const REVEAL = 'chitthi:reveal';
/**
 * Opens a section, scrolls it into view and focuses its first field, once it is on screen.
 * @param id the section's id
 */
export function revealSection(id: string): void {
  pendingReveal = id;
  window.dispatchEvent(new CustomEvent(REVEAL, { detail: id }));
}

/** A folding section's id, title, summary, actions and content. */
export interface FoldSectionProps {
  /** Unique across the app (the feature finder reveals sections by id). */
  id: string;
  title: ReactNode;
  /** One-line summary in the title row, e.g. "2 of 12 written", "Music · 2 tracks". */
  note?: ReactNode;
  /** False when the section should not be the group's default (it opens only when asked). */
  defaultOpen?: boolean;
  /** Controls beside the title (keyframe arrows): a button cannot hold a button. */
  actions?: ReactNode;
  /** When this turns true the section opens itself (Shift + R opens Record voice). */
  openWhen?: boolean;
  /** Called when the section closes (its title clicked, or another section opened): Record voice closes the microphone. */
  onClosed?: () => void;
  children: ReactNode;
}

/**
 * Whether a section is its group's default: the group's named default, else the first section that may be one.
 * @param group the group
 * @param id the section
 * @param eligible whether the section may be the default
 * @returns true for the default section
 */
function isDefault(group: FoldGroupInfo, id: string, eligible: boolean): boolean {
  if (group.defaultOpen !== undefined) return group.defaultOpen === id;
  if (eligible && !group.candidates.includes(id)) group.candidates.push(id);
  return group.candidates[0] === id;
}

/**
 * A titled group of settings that folds open and closed, one open per FoldGroup (503). Outside a group it is a group
 * of its own that remembers itself.
 * @param props the id, title, summary, whether it may be the default, actions, when to open itself, and the content
 */
export function FoldSection({ id, title, note, defaultOpen = true, actions, openWhen, onClosed, children }: Readonly<FoldSectionProps>) {
  const outer = useContext(GroupContext);
  const [alone] = useState<FoldGroupInfo>(() => ({ id: `sec:${id}`, allowNone: true, defaultOpen: undefined, candidates: [], present: new Set() }));
  const group = outer ?? alone;
  const { present, candidates } = group;
  const saved = useSyncExternalStore(subscribe, () => snapshot()[group.id], () => snapshot()[group.id]);
  const open = saved === undefined ? isDefault(group, id, defaultOpen) : saved === id;
  // On screen from mount to unmount. Registered in the effect, not in render: StrictMode runs the cleanup once and
  // then the effects again, in order, so the lists come back complete and in document order.
  useEffect(() => {
    present.add(id);
    if (defaultOpen && !candidates.includes(id)) candidates.push(id);
    return () => {
      present.delete(id);
      const at = candidates.indexOf(id);
      if (at >= 0) candidates.splice(at, 1);
    };
  }, [present, candidates, id, defaultOpen]);

  // openWhen: open on the rising edge only, so the user can still close it.
  const lastWant = useRef<boolean | undefined>(undefined);
  useEffect(() => {
    if (opensNow(lastWant.current, openWhen)) setFold(group.id, id);
    lastWant.current = openWhen;
  }, [openWhen, group.id, id]);

  const wasOpen = useRef(open);
  useEffect(() => {
    if (wasOpen.current && !open) onClosed?.();
    wasOpen.current = open;
  }, [open, onClosed]);

  const body = `sec-${id.replace(/[^\w-]/g, '-')}`;
  useEffect(() => {
    const reveal = () => {
      if (pendingReveal !== id) return;
      pendingReveal = null;
      setFold(group.id, id);
      // After the step has slid into place.
      setTimeout(() => {
        const element = document.getElementById(body);
        element?.closest('.sec')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
        element
          ?.querySelector<HTMLElement>('input:not([type=checkbox]):not([type=radio]), textarea, select, button')
          ?.focus({ preventScroll: true });
      }, 450);
    };
    reveal();
    window.addEventListener(REVEAL, reveal);
    return () => window.removeEventListener(REVEAL, reveal);
  }, [id, body, group.id]);

  return (
    <section className={`sec${open ? ' open' : ''}`}>
      <h3>
        <button
          type="button"
          className="sec-h"
          aria-expanded={open}
          aria-controls={body}
          onClick={() => setFold(group.id, toggleFold(open ? id : (saved ?? null), id, group.allowNone))}
        >
          <span>{title}</span>
          {note && <small>{note}</small>}
          <ChevronIcon />
        </button>
        {actions && <span className="sec-actions">{actions}</span>}
      </h3>
      <div id={body} className="sec-body" hidden={!open}>
        {children}
      </div>
    </section>
  );
}
