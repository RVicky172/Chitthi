import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronIcon } from '../icons';
import { readRailWidth, saveRailWidth, type RailWidth } from './railWidth';

/** The rail's width, for items that change with it. */
const RailWidthContext = createContext<RailWidth>('wide');

/**
 * The width of the rail around this item.
 * @returns wide or narrow
 */
export const useRailWidth = () => useContext(RailWidthContext);

/** The rail's name, its items and what sits at its foot. */
export interface RailFrameProps {
  /** The rail's accessible name ("Steps", "Tools"). */
  label: string;
  /** Classes the studio lays the rail out with. */
  className: string;
  children: ReactNode;
  /** Above the toggle at the foot, e.g. Gallery in the print studio. */
  foot?: ReactNode;
}

/**
 * Whether a key press is typing in a field, where Ctrl + \ must not switch the rail.
 * @param target the event's target
 * @returns true for text fields, selects and editable elements
 */
const typingIn = (target: EventTarget | null) =>
  target instanceof HTMLElement && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable);

/**
 * The studios' rail (501 §6): wide (icon and label) or narrow (icon only), switched by the button at its foot or
 * Ctrl + \, and remembered on this device for both studios. It sets `--rail-w` on the studio's grid (its parent).
 * Narrow hides the items' `.rail-label` visually; it stays their accessible name.
 * @param props the rail's name, classes, items and foot
 */
export function RailFrame({ label, className, children, foot }: Readonly<RailFrameProps>) {
  const [width, setWidth] = useState<RailWidth>(readRailWidth);
  const navRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const grid = navRef.current?.parentElement;
    grid?.style.setProperty('--rail-w', `var(--rail-w-${width})`);
    return () => {
      grid?.style.removeProperty('--rail-w');
    };
  }, [width]);
  const choose = (next: RailWidth) => {
    setWidth(next);
    saveRailWidth(next);
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '\\' || !(event.ctrlKey || event.metaKey) || event.altKey || typingIn(event.target)) return;
      event.preventDefault();
      setWidth((current) => {
        const next = current === 'wide' ? 'narrow' : 'wide';
        saveRailWidth(next);
        return next;
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const isNarrow = width === 'narrow';
  return (
    <nav ref={navRef} className={`${className} rail-frame rail-${width}`} aria-label={label}>
      <RailWidthContext.Provider value={width}>{children}</RailWidthContext.Provider>
      <div className="rail-foot">
        {foot}
        <button
          type="button"
          className="rail-toggle"
          aria-pressed={isNarrow}
          aria-keyshortcuts="Control+Backslash"
          title="Compact rail (Ctrl+\)"
          onClick={() => choose(isNarrow ? 'wide' : 'narrow')}
        >
          <ChevronIcon />
          <span className="rail-label">Compact rail</span>
        </button>
      </div>
    </nav>
  );
}
