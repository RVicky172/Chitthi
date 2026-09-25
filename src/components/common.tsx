import { createContext, useContext, type ReactNode } from 'react';
import { ArrowIcon } from './icons';

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
        <button key={v} type="button" aria-pressed={v === value} onClick={() => onChange(v)}>
          {icon}
          {l}
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
      {step && <p className="eyebrow">{step}</p>}
      <h2>{title}</h2>
      {lead && <p className="lead">{lead}</p>}
      {children}
      {next && onNext && (
        <button type="button" className="btn next" onClick={onNext}>
          Next: {next}
          <ArrowIcon />
        </button>
      )}
    </div>
  );
}
