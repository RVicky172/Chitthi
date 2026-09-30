import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { MoreIcon } from './icons';

export interface MenuItem {
  key: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  /** Shown as a toggle (aria-checked). */
  checked?: boolean;
  disabled?: boolean;
  /** Extra class for the row, e.g. `mm-sm` to list it only where the inline button is hidden (see styles/32-header-nav.css). */
  className?: string;
}

/**
 * A "More" button with a small menu: where secondary header actions go when there isn't room for them inline.
 * Which rows show at which width is decided in CSS (the row's className), so the same list serves every breakpoint.
 * Closes on Escape, on a click outside, and after choosing an item; arrow keys move between rows.
 */
export function MoreMenu({ items, label = 'More', className = '', icon, text }: { items: MenuItem[]; label?: string; className?: string; icon?: ReactNode; text?: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null),
    menuId = useId();
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        box.current?.querySelector<HTMLButtonElement>('.mm-btn')?.focus();
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    // Focus the first visible row so keyboard users land in the menu.
    requestAnimationFrame(() => rows()[0]?.focus());
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  // Rows hidden by a breakpoint have no layout box; skip them for arrow keys.
  const rows = () => [...(box.current?.querySelectorAll<HTMLButtonElement>('.mm-list button:not(:disabled)') ?? [])].filter((b) => b.offsetParent);
  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const all = rows(),
      i = all.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? all.length - 1 : (i + (e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length;
    all[next]?.focus();
  };
  return (
    <div className={`mm ${className}`} ref={box}>
      <button
        type="button"
        className={`btn mm-btn${text ? '' : ' icon'}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={text ? undefined : label}
        title={label}
        onClick={() => setOpen((v) => !v)}
      >
        {icon ?? <MoreIcon />}
        {text && <span>{text}</span>}
      </button>
      {open && (
        <ul className="mm-list" id={menuId} role="menu" aria-label={label} onKeyDown={onListKey}>
          {items.map((it) => (
            <li key={it.key} role="none" className={it.className}>
              <button
                type="button"
                role={it.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
                aria-checked={it.checked}
                disabled={it.disabled}
                onClick={() => {
                  setOpen(false);
                  it.onSelect();
                }}
              >
                {it.icon}
                <span>{it.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
