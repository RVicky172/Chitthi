import { MONTHS } from '../../data/products';
import { calPages, resolveTheme } from '../../engine/design';
import { calMonth } from '../../engine/render';
import { setDesign, setUI, useApp } from '../../state/store';
import type { CalendarSettings, CalTextPlace, HAlign, VAlign } from '../../types';
import { Check, Pane, Section, Seg } from '../common';
import { FontPicker } from '../FontPicker';
import { InstagramIcon } from '../icons';

export function WordsPane() {
  const d = useApp((s) => s.design);
  const t = resolveTheme(d);
  return (
    <Pane
      title="Front"
      lead={
        d.product === 'calendar'
          ? 'Month names and dates are added for you. Choose where your words go on the month pages, and give each month its own caption.'
          : d.product === 'frame'
            ? 'Words show under the photo with the “Photo and caption” layout. The Instagram tag shows on every layout.'
            : d.product === 'magnet'
              ? 'Keep it short: a name, a place or a date reads best on a magnet. Two-photo and four-photo layouts are photos only.'
              : undefined
      }
      next="back"
      onNext={() => setUI({ pane: 'back' })}
    >
      {d.product === 'calendar' && <CalendarWords />}
      <Section id="words.text" title={d.product === 'calendar' ? 'Greeting and quote' : 'Greeting, quote and signature'}>
      <Check checked={d.showHeading} onChange={(showHeading) => setDesign({ showHeading })}>
        {d.product === 'calendar' ? 'Greeting (months without a caption use it, and it titles the year page)' : 'Greeting'}
      </Check>
      <input type="text" aria-label="Greeting" value={d.heading} onChange={(e) => setDesign({ heading: e.target.value })} />
      <div className="chips">
        {t.heads.map((x) => (
          <button key={x} type="button" className="chip" onClick={() => setDesign({ heading: x, showHeading: true })}>
            {x}
          </button>
        ))}
      </div>
      <Check checked={d.showQuote} onChange={(showQuote) => setDesign({ showQuote })}>
        Quote or wish
      </Check>
      <textarea rows={3} aria-label="Quote" value={d.quote} onChange={(e) => setDesign({ quote: e.target.value })} />
      <details>
        <summary className="hint" style={{ cursor: 'pointer' }}>
          Suggested quotes
        </summary>
        <div className="quotes">
          {t.quotes.map((q) => (
            <button key={q} type="button" className="chip" onClick={() => setDesign({ quote: q, showQuote: true })}>
              {q}
            </button>
          ))}
        </div>
      </details>
      <Check checked={d.showSig} onChange={(showSig) => setDesign({ showSig })}>
        Signature line
      </Check>
      <input type="text" aria-label="Signature" value={d.sig} onChange={(e) => setDesign({ sig: e.target.value })} />
      </Section>
      <Section id="words.insta" title="Instagram tag" note={d.insta ? `@${d.insta}` : undefined} defaultOpen={false}>
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
            value={d.insta}
            onChange={(e) => setDesign({ insta: e.target.value.replace(/[@\s]/g, '') })}
          />
        </span>
      </label>
      </Section>
      <Section id="words.fonts" title="Fonts and size" note={d.headFont}>
      <FontPicker
        label="Greeting font"
        value={d.headFont}
        sample={d.heading || 'Happy Diwali'}
        weight="hw"
        onChange={(headFont) => setDesign({ headFont })}
      />
      <FontPicker
        label="Quote font"
        value={d.quoteFont}
        sample={d.quote || 'Wish you were here'}
        weight="bw"
        onChange={(quoteFont) => setDesign({ quoteFont })}
      />
      <label className="f">
        Text size
        <input
          type="range"
          min={0.6}
          max={1.6}
          step={0.05}
          value={d.textScale}
          onChange={(e) => setDesign({ textScale: +e.target.value })}
        />
      </label>
      </Section>
      <Section id="words.place" title="Position and colour">
      <div className="inline">
        <Seg<VAlign>
          label="Vertical position"
          value={d.vAlign}
          options={[
            ['top', 'Top'],
            ['middle', 'Middle'],
            ['bottom', 'Bottom'],
          ]}
          onChange={(vAlign) => setDesign({ vAlign })}
        />
        <Seg<HAlign>
          label="Alignment"
          value={d.hAlign}
          options={[
            ['left', 'Left'],
            ['center', 'Center'],
            ['right', 'Right'],
          ]}
          onChange={(hAlign) => setDesign({ hAlign })}
        />
      </div>
      <div className="inline">
        <Check checked={d.customColor} onChange={(customColor) => setDesign({ customColor })}>
          Custom text colour
        </Check>
        <input
          type="color"
          aria-label="Text colour"
          value={d.color}
          onChange={(e) => setDesign({ color: e.target.value, customColor: true })}
        />
      </div>
      <Check checked={d.scrim} onChange={(scrim) => setDesign({ scrim })}>
        Darken the photo behind text
      </Check>
      <Check checked={d.ornament} onChange={(ornament) => setDesign({ ornament })}>
        Ornament between greeting and quote
      </Check>
      </Section>
    </Pane>
  );
}

/** Calendar words: where they go on the month pages, one caption per month, and how titles and dates are set. */
function CalendarWords() {
  const d = useApp((s) => s.design),
    calPage = useApp((s) => s.ui.calPage);
  const cal = d.cal,
    n = calPages(d),
    page = Math.min(calPage, n - 1),
    strip = d.layout === 'cal-strip',
    hasPhoto = d.layout !== 'cal-plain';
  const setCal = (p: Partial<CalendarSettings>) => setDesign((cur) => ({ cal: { ...cur.cal, ...p } }));
  const setCaption = (month: number, text: string) =>
    setDesign((cur) => {
      const captions = [...cur.cal.captions];
      captions[month] = text;
      // Typing a caption while words are off turns them on, so the caption shows up straight away.
      return { cal: { ...cur.cal, captions, text: cur.cal.text === 'off' && text.trim() ? 'caption' : cur.cal.text } };
    });
  const months = Array.from({ length: n }, (_, p) => ({ p, ...calMonth(d, p) }));
  const filled = months.filter((m) => cal.captions[m.month]?.trim()).length;
  return (
    <>
      <Section id="cal.words" title="Words on the month pages" note={filled ? `${filled} of ${n} captions` : undefined}>
      <Seg<CalTextPlace>
        label="Where the words go"
        value={cal.text}
        options={[
          ['off', 'None'],
          ['caption', 'Above the month'],
          ...(hasPhoto ? ([['photo', 'On the photo']] as [CalTextPlace, string][]) : []),
        ]}
        onChange={(text) => setCal({ text })}
      />
      {cal.text === 'photo' && (
        <p className="hint">Words sit inside the photo. Use Vertical position below to move them, and “Darken the photo” to keep them readable.</p>
      )}
      {!strip && (
        <details className="mcaps-box" open={cal.text !== 'off' || filled > 0}>
          <summary>
            Month captions <small>{filled ? `${filled} of ${n} written` : 'optional'}</small>
          </summary>
          <p className="hint">Each caption shows on its own month. Leave one empty to use the greeting. Click a month to see it in the preview.</p>
          <ol className="mcaps">
            {months.map(({ p, month, year }) => (
              <li key={p} className={p === page ? 'on' : undefined}>
                <label htmlFor={`cap-${p}`}>
                  <b>{MONTHS[month].slice(0, 3)}</b>
                  <small>{year}</small>
                </label>
                <input
                  id={`cap-${p}`}
                  type="text"
                  value={cal.captions[month] ?? ''}
                  placeholder={d.showHeading && d.heading ? d.heading : `${MONTHS[month]} caption`}
                  onFocus={() => setUI({ calPage: p, side: 'front' })}
                  onChange={(e) => setCaption(month, e.target.value)}
                />
              </li>
            ))}
          </ol>
          {filled > 0 && (
            <button type="button" className="linkbtn" onClick={() => setCal({ captions: Array.from({ length: 12 }, () => '') })}>
              Clear all captions
            </button>
          )}
        </details>
      )}
      {strip && <p className="hint">The Year strip is a single page, so it shows the greeting once instead of month captions.</p>}
      </Section>
      <Section id="cal.titles" title="Month titles and dates">
      <div className="inline">
        <Seg<CalendarSettings['titleAlign']>
          label="Month title alignment"
          value={cal.titleAlign}
          options={[
            ['left', 'Title left'],
            ['center', 'Title centred'],
          ]}
          onChange={(titleAlign) => setCal({ titleAlign })}
        />
        <Seg<CalendarSettings['numbers']>
          label="Day numbers"
          value={cal.numbers}
          options={[
            ['corner', 'Dates in corner'],
            ['center', 'Dates centred'],
          ]}
          onChange={(numbers) => setCal({ numbers })}
        />
      </div>
      <Seg<CalendarSettings['grid']>
        label="Grid lines"
        value={cal.grid}
        options={[
          ['lines', 'Rows'],
          ['boxes', 'Boxes'],
          ['none', 'No lines'],
        ]}
        onChange={(grid) => setCal({ grid })}
      />
      <FontPicker
        label="Month font"
        value={cal.font || d.headFont}
        sample={MONTHS[calMonth(d, page).month]}
        weight="hw"
        onChange={(font) => setCal({ font: font === d.headFont ? '' : font })}
      />
      <FontPicker
        label="Dates and weekdays font"
        value={cal.numFont || 'Hind'}
        sample="MON TUE 1 2 3 14 25 31"
        weight={cal.numBold ? 'hw' : 'bw'}
        onChange={(numFont) => setCal({ numFont: numFont === 'Hind' ? '' : numFont })}
      />
      <Check checked={cal.numBold} onChange={(numBold) => setCal({ numBold })}>
        Bold dates
      </Check>
      <p className="hint">Every month uses the same title size and grid, so the pages line up when the calendar is bound.</p>
      </Section>
    </>
  );
}
