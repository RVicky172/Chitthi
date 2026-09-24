import type { ReactNode } from 'react';

export function Seg<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(([v, l]) => (
        <button key={v} type="button" aria-pressed={v === value} onClick={() => onChange(v)}>
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
  return (
    <div className="pane">
      <h2>{title}</h2>
      {lead && <p className="lead">{lead}</p>}
      {children}
      {next && onNext && (
        <button type="button" className="btn next" onClick={onNext}>
          Next: {next}
        </button>
      )}
    </div>
  );
}
