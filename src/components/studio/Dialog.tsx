import { useEffect, useRef, type ReactNode } from 'react';
import { CloseIcon } from '../icons';

/** A studio dialog. */
interface StudioDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

/**
 * A modal sheet for the studio (the export panel): native <dialog>, so focus stays inside and Escape closes it. Its
 * contents are rendered only while it is open.
 * @param props whether it is open, closing it, its title and contents
 */
export function StudioDialog({ open, onClose, title, children }: Readonly<StudioDialogProps>) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="mst-dialog"
      aria-label={title}
      onClose={onClose}
      onClick={(event) => {
        // A click on the backdrop (outside the sheet) closes it.
        if (event.target === event.currentTarget) onClose();
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
