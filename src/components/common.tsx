import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { ArrowIcon, ChevronIcon } from './icons';

/** Small label shown above each pane title, e.g. "Step 2 of 7". */
export const StepLabel = createContext<string | null>(null);

export function Seg<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  /** [value, label] or [value, label, icon] */
  options: [T, string, ReactNode?][];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(([v, l, icon]) => (
        <button key={v} type="button" aria-pressed={v === value} title={icon ? l : undefined} onClick={() => onChange(v)}>
          {icon}
          <span className="seg-l">{l}</span>
        </button>
      ))}
    </div>
  );
}

export function Check({
  checked,
  onChange,
  children,
  id,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
  id?: string;
}) {
  return (
    <label className="check" id={id}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /> {children}
    </label>
  );
}

export function Pane({
  title,
  lead,
  children,
  next,
  onNext,
}: {
  title: string;
  lead?: string;
  children: ReactNode;
  next?: string;
  onNext?: () => void;
}) {
  const step = useContext(StepLabel);
  return (
    <div className="pane">
      <div className="pane-top">
        {step && <p className="eyebrow">{step}</p>}
        <span className="pane-fold">
          <button type="button" className="linkbtn" onClick={() => foldAll(title, false)}>
            Collapse all
          </button>
          <span aria-hidden="true">·</span>
          <button type="button" className="linkbtn" onClick={() => foldAll(title, true)}>
            Expand all
          </button>
        </span>
      </div>
      <h2>{title}</h2>
      {lead && <p className="lead">{lead}</p>}
      <SectionScope.Provider value={title}>{children}</SectionScope.Provider>
      {next && onNext && (
        <button type="button" className="btn next" onClick={onNext}>
          Next: {next}
          <ArrowIcon />
        </button>
      )}
    </div>
  );
}

/* ---------- collapsible sections ---------- */

/** The pane a section belongs to (its title): "Collapse all" in that pane folds only its sections. */
const SectionScope = createContext('');
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
const foldAll = (scope: string, open: boolean) => window.dispatchEvent(new CustomEvent(EVT, { detail: { scope, open } }));

/*
 * Revealing a section from elsewhere (the feature finder): it opens, scrolls into view and focuses its first field.
 * The step may not be on screen yet, so the request waits for that section to mount.
 */
let pendingReveal: string | null = null;
const REVEAL = 'chitthi:reveal';
export function revealSection(id: string): void {
  pendingReveal = id;
  window.dispatchEvent(new CustomEvent(REVEAL, { detail: id }));
}

/**
 * A titled group of settings that folds open and closed. Each one remembers its state on this device, so the steps
 * stay the way the user left them. `id` must be unique across the app.
 */
export function Section({
  id,
  title,
  note,
  defaultOpen = true,
  children,
}: {
  id: string;
  title: ReactNode;
  /** Short status shown beside the title, e.g. "2 of 12 written". */
  note?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const scope = useContext(SectionScope);
  const [open, setOpen] = useState(() => readFolds()[id] ?? defaultOpen);
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ scope: string; open: boolean }>).detail;
      if (d.scope !== scope) return;
      setOpen(d.open);
      saveFold(id, d.open);
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
        el?.querySelector<HTMLElement>('input:not([type=checkbox]):not([type=radio]), textarea, select, button')?.focus({ preventScroll: true });
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
