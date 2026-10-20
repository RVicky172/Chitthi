import { useId, type ReactNode } from 'react';

/** One row of a panel list: what it shows and what it does. */
export interface ListRowProps {
  /** Thumbnail, icon or colour chip. */
  lead?: ReactNode;
  name: string;
  /** Second line: length, kind, "Not used". */
  detail?: ReactNode;
  /** Buttons that stay visible; they never wrap. */
  controls?: ReactNode;
  selected?: boolean;
  onSelect?: () => void;
  /** The row can't be chosen (its controls still work). */
  disabled?: boolean;
  /** Shown in place of the row's main button, e.g. a field while renaming. */
  editor?: ReactNode;
  /** Set as the main button's data-id, for list keyboard handling. */
  rowId?: string;
  /** Extra classes on the row. */
  className?: string;
}

/**
 * A row in a panel list: the main button (lead, name shortened with an ellipsis, detail line) and controls beside it.
 * The full name is the button's accessible name and tooltip; the detail line describes it.
 * @param props the row's content, state and actions
 */
export function ListRow(props: Readonly<ListRowProps>) {
  const { lead, name, detail, controls, selected, onSelect, disabled, editor, rowId, className } = props;
  const detailId = useId();
  const classes = ['list-row', selected ? 'on' : '', className ?? ''].filter(Boolean).join(' ');
  return (
    <li className={classes}>
      {editor ?? (
        <button
          type="button"
          className="list-row-main"
          data-id={rowId}
          disabled={disabled}
          aria-label={name}
          aria-describedby={detail ? detailId : undefined}
          aria-pressed={selected}
          title={name}
          onClick={onSelect}
        >
          {lead && <span className="list-row-lead">{lead}</span>}
          <span className="list-row-text">
            <strong className="list-row-name">{name}</strong>
            {detail && (
              <span id={detailId} className="list-row-detail">
                {detail}
              </span>
            )}
          </span>
        </button>
      )}
      {controls && <span className="list-row-controls">{controls}</span>}
    </li>
  );
}
