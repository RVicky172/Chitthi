import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { ChevronIcon } from '../icons';

/** The pane a section belongs to (its title): "Collapse all" in that pane folds only its sections. */
export const FoldScope = createContext('');
const KEY = 'chitthi-sections',
  EVT = 'chitthi:fold';
function readFolds(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, boolean>;
  } catch {
    return {};
  }
}
function saveFold(id: string, open: boolean): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...readFolds(), [id]: open }));
  } catch {
    /* storage blocked: the section still toggles */
  }
}

/**
 * Opens or closes every section of one pane ("Collapse all", "Expand all").
 * @param scope the pane's title, as given to FoldScope
 * @param open true to open them
 */
export function foldAll(scope: string, open: boolean): void {
  window.dispatchEvent(new CustomEvent(EVT, { detail: { scope, open } }));
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

/** A folding section's id, title, status note and content. */
export interface FoldSectionProps {
  id: string;
  title: ReactNode;
  /** Short status shown beside the title, e.g. "2 of 12 written". */
  note?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}

/**
 * A titled group of settings that folds open and closed. Each one remembers its state on this device, so the steps
 * stay the way the user left them. `id` must be unique across the app.
 * @param props the id, title, note, whether it starts open, and the content
 */
export function FoldSection({ id, title, note, defaultOpen = true, children }: Readonly<FoldSectionProps>) {
  const scope = useContext(FoldScope);
  const [open, setOpen] = useState(() => readFolds()[id] ?? defaultOpen);
  useEffect(() => {
    const on = (event: Event) => {
      const detail = (event as CustomEvent<{ scope: string; open: boolean }>).detail;
      if (detail.scope !== scope) return;
      setOpen(detail.open);
      saveFold(id, detail.open);
    };
    window.addEventListener(EVT, on);
    return () => window.removeEventListener(EVT, on);
  }, [id, scope]);
  const body = `sec-${id.replace(/[^\w-]/g, '-')}`;
  useEffect(() => {
    const reveal = () => {
      if (pendingReveal !== id) return;
      pendingReveal = null;
      setOpen(true);
      saveFold(id, true);
      // After the step has slid into place.
      setTimeout(() => {
        const el = document.getElementById(body);
        el?.closest('.sec')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
        el?.querySelector<HTMLElement>('input:not([type=checkbox]):not([type=radio]), textarea, select, button')?.focus(
          { preventScroll: true },
        );
      }, 450);
    };
    reveal();
    window.addEventListener(REVEAL, reveal);
    return () => window.removeEventListener(REVEAL, reveal);
  }, [id, body]);
  return (
    <section className={`sec${open ? ' open' : ''}`}>
      <h3>
        <button
          type="button"
          className="sec-h"
          aria-expanded={open}
          aria-controls={body}
          onClick={() => {
            setOpen(!open);
            saveFold(id, !open);
          }}
        >
          <span>{title}</span>
          {note && <small>{note}</small>}
          <ChevronIcon />
        </button>
      </h3>
      <div id={body} className="sec-body" hidden={!open}>
        {children}
      </div>
    </section>
  );
}
