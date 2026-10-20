import type { ReactNode } from 'react';

/** What an empty stage or panel shows: what goes here and how to start. */
export interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  /** One or two sentences under the title. */
  children?: ReactNode;
  /** The way to start (a button), and anything that goes with it. */
  action?: ReactNode;
  /** On the dark stage (the default) or inside a panel. */
  tone?: 'stage' | 'panel';
}

/**
 * The empty state of a stage or a panel: an icon, a title, a sentence or two and the action that fills it.
 * @param props the icon, title, text, action and tone
 */
export function EmptyState({ icon, title, children, action, tone = 'stage' }: Readonly<EmptyStateProps>) {
  return (
    <div className={`empty-state empty-${tone}`}>
      {icon}
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}
