import { useEffect, useRef, type ReactNode } from 'react';
import { CloseIcon } from '../icons';

/** A modal sheet for the studio (the export panel): native <dialog>, so focus stays inside and Escape closes it. */
export function StudioDialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="mst-dialog"
      aria-label={title}
      onClose={onClose}
      onClick={(e) => {
        // A click on the backdrop (outside the sheet) closes it.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="mst-dialog-body">
        <header>
          <h2>{title}</h2>
          <button type="button" className="btn icon ghost" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </header>
        {open && children}
      </div>
    </dialog>
  );
}
