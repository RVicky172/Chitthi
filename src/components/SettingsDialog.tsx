import { useEffect, useRef, useState } from 'react';
import {
  onPexelsKey,
  pexelsAccess,
  pexelsHidden,
  pexelsKey,
  setPexelsHidden,
  setPexelsKey,
  testPexelsKey,
  type PexelsAccess,
} from '../lib/pexels';
import { toast } from '../lib/toast';
import { addUserFont, removeUserFont, useUserFonts } from '../lib/userFonts';
import { desktop, isDesktop } from '../platform/desktop';
import { getState, setDesign, setUI, useApp } from '../state/store';
import { Check } from './common';
import { CloseIcon, TrashIcon } from './icons';

const ACCESS_TEXT: Record<PexelsAccess, [string, string]> = {
  key: ['on', 'Connected with your key'],
  server: ['on', 'Connected through this server'],
  none: ['off', 'Not connected'],
};

type Test = { kind: 'idle' | 'testing' } | { kind: 'done'; ok: boolean; msg: string };

/** App settings. Today: the Pexels API key for photo search (kept in this browser or this desktop app only). */
export function SettingsDialog() {
  const open = useApp((s) => s.ui.settings);
  const dlg = useRef<HTMLDialogElement>(null);
  const [access, setAccess] = useState<PexelsAccess | null>(null);
  const [saved, setSaved] = useState(pexelsKey);
  const [hidden, setHidden] = useState(pexelsHidden);
  const [draft, setDraft] = useState('');
  const [show, setShow] = useState(false);
  const [test, setTest] = useState<Test>({ kind: 'idle' });

  useEffect(() => {
    const el = dlg.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
  }, [open]);

  // Refresh the status whenever the dialog opens or the key changes.
  useEffect(() => {
    if (!open) return;
    const sync = () => {
      setSaved(pexelsKey());
      setHidden(pexelsHidden());
      setAccess(null);
      void pexelsAccess().then(setAccess);
    };
    sync();
    setDraft('');
    setTest({ kind: 'idle' });
    return onPexelsKey(sync);
  }, [open]);

  const save = async () => {
    const key = draft.trim();
    if (!key) return;
    setTest({ kind: 'testing' });
    const r = await testPexelsKey(key);
    if (r === 'ok' || r === 'limit') {
      setPexelsKey(key);
      setDraft('');
      setTest({
        kind: 'done',
        ok: true,
        msg: r === 'ok' ? 'Key saved. Photo search is ready.' : 'Key saved. Its search limit for this hour is used up, so results start again later.',
      });
    } else
      setTest({
        kind: 'done',
        ok: false,
        msg: r === 'refused' ? 'Pexels didn’t accept that key. Copy it again from your Pexels API page.' : 'Pexels couldn’t be reached. Check your internet connection and try again.',
      });
  };

  const [dot, label] = access ? ACCESS_TEXT[access] : ['wait', 'Checking…'];
  const masked = saved ? `${saved.slice(0, 4)}${'•'.repeat(10)}${saved.slice(-4)}` : '';
  return (
    <dialog ref={dlg} className="setdlg" aria-labelledby="setTitle" onClose={() => setUI({ settings: false })}>
      <div className="dhead">
        <h2 id="setTitle">Settings</h2>
        <button type="button" className="btn icon ghost" aria-label="Close settings" onClick={() => dlg.current?.close()}>
          <CloseIcon />
        </button>
      </div>
      <div className="setbody">
        <section aria-labelledby="setPexels">
          <h3 id="setPexels">Pexels photo search</h3>
          <p className="hint">
            Search free photos from{' '}
            <a href="https://www.pexels.com" target="_blank" rel="noopener noreferrer">
              Pexels
            </a>{' '}
            in the Photos step. Searching needs a free Pexels API key: create an account, then copy the key from{' '}
            <a href="https://www.pexels.com/api/" target="_blank" rel="noopener noreferrer">
              pexels.com/api
            </a>
            .
          </p>
          <p className={`setstatus ${dot}`} aria-live="polite">
            <i aria-hidden="true" />
            {label}
            {saved && <code>{masked}</code>}
          </p>
          <form
            className="setkey"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <label className="f">
              {saved ? 'Replace your key' : 'Your Pexels API key'}
              <span className="px-search">
                <input
                  type={show ? 'text' : 'password'}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Paste the key here"
                  value={draft}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    setTest({ kind: 'idle' });
                  }}
                />
                <button type="button" className="btn" aria-pressed={show} onClick={() => setShow((v) => !v)}>
                  {show ? 'Hide' : 'Show'}
                </button>
              </span>
            </label>
            <div className="inline">
              <button type="submit" className="btn primary" disabled={!draft.trim() || test.kind === 'testing'}>
                {test.kind === 'testing' ? 'Testing…' : 'Save and test'}
              </button>
              {saved && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setPexelsKey('');
                    setTest({ kind: 'done', ok: true, msg: 'Key removed from this device.' });
                  }}
                >
                  Remove key
                </button>
              )}
            </div>
            {test.kind === 'done' && (
              <p className={`hint ${test.ok ? 'good' : 'bad'}`} role="status">
                {test.msg}
              </p>
            )}
          </form>
          <Check
            checked={!hidden}
            onChange={(on) => {
              setPexelsHidden(!on);
              setHidden(!on);
            }}
          >
            Show Pexels search in the Photos step
          </Check>
          <ul className="tips">
            <li>
              The key is kept on this device only ({isDesktop ? 'in the Chitthi app' : 'in this browser'}), never inside the app or
              your saved designs, and it is sent only to api.pexels.com.
            </li>
            <li>A key you save here is used even when the server has one of its own.</li>
            <li>Pexels allows 200 searches an hour per key. Results are reused while the app stays open.</li>
          </ul>
        </section>
        <UserFonts />
        <section aria-labelledby="setAbout">
          <h3 id="setAbout">About</h3>
          <p className="hint">
            Chitthi{desktop ? ` ${desktop.info.version} for ${desktop.info.platform === 'darwin' ? 'macOS' : 'Windows'}` : ' in the browser'}. Your designs
            and photos stay on this device.{' '}
            <button
              type="button"
              className="linkbtn"
              onClick={() => {
                dlg.current?.close();
                setUI({ settings: false, gallery: false, screen: 'sizes' });
              }}
            >
              See every size and layout
            </button>
          </p>
        </section>
      </div>
    </dialog>
  );
}

/** Uploaded fonts: add, preview and delete. Designs using a deleted font fall back to the default. */
function UserFonts() {
  const fonts = useUserFonts();
  const [busy, setBusy] = useState(false);
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    for (const f of [...files]) {
      try {
        const name = await addUserFont(f);
        toast(`“${name}” added to your fonts.`);
      } catch (e) {
        toast(e instanceof Error ? e.message : 'That font couldn’t be added.');
      }
    }
    setBusy(false);
  };
  const remove = async (name: string) => {
    await removeUserFont(name);
    const d = getState().design;
    // Anything on the current design that used it goes back to a built-in font.
    setDesign({
      ...(d.headFont === name ? { headFont: 'Rozha One' } : {}),
      ...(d.quoteFont === name ? { quoteFont: 'Kalam' } : {}),
      ...(d.back.font === name ? { back: { ...d.back, font: 'Kalam' } } : {}),
      ...(d.cal.font === name ? { cal: { ...d.cal, font: '' } } : {}),
    });
  };
  return (
    <section aria-labelledby="setFonts">
      <h3 id="setFonts">Your fonts</h3>
      <p className="hint">
        Upload TTF, OTF, WOFF or WOFF2 fonts to use for greetings, quotes, month names and handwriting. They are kept on
        this device and appear under “Your fonts” in every font picker. Check that a font’s licence allows printing.
      </p>
      {fonts.length > 0 && (
        <ul className="uf-list">
          {fonts.map((f) => (
            <li key={f.n}>
              <span style={{ fontFamily: `"${f.n}", sans-serif` }}>{f.n}</span>
              <button type="button" className="btn icon ghost" aria-label={`Delete ${f.n}`} title="Delete" onClick={() => void remove(f.n)}>
                <TrashIcon />
              </button>
            </li>
          ))}
        </ul>
      )}
      <label className="btn">
        <input
          type="file"
          hidden
          multiple
          accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2"
          onChange={(e) => {
            void upload(e.target.files);
            e.target.value = '';
          }}
        />
        {busy ? 'Adding…' : 'Upload fonts'}
      </label>
    </section>
  );
}
