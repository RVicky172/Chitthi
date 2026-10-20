import { resolveTheme } from '../../engine/design';
import { setDesign, setUI, useApp } from '../../state/store';
import type { HAlign, ProductId, VAlign } from '../../types';
import { Check, Pane, Seg } from '../common';
import { FoldSection } from '../panel';
import { FontPicker } from '../FontPicker';
import { InstagramIcon } from '../icons';
import { AiWordsEntry } from '../ai/AiEntry';
import { CalendarFront } from './CalendarFront';
import { PostmarkYear } from './EnvelopeSection';

/** The Words pane: the calendar's front, or a card's greeting, quote and signature. */
export function WordsPane() {
  const product = useApp((state) => state.design.product);
  return product === 'calendar' ? <CalendarFront /> : <CardWords />;
}

/** The note under the Front pane's title, for the products that need one. */
const WORDS_LEADS: Partial<Record<ProductId, string>> = {
  frame: 'Words show under the photo with the “Photo and caption” layout. The Instagram tag shows on every layout.',
  magnet:
    'Keep it short: a name, a place or a date reads best on a magnet. Two-photo and four-photo layouts are photos only.',
};

/** Postcards, frames and magnets: greeting, quote and signature, each with its own font. */
function CardWords() {
  const design = useApp((state) => state.design);
  const theme = resolveTheme(design);
  return (
    <Pane title="Front" lead={WORDS_LEADS[design.product]} next="back" onNext={() => setUI({ pane: 'back' })}>
      <FoldSection id="words.text" title="Greeting, quote and signature">
        <AiWordsEntry mode="card" />
        <Check checked={design.showHeading} onChange={(showHeading) => setDesign({ showHeading })}>
          Greeting
        </Check>
        <input
          type="text"
          aria-label="Greeting"
          value={design.heading}
          onChange={(event) => setDesign({ heading: event.target.value })}
        />
        <div className="chips">
          {theme.heads.map((x) => (
            <button key={x} type="button" className="chip" onClick={() => setDesign({ heading: x, showHeading: true })}>
              {x}
            </button>
          ))}
        </div>
        <FontPicker
          label="Greeting font"
          value={design.headFont}
          sample={design.heading || 'Happy Diwali'}
          weight="hw"
          onChange={(headFont) => setDesign({ headFont })}
        />
        <Check checked={design.showQuote} onChange={(showQuote) => setDesign({ showQuote })}>
          Quote or wish
        </Check>
        <textarea
          rows={3}
          aria-label="Quote"
          value={design.quote}
          onChange={(event) => setDesign({ quote: event.target.value })}
        />
        <details>
          <summary className="hint" style={{ cursor: 'pointer' }}>
            Suggested quotes
          </summary>
          <div className="quotes">
            {theme.quotes.map((quote) => (
              <button
                key={quote}
                type="button"
                className="chip"
                onClick={() => setDesign({ quote: quote, showQuote: true })}
              >
                {quote}
              </button>
            ))}
          </div>
        </details>
        <FontPicker
          label="Quote font"
          value={design.quoteFont}
          sample={design.quote || 'Wish you were here'}
          weight="bw"
          onChange={(quoteFont) => setDesign({ quoteFont })}
        />
        <Check checked={design.showSig} onChange={(showSig) => setDesign({ showSig })}>
          Signature line
        </Check>
        <input
          type="text"
          aria-label="Signature"
          value={design.sig}
          onChange={(event) => setDesign({ sig: event.target.value })}
        />
        <FontPicker
          label="Signature font"
          value={design.sigFont || design.quoteFont}
          sample={design.sig || 'With love'}
          weight="bw"
          onChange={(font) => setDesign({ sigFont: font === design.quoteFont ? '' : font })}
        />
      </FoldSection>
      {design.layout === 'stamp' && (
        <FoldSection id="words.postmark" title="Postmark" note={String(design.postYear || new Date().getFullYear())}>
          <PostmarkYear />
        </FoldSection>
      )}
      <FoldSection
        id="words.insta"
        title="Instagram tag"
        note={design.insta ? `@${design.insta}` : undefined}
        defaultOpen={false}
      >
        <label className="f">
          Instagram (shown in the photo’s bottom-right corner)
          <span className="ig">
            <InstagramIcon />
            <input
              type="text"
              placeholder="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={design.insta}
              onChange={(event) => setDesign({ insta: event.target.value.replace(/[@\s]/g, '') })}
            />
          </span>
        </label>
        <FontPicker
          label="Tag font"
          value={design.instaFont || 'Hind'}
          sample={design.insta || 'username'}
          weight="hw"
          onChange={(font) => setDesign({ instaFont: font === 'Hind' ? '' : font })}
        />
      </FoldSection>
      <FoldSection id="words.fonts" title="Text size" note={`${Math.round(design.textScale * 100)}%`}>
        <label className="f">
          Text size
          <input
            type="range"
            min={0.6}
            max={1.6}
            step={0.05}
            value={design.textScale}
            onChange={(event) => setDesign({ textScale: +event.target.value })}
          />
        </label>
      </FoldSection>
      <FoldSection id="words.place" title="Position and colour">
        <div className="inline">
          <Seg<VAlign>
            label="Vertical position"
            value={design.vAlign}
            options={[
              ['top', 'Top'],
              ['middle', 'Middle'],
              ['bottom', 'Bottom'],
            ]}
            onChange={(vAlign) => setDesign({ vAlign })}
          />
          <Seg<HAlign>
            label="Alignment"
            value={design.hAlign}
            options={[
              ['left', 'Left'],
              ['center', 'Center'],
              ['right', 'Right'],
            ]}
            onChange={(hAlign) => setDesign({ hAlign })}
          />
        </div>
        <div className="inline">
          <Check checked={design.customColor} onChange={(customColor) => setDesign({ customColor })}>
            Custom text colour
          </Check>
          <input
            type="color"
            aria-label="Text colour"
            value={design.color}
            onChange={(event) => setDesign({ color: event.target.value, customColor: true })}
          />
        </div>
        <Check checked={design.scrim} onChange={(scrim) => setDesign({ scrim })}>
          Darken the photo behind text
        </Check>
        <Check checked={design.ornament} onChange={(ornament) => setDesign({ ornament })}>
          Ornament between greeting and quote
        </Check>
      </FoldSection>
    </Pane>
  );
}
