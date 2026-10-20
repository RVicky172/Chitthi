import { createContext, useContext, useState, type ReactNode } from 'react';
import { aiCreditOf, creditOf } from '../lib/credits';
import { ArrowIcon } from './icons';
import { FoldScope, foldAll, PanelHeader } from './panel';

/** Small label shown above each pane title, e.g. "Step 2 of 7". */
export const StepLabel = createContext<string | null>(null);

/**
 * A segmented control: one pressed button among a few options.
 * @param props the value, the options, the change handler and the group's label
 */
export function Seg<T extends string>({
  value,
  options,
  onChange,
  label,
}: Readonly<{
  value: T;
  /** [value, label] or [value, label, icon] */
  options: [T, string, ReactNode?][];
  onChange: (v: T) => void;
  label: string;
}>) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(([optionValue, optionLabel, icon]) => (
        <button
          key={optionValue}
          type="button"
          aria-pressed={optionValue === value}
          title={icon ? optionLabel : undefined}
          onClick={() => onChange(optionValue)}
        >
          {icon}
          <span className="seg-l">{optionLabel}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * A labelled checkbox.
 * @param props whether it is checked, the change handler, the label and an optional id
 */
export function Check({
  checked,
  onChange,
  children,
  id,
}: Readonly<{
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
  id?: string;
}>) {
  return (
    <label className="check" id={id}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /> {children}
    </label>
  );
}

/**
 * A print studio step: its title, a note, its sections and a Next button.
 * @param props the title, the note, the content and the next step
 */
export function Pane({
  title,
  lead,
  children,
  next,
  onNext,
}: Readonly<{
  title: string;
  lead?: string;
  children: ReactNode;
  next?: string;
  onNext?: () => void;
}>) {
  const step = useContext(StepLabel);
  return (
    <div className="pane">
      <PanelHeader
        eyebrow={step ?? undefined}
        title={title}
        lead={lead}
        actions={
          <>
            <button type="button" className="linkbtn" onClick={() => foldAll(title, false)}>
              Collapse all
            </button>
            <span aria-hidden="true">·</span>
            <button type="button" className="linkbtn" onClick={() => foldAll(title, true)}>
              Expand all
            </button>
          </>
        }
      />
      <FoldScope.Provider value={title}>{children}</FoldScope.Provider>
      {next && onNext && (
        <button type="button" className="btn next" onClick={onNext}>
          Next: {next}
          <ArrowIcon />
        </button>
      )}
    </div>
  );
}

const YEAR_MIN = 1900,
  YEAR_MAX = 2200;

/** Calendar year: type any year, or step with − and +. A half-typed year is kept locally until it's complete. */
export function YearField({
  value,
  onChange,
  label = 'Year',
}: Readonly<{
  value: number;
  onChange: (y: number) => void;
  label?: string;
}>) {
  const [draft, setDraft] = useState(String(value));
  // A new year from outside replaces the half-typed one (during render, so no frame shows the old draft).
  const [shownValue, setShownValue] = useState(value);
  if (value !== shownValue) {
    setShownValue(value);
    setDraft(String(value));
  }
  const ok = (y: number) => Number.isInteger(y) && y >= YEAR_MIN && y <= YEAR_MAX;
  const step = (by: number) => {
    const y = Math.min(YEAR_MAX, Math.max(YEAR_MIN, value + by));
    if (y !== value) onChange(y);
  };
  return (
    <label className="f">
      {label}
      <span className="yearf">
        <button type="button" aria-label="Previous year" onClick={() => step(-1)} disabled={value <= YEAR_MIN}>
          −
        </button>
        <input
          type="number"
          inputMode="numeric"
          min={YEAR_MIN}
          max={YEAR_MAX}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            const y = +event.target.value;
            if (event.target.value.length === 4 && ok(y)) onChange(y);
          }}
          onBlur={() => setDraft(String(value))}
          onKeyDown={(event) => {
            if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
              event.preventDefault();
              step(event.key === 'ArrowUp' ? 1 : -1);
            }
          }}
        />
        <button type="button" aria-label="Next year" onClick={() => step(1)} disabled={value >= YEAR_MAX}>
          +
        </button>
      </span>
    </label>
  );
}

/** "Photo by … on Pexels" for a photo that came from Pexels (linked to its Pexels page when the id is known). */
export function PhotoCredit({ name }: Readonly<{ name: string }>) {
  const credit = creditOf(name);
  if (!credit) {
    const aiCredit = aiCreditOf(name);
    return aiCredit ? <span className="credit">AI picture · {aiCredit.made}</span> : null;
  }
  return (
    <span className="credit">
      Photo by {credit.photographer} on{' '}
      {credit.url ? (
        <a href={credit.url} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()}>
          Pexels
        </a>
      ) : (
        'Pexels'
      )}
    </span>
  );
}

/**
 * How many photos a layout holds: "No photo", "1 photo", "3 photos".
 * @param count the photo slots
 * @returns the text
 */
export function photoCount(count: number): string {
  if (count === 0) return 'No photo';
  return count === 1 ? '1 photo' : `${count} photos`;
}
