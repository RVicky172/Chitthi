import type { ReactNode } from 'react';

/** The top of a panel: what it is, a sentence about it, and actions for the whole panel. */
export interface PanelHeaderProps {
  /** Small label above the title: "Step 1 of 6", "Add", "Edit". */
  eyebrow?: string;
  title: string;
  /** One short sentence under the title. */
  lead?: ReactNode;
  /** Right-aligned actions on the eyebrow line (Collapse all). */
  actions?: ReactNode;
}

/**
 * The top of a panel in either studio: eyebrow and actions on one line, the title, then the lead.
 * @param props the eyebrow, title, lead and actions
 */
export function PanelHeader({ eyebrow, title, lead, actions }: Readonly<PanelHeaderProps>) {
  const hasTop = Boolean(eyebrow) || actions != null;
  return (
    <header className="panel-head">
      {hasTop && (
        <div className="panel-head-top">
          {eyebrow && <p className="panel-eyebrow">{eyebrow}</p>}
          {actions && <span className="panel-actions">{actions}</span>}
        </div>
      )}
      <h2>{title}</h2>
      {lead && <p className="panel-lead">{lead}</p>}
    </header>
  );
}
