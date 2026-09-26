import { useEffect, useRef, useState } from 'react';
import { FONT_CATS, FONTS, fontDef } from '../data/fonts';
import { ensureFont, installFontLinks } from '../lib/fonts';
import { toast } from '../lib/toast';
import { addUserFont, useUserFonts } from '../lib/userFonts';
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
  const mine = useUserFonts();
  const [busy, setBusy] = useState(false);
  const text = (sample.split('\n')[0] || label).slice(0, 34);

  // The closed button shows the current family in its own face; the open list previews every family.
  useEffect(() => {
    void ensureFont(value);
  }, [value]);
  useEffect(() => {
    if (!open) return;
    installFontLinks();
    const close = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  // Uploaded fonts are offered everywhere, including the handwriting-only pickers.
  const list = [...FONTS, ...mine].filter((x) => (only ? only.includes(x.n) || x.c === 'own' : cat === 'all' || x.c === cat));
  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const name = await addUserFont(file);
      onChange(name);
      setOpen(false);
      toast(`“${name}” added to your fonts. It stays on this device for every design.`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'That font couldn’t be added.');
    } finally {
      setBusy(false);
    }
  };
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
          <label className="fp-upload">
            <input
              type="file"
              hidden
              accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2"
              onChange={(e) => {
                void upload(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            {busy ? 'Adding font…' : '+ Upload your own font (TTF, OTF, WOFF)'}
          </label>
          {cat === 'own' && !mine.length && <p className="hint fp-empty">No fonts yet. Upload one and it’s kept for every design.</p>}
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
