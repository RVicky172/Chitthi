import { useEffect, useRef, useState } from 'react';
import { FONT_CATS, FONTS, fontDef } from '../data/fonts';
import { ensureFont } from '../lib/fonts';
import type { FontCat } from '../types';

interface Props {
  label: string;
  value: string;
  sample: string;
  weight: 'hw' | 'bw';
  onChange: (n: string) => void;
  only?: string[];
}

/** Font chooser that previews the user's own words in every family. */
export function FontPicker({ label, value, sample, weight, onChange, only }: Props) {
  const [open, setOpen] = useState(false);
  const [cat, setCat] = useState<'all' | FontCat>('all');
  const root = useRef<HTMLDivElement>(null);
  const f = fontDef(value);
  const text = (sample.split('\n')[0] || label).slice(0, 34);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const list = FONTS.filter((x) => (only ? only.includes(x.n) : cat === 'all' || x.c === cat));
  return (
    <div
      className="fp"
      ref={root}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setOpen(false);
      }}
    >
      <button type="button" className="fp-btn" aria-expanded={open} onClick={() => setOpen(!open)}>
        <small>{label}</small>
        <span style={{ fontFamily: `"${f.n}", "Baloo 2", sans-serif`, fontWeight: f[weight] }}>
          {f.n}
          {f.note ? ` (${f.note})` : ''}
        </span>
      </button>
      {open && (
        <div className="fp-pop">
          {!only && (
            <div className="fp-cats">
              {(Object.keys(FONT_CATS) as ('all' | FontCat)[]).map((k) => (
                <button key={k} type="button" aria-pressed={k === cat} onClick={() => setCat(k)}>
                  {FONT_CATS[k]}
                </button>
              ))}
            </div>
          )}
          <div className="fp-list" role="listbox" aria-label={label}>
            {list.map((x) => (
              <button
                key={x.n}
                type="button"
                role="option"
                aria-selected={x.n === value}
                onClick={() => {
                  onChange(x.n);
                  setOpen(false);
                  void ensureFont(x.n);
                }}
              >
                <small>
                  {x.n}
                  {x.note ? ` · ${x.note}` : ''}
                </small>
                <span style={{ fontFamily: `"${x.n}", "Baloo 2", sans-serif`, fontWeight: x[weight] }}>{text}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
