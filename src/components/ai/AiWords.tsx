import { useEffect, useRef, useState } from 'react';
import { AI_LANGUAGES, AI_TONES } from '../../data/aiProviders';
import { fontDef } from '../../data/fonts';
import { MONTHS } from '../../data/products';
import { aiReadyAsync, writeCaptions, writeMessages, writeWords, type Readiness, type WordsOption } from '../../ai/service';
import { AiError } from '../../ai/types';
import { calMonth } from '../../engine/render';
import { getState, setBack, setDesign, setUI, useApp } from '../../state/store';

/*
 * "Write with AI": suggestions for the card's words (greeting, quote, signature), a calendar's month captions, or the
 * message on the back. Nothing changes until a suggestion is picked, and picking goes through setDesign, so Undo
 * works. Loaded on demand (the button that opens it lives in AiEntry.tsx).
 */

export type WordsMode = 'card' | 'captions' | 'message';

const PREF = 'chitthi-ai-words';
const loadPref = (): { language: string; tone: string } => {
  try {
    return { language: 'en', tone: 'warm', ...JSON.parse(localStorage.getItem(PREF) ?? '{}') };
  } catch {
    return { language: 'en', tone: 'warm' };
  }
};

/** When the chosen language needs a script the current fonts lack, switch to a font that has it. */
function fontsForLanguage(lang: string): Partial<{ headFont: string; quoteFont: string }> {
  const l = AI_LANGUAGES.find((x) => x.id === lang);
  if (!l?.font || l.script === 'latin') return {};
  const d = getState().design;
  const ok = (f: string) => (l.script === 'deva' ? fontDef(f).c === 'ind' : fontDef(f).n === l.font);
  return { ...(ok(d.headFont) ? {} : { headFont: l.font }), ...(ok(d.quoteFont) ? {} : { quoteFont: l.font }) };
}

export default function AiWords({ mode }: { mode: WordsMode }) {
  const d = useApp((s) => s.design),
    photos = useApp((s) => s.photos);
  const [pref, setPref] = useState(loadPref);
  const [notes, setNotes] = useState('');
  const [ready, setReady] = useState<Readiness | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [cards, setCards] = useState<WordsOption[]>([]);
  const [msgs, setMsgs] = useState<string[]>([]);
  const [caps, setCaps] = useState<{ month: number; caption: string }[]>([]);
  const ctl = useRef<AbortController | null>(null);

  useEffect(() => {
    void aiReadyAsync('text').then(setReady);
    return () => ctl.current?.abort();
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(PREF, JSON.stringify(pref));
    } catch {
      /* not critical */
    }
  }, [pref]);

  const run = async () => {
    ctl.current?.abort();
    const c = new AbortController();
    ctl.current = c;
    setBusy(true);
    setErr('');
    try {
      const ask = { language: pref.language, tone: pref.tone, notes: notes.trim() || undefined };
      if (mode === 'card') setCards(await writeWords(d, ask, c.signal));
      else if (mode === 'message') setMsgs(await writeMessages(d, ask, c.signal));
      else setCaps(await writeCaptions(d, photos, ask, c.signal));
    } catch (e) {
      if (!(e instanceof AiError && e.kind === 'cancelled')) setErr(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  if (ready && !ready.ready)
    return (
      <div className="aiw">
        <p className="hint">{ready.reason}</p>
        <button type="button" className="btn" onClick={() => setUI({ settings: true })}>
          Open Settings → AI
        </button>
      </div>
    );

  const apply = (o: Partial<WordsOption>) =>
    setDesign({
      ...(o.greeting !== undefined ? { heading: o.greeting, showHeading: true } : {}),
      ...(o.quote !== undefined ? { quote: o.quote, showQuote: true } : {}),
      ...(o.signature !== undefined ? { sig: o.signature, showSig: true } : {}),
      ...fontsForLanguage(pref.language),
    });

  return (
    <div className="aiw">
      <div className="row">
        <label className="f">
          Language
          <select value={pref.language} onChange={(e) => setPref({ ...pref, language: e.target.value })}>
            {AI_LANGUAGES.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <label className="f">
          Tone
          <select value={pref.tone} onChange={(e) => setPref({ ...pref, tone: e.target.value })}>
            {AI_TONES.map((t) => (
              <option key={t} value={t}>
                {t[0].toUpperCase() + t.slice(1)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="f">
        Anything to mention (optional)
        <input
          type="text"
          placeholder={mode === 'captions' ? 'e.g. our family’s first year in Pune' : 'e.g. Nani’s 80th, first Diwali in the new house'}
          value={notes}
          maxLength={200}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      <div className="inline">
        <button type="button" className="btn primary" disabled={busy} onClick={() => void run()}>
          {busy ? 'Writing…' : mode === 'captions' ? 'Write the month captions' : 'Suggest'}
        </button>
        {busy && (
          <button type="button" className="btn ghost" onClick={() => ctl.current?.abort()}>
            Cancel
          </button>
        )}
        {ready?.providerName && (
          <small className="hint">
            {ready.providerName} · {ready.model}
          </small>
        )}
      </div>
      {err && (
        <p className="hint bad" role="alert">
          {err}
        </p>
      )}

      {mode === 'card' && cards.length > 0 && (
        <ul className="aiopts">
          {cards.map((o, i) => (
            <li key={i}>
              <b>{o.greeting}</b>
              <span>{o.quote}</span>
              <small>{o.signature}</small>
              <div className="inline">
                <button type="button" className="btn" onClick={() => apply(o)}>
                  Use all
                </button>
                <button type="button" className="linkbtn" onClick={() => apply({ greeting: o.greeting })}>
                  Greeting
                </button>
                <button type="button" className="linkbtn" onClick={() => apply({ quote: o.quote })}>
                  Quote
                </button>
                <button type="button" className="linkbtn" onClick={() => apply({ signature: o.signature })}>
                  Signature
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {mode === 'message' && msgs.length > 0 && (
        <ul className="aiopts">
          {msgs.map((m, i) => (
            <li key={i}>
              <span style={{ whiteSpace: 'pre-line' }}>{m}</span>
              <button type="button" className="btn" onClick={() => setBack({ message: m })}>
                Use this message
              </button>
            </li>
          ))}
        </ul>
      )}

      {mode === 'captions' && caps.length > 0 && (
        <div className="aicaps">
          <ol>
            {caps.map((c, i) => (
              <li key={i}>
                <b>{MONTHS[c.month].slice(0, 3)}</b>
                <input
                  type="text"
                  aria-label={`${MONTHS[c.month]} caption`}
                  value={c.caption}
                  onChange={(e) => setCaps(caps.map((x, j) => (j === i ? { ...x, caption: e.target.value } : x)))}
                />
                <small className="hint">was: {d.cal.captions[c.month] || '—'}</small>
              </li>
            ))}
          </ol>
          <button
            type="button"
            className="btn primary"
            onClick={() =>
              setDesign((cur) => {
                const captions = [...cur.cal.captions];
                for (const c of caps) captions[c.month] = c.caption;
                return { cal: { ...cur.cal, captions, text: cur.cal.text === 'off' ? 'caption' : cur.cal.text }, ...fontsForLanguage(pref.language) };
              })
            }
          >
            Use these captions
          </button>
          <p className="hint">
            {calMonth(d, 0).year} · Undo brings back the old captions.
          </p>
        </div>
      )}
    </div>
  );
}
