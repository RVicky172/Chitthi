import { lazy, Suspense, useState } from 'react';
import type { WordsMode } from './AiWords';

/*
 * The small, always-loaded buttons that open the AI panels. The panels themselves, the AI service and the provider
 * code load only when one of these is clicked, so the app starts no bigger for people who don't use AI.
 */

const AiWords = lazy(() => import('./AiWords'));
const AiArtwork = lazy(() => import('./AiArtwork'));

const LABEL: Record<WordsMode, string> = { card: 'Write with AI', captions: 'Write captions with AI', message: 'Write the message with AI' };

export function AiWordsEntry({ mode }: { mode: WordsMode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="aientry">
      <button type="button" className="btn ghost aibtn" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span aria-hidden="true">✦</span> {open ? 'Close AI writing' : LABEL[mode]}
      </button>
      {open && (
        <Suspense fallback={<p className="hint">Loading…</p>}>
          <AiWords mode={mode} />
        </Suspense>
      )}
    </div>
  );
}

export function AiArtworkEntry({ wide = false }: { wide?: boolean }) {
  const [open, setOpen] = useState(wide);
  return (
    <div className="aientry">
      {!wide && (
        <button type="button" className="btn ghost aibtn" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <span aria-hidden="true">✦</span> {open ? 'Close AI pictures' : 'Create a picture with AI'}
        </button>
      )}
      {open && (
        <Suspense fallback={<p className="hint">Loading…</p>}>
          <AiArtwork wide={wide} />
        </Suspense>
      )}
    </div>
  );
}
