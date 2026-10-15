import { lazy, Suspense, useState } from 'react';
import type { WordsMode } from './AiWords';

/*
 * The small, always-loaded buttons that open the AI panels. The panels themselves, the AI service and the provider
 * code load only when one of these is clicked, so the app starts no bigger for people who don't use AI.
 */

const AiWords = lazy(() => import('./AiWords'));
const AiArtwork = lazy(() => import('./AiArtwork'));

const LABEL: Record<WordsMode, string> = {
  card: 'Write with AI',
  captions: 'Write captions with AI',
  message: 'Write the message with AI',
};

/** Which words the AI writes. */
interface AiWordsEntryProps {
  mode: WordsMode;
}

/**
 * A button that opens AI writing (loaded on first use) for a card, calendar captions or a message.
 * @param props what the AI writes
 */
export function AiWordsEntry({ mode }: Readonly<AiWordsEntryProps>) {
  const [open, setOpen] = useState(false);
  return (
    <div className="aientry">
      <button
        type="button"
        className="btn ghost aibtn"
        aria-expanded={open}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
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

/** Whether the artwork panel shows open, without its button (a wide pane). */
interface AiArtworkEntryProps {
  wide?: boolean;
}

/**
 * A button that opens AI pictures (loaded on first use); always open when wide.
 * @param props whether it is wide
 */
export function AiArtworkEntry({ wide = false }: Readonly<AiArtworkEntryProps>) {
  const [open, setOpen] = useState(wide);
  return (
    <div className="aientry">
      {!wide && (
        <button
          type="button"
          className="btn ghost aibtn"
          aria-expanded={open}
          onClick={() => setOpen((wasOpen) => !wasOpen)}
        >
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
