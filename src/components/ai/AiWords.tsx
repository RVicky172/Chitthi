import { useEffect, useRef, useState } from 'react';
import { AI_LANGUAGES, AI_TONES } from '../../data/aiProviders';
import { fontDef } from '../../data/fonts';
import { MONTHS } from '../../data/products';
import {
  aiReadyAsync,
  writeCaptions,
  writeMessages,
  writeWords,
  type Readiness,
  type WordsOption,
} from '../../ai/service';
import { AiError } from '../../ai/types';
import { calMonth } from '../../engine/calendarDraw';
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
  const language = AI_LANGUAGES.find((x) => x.id === lang);
  if (!language?.font || language.script === 'latin') return {};
  const design = getState().design;
  const ok = (font: string) =>
    language.script === 'deva' ? fontDef(font).c === 'ind' : fontDef(font).n === language.font;
  return {
    ...(ok(design.headFont) ? {} : { headFont: language.font }),
    ...(ok(design.quoteFont) ? {} : { quoteFont: language.font }),
  };
}

export default function AiWords({ mode }: { mode: WordsMode }) {
  const design = useApp((state) => state.design),
    photos = useApp((state) => state.photos);
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
    const controller = new AbortController();
    ctl.current = controller;
    setBusy(true);
    setErr('');
    try {
      const ask = { language: pref.language, tone: pref.tone, notes: notes.trim() || undefined };
      if (mode === 'card') setCards(await writeWords(design, ask, controller.signal));
      else if (mode === 'message') setMsgs(await writeMessages(design, ask, controller.signal));
      else setCaps(await writeCaptions(design, photos, ask, controller.signal));
    } catch (error) {
      if (!(error instanceof AiError && error.kind === 'cancelled'))
        setErr(error instanceof Error ? error.message : 'Something went wrong. Try again.');
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

  const apply = (option: Partial<WordsOption>) =>
    setDesign({
      ...(option.greeting !== undefined ? { heading: option.greeting, showHeading: true } : {}),
      ...(option.quote !== undefined ? { quote: option.quote, showQuote: true } : {}),
      ...(option.signature !== undefined ? { sig: option.signature, showSig: true } : {}),
      ...fontsForLanguage(pref.language),
    });

  return (
    <div className="aiw">
      <div className="row">
        <label className="f">
          Language
          <select value={pref.language} onChange={(event) => setPref({ ...pref, language: event.target.value })}>
            {AI_LANGUAGES.map((language) => (
              <option key={language.id} value={language.id}>
                {language.name}
              </option>
            ))}
          </select>
        </label>
        <label className="f">
          Tone
          <select value={pref.tone} onChange={(event) => setPref({ ...pref, tone: event.target.value })}>
            {AI_TONES.map((tone) => (
              <option key={tone} value={tone}>
                {tone[0].toUpperCase() + tone.slice(1)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="f">
        Anything to mention (optional)
        <input
          type="text"
          placeholder={
            mode === 'captions'
              ? 'e.g. our family’s first year in Pune'
              : 'e.g. Nani’s 80th, first Diwali in the new house'
          }
          value={notes}
          maxLength={200}
          onChange={(event) => setNotes(event.target.value)}
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
          {cards.map((option, index) => (
            <li key={index}>
              <b>{option.greeting}</b>
              <span>{option.quote}</span>
              <small>{option.signature}</small>
              <div className="inline">
                <button type="button" className="btn" onClick={() => apply(option)}>
                  Use all
                </button>
                <button type="button" className="linkbtn" onClick={() => apply({ greeting: option.greeting })}>
                  Greeting
                </button>
                <button type="button" className="linkbtn" onClick={() => apply({ quote: option.quote })}>
                  Quote
                </button>
                <button type="button" className="linkbtn" onClick={() => apply({ signature: option.signature })}>
                  Signature
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {mode === 'message' && msgs.length > 0 && (
        <ul className="aiopts">
          {msgs.map((message, index) => (
            <li key={index}>
              <span style={{ whiteSpace: 'pre-line' }}>{message}</span>
              <button type="button" className="btn" onClick={() => setBack({ message: message })}>
                Use this message
              </button>
            </li>
          ))}
        </ul>
      )}

      {mode === 'captions' && caps.length > 0 && (
        <div className="aicaps">
          <ol>
            {caps.map((caption, index) => (
              <li key={index}>
                <b>{MONTHS[caption.month].slice(0, 3)}</b>
                <input
                  type="text"
                  aria-label={`${MONTHS[caption.month]} caption`}
                  value={caption.caption}
                  onChange={(event) =>
                    setCaps(caps.map((x, other) => (other === index ? { ...x, caption: event.target.value } : x)))
                  }
                />
                <small className="hint">was: {design.cal.captions[caption.month] || '—'}</small>
              </li>
            ))}
          </ol>
          <button
            type="button"
            className="btn primary"
            onClick={() =>
              setDesign((cur) => {
                const captions = [...cur.cal.captions];
                for (const caption of caps) captions[caption.month] = caption.caption;
                return {
                  cal: { ...cur.cal, captions, text: cur.cal.text === 'off' ? 'caption' : cur.cal.text },
                  ...fontsForLanguage(pref.language),
                };
              })
            }
          >
            Use these captions
          </button>
          <p className="hint">{calMonth(design, 0).year} · Undo brings back the old captions.</p>
        </div>
      )}
    </div>
  );
}
