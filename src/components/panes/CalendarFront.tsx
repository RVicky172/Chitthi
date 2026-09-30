import { FESTIVAL_YEARS, hasFestivals } from '../../data/holidays';
import { MONTHS } from '../../data/products';
import { calPages, resolveTheme } from '../../engine/design';
import { calMonth } from '../../engine/render';
import { setDesign, setUI, useApp } from '../../state/store';
import type { CalendarSettings, CalTextPlace, HAlign, VAlign } from '../../types';
import { Check, Pane, Section, Seg, YearField } from '../common';
import { FontPicker } from '../FontPicker';
import { AiWordsEntry } from '../ai/AiEntry';
import { InstagramIcon } from '../icons';

/*
 * The calendar's Front step, in the order people decide things: a style to start from, the year, the month title,
 * the dates, then the words on each month. Every control here changes all twelve pages the same way, so bound
 * pages line up; the only per-month setting is the caption.
 */

type CalStyle = Pick<CalendarSettings, 'font' | 'numFont' | 'numSync' | 'numBold' | 'grid' | 'numbers' | 'titleAlign'>;

/** Ready-made looks: each sets the title and date fonts, the grid and the alignment together. */
export const STYLES: [string, string, CalStyle][] = [
  ['classic', 'Classic', { font: '', numFont: '', numSync: false, numBold: true, grid: 'lines', numbers: 'corner', titleAlign: 'center' }],
  ['modern', 'Modern', { font: 'Mukta', numFont: 'Mukta', numSync: false, numBold: true, grid: 'tiles', numbers: 'center', titleAlign: 'left' }],
  ['minimal', 'Minimal', { font: 'Playfair Display', numFont: 'Hind', numSync: false, numBold: false, grid: 'none', numbers: 'center', titleAlign: 'left' }],
  ['elegant', 'Elegant', { font: 'Cinzel', numFont: '', numSync: true, numBold: false, grid: 'lines', numbers: 'center', titleAlign: 'center' }],
  ['bold', 'Bold', { font: 'Bebas Neue', numFont: 'Khand', numSync: false, numBold: true, grid: 'boxes', numbers: 'corner', titleAlign: 'left' }],
];
const styleOf = (cal: CalendarSettings) =>
  STYLES.find(([, , s]) => (Object.keys(s) as (keyof CalStyle)[]).every((k) => cal[k] === s[k]))?.[0];

/** A size slider with its value and a way back to the layout's own size. */
function SizeSlider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const v = value || 1;
  return (
    <label className="f sizef">
      <span className="sizef-top">
        {label}
        <span>
          <b>{Math.round(v * 100)}%</b>
          {Math.abs(v - 1) > 0.001 && (
            <button type="button" className="linkbtn" onClick={() => onChange(1)}>
              Reset
            </button>
          )}
        </span>
      </span>
      <input type="range" min={0.6} max={1.6} step={0.05} value={v} onChange={(e) => onChange(+e.target.value)} />
    </label>
  );
}

export function CalendarFront() {
  const d = useApp((s) => s.design),
    calPage = useApp((s) => s.ui.calPage);
  const cal = d.cal,
    t = resolveTheme(d),
    n = calPages(d),
    page = Math.min(calPage, n - 1),
    strip = d.layout === 'cal-strip',
    hasPhoto = d.layout !== 'cal-plain',
    monthFont = cal.font || d.headFont,
    current = styleOf(cal);
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
  const words = cal.text !== 'off';
  const onPhoto = cal.text === 'photo';

  return (
    <Pane
      title="Front"
      lead="Every setting here applies to all the month pages, so they match when the calendar is bound."
      next="back"
      onNext={() => setUI({ pane: 'back' })}
    >
      <Section id="calf.style" title="Style" note={STYLES.find(([id]) => id === current)?.[1] ?? 'Custom'}>
        <p className="hint">Start from a look, then fine-tune the title and dates below.</p>
        <div className="calstyles" role="group" aria-label="Calendar style">
          {STYLES.map(([id, name, s]) => (
            <button
              key={id}
              type="button"
              className="calstyle"
              aria-pressed={current === id}
              onClick={() => setCal({ ...s, titleScale: 1, numScale: 1 })}
            >
              <span className="calstyle-t" style={{ fontFamily: `"${s.font || d.headFont}", serif`, textAlign: s.titleAlign === 'left' ? 'left' : 'center' }}>
                Jan
              </span>
              <span className={`calstyle-g g-${s.grid}`} aria-hidden="true">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((k) => (
                  <i key={k} style={{ fontFamily: `"${s.numSync ? s.font || d.headFont : s.numFont || 'Hind'}", sans-serif`, fontWeight: s.numBold ? 700 : 400 }}>
                    {k}
                  </i>
                ))}
              </span>
              <small>{name}</small>
            </button>
          ))}
        </div>
      </Section>

      <Section id="calf.year" title="Year" note={`${cal.year}`}>
        <div className="row">
          <YearField value={cal.year} onChange={(year) => setCal({ year })} />
          <label className="f">
            {cal.months === 12 ? 'Starts in' : 'Month'}
            <select value={cal.start} onChange={(e) => setCal({ start: +e.target.value })}>
              {MONTHS.map((m, i) => (
                <option key={m} value={i}>
                  {m}
                </option>
              ))}
            </select>
          </label>
        </div>
        <Seg<'1' | '0'>
          label="Week starts on"
          value={String(cal.weekStart) as '1' | '0'}
          options={[
            ['1', 'Week starts Monday'],
            ['0', 'Week starts Sunday'],
          ]}
          onChange={(v) => setCal({ weekStart: +v as 0 | 1 })}
        />
      </Section>

      <Section id="calf.title" title="Month title" note={monthFont}>
        <FontPicker
          label="Font"
          value={monthFont}
          sample={MONTHS[calMonth(d, page).month]}
          weight="hw"
          onChange={(font) => setCal({ font: font === d.headFont ? '' : font })}
        />
        <SizeSlider label="Size" value={cal.titleScale} onChange={(titleScale) => setCal({ titleScale })} />
        <Seg<CalendarSettings['titleAlign']>
          label="Alignment"
          value={cal.titleAlign}
          options={[
            ['left', 'Align left'],
            ['center', 'Centre'],
          ]}
          onChange={(titleAlign) => setCal({ titleAlign })}
        />
        <Check checked={cal.showYear !== false} onChange={(showYear) => setCal({ showYear })}>
          Show the year beside the month
        </Check>
      </Section>

      <Section id="calf.dates" title="Dates" note={cal.numSync ? 'Same font as title' : cal.numFont || 'Hind'}>
        <Check checked={cal.numSync} onChange={(numSync) => setCal({ numSync })}>
          Use the month title font for the dates
        </Check>
        {!cal.numSync && (
          <FontPicker
            label="Dates font"
            value={cal.numFont || 'Hind'}
            sample="MON TUE 1 2 3 14 25 31"
            weight={cal.numBold ? 'hw' : 'bw'}
            onChange={(numFont) => setCal({ numFont: numFont === 'Hind' ? '' : numFont })}
          />
        )}
        <SizeSlider label="Size" value={cal.numScale} onChange={(numScale) => setCal({ numScale })} />
        <div className="inline">
          <Check checked={cal.numBold} onChange={(numBold) => setCal({ numBold })}>
            Bold
          </Check>
          <Check checked={cal.sundays !== false} onChange={(sundays) => setCal({ sundays })}>
            Sundays in colour
          </Check>
        </div>
        <Seg<CalendarSettings['numbers']>
          label="Date position"
          value={cal.numbers}
          options={[
            ['corner', 'In the corner'],
            ['center', 'Centred'],
          ]}
          onChange={(numbers) => setCal({ numbers })}
        />
        <Seg<CalendarSettings['grid']>
          label="Grid"
          value={cal.grid}
          options={[
            ['lines', 'Rows'],
            ['boxes', 'Boxes'],
            ['tiles', 'Tiles'],
            ['none', 'None'],
          ]}
          onChange={(grid) => setCal({ grid })}
        />
      </Section>

      <Section
        id="calf.days"
        title="Festivals and your dates"
        note={`${cal.marks === 'off' ? 'No festivals' : cal.marks === 'national' ? 'National days' : 'Festivals'}${cal.ownDates.length ? ` · ${cal.ownDates.length} of yours` : ''}`}
      >
        <Seg<CalendarSettings['marks']>
          label="Marked days"
          value={cal.marks}
          options={[
            ['off', 'None'],
            ['national', 'National days'],
            ['all', 'Festivals too'],
          ]}
          onChange={(marks) => setCal({ marks })}
        />
        {cal.marks === 'all' && !hasFestivals(cal.year) && (
          <p className="warnbox" role="note">
            Festival dates move every year, and {cal.year}’s aren’t built in yet (available: {FESTIVAL_YEARS.join(', ')}). National
            days and your own dates still show. Add any festival below as one of your dates.
          </p>
        )}
        {cal.marks !== 'off' && (
          <p className="hint">
            Dates from the Government of India holiday list. Eid and Muharram follow the moon and can move by a day; some states
            celebrate festivals on other days.
          </p>
        )}
        <Check checked={cal.markNames} onChange={(markNames) => setCal({ markNames })}>
          Write the names in the date boxes (otherwise a small dot)
        </Check>
        <div className="owndates">
          <p className="f-lab">Your dates, every year: birthdays, anniversaries</p>
          {cal.ownDates.map((o, i) => (
            <div key={i} className="owndate">
              <select
                aria-label="Month"
                value={o.m}
                onChange={(e) => setCal({ ownDates: cal.ownDates.map((x, j) => (j === i ? { ...x, m: +e.target.value } : x)) })}
              >
                {MONTHS.map((m, k) => (
                  <option key={m} value={k + 1}>
                    {m.slice(0, 3)}
                  </option>
                ))}
              </select>
              <input
                type="number"
                aria-label="Day"
                min={1}
                max={31}
                value={o.d}
                onChange={(e) =>
                  setCal({ ownDates: cal.ownDates.map((x, j) => (j === i ? { ...x, d: Math.min(31, Math.max(1, Math.round(+e.target.value || 1))) } : x)) })
                }
              />
              <input
                type="text"
                aria-label="What"
                placeholder="e.g. Maa’s birthday"
                value={o.label}
                maxLength={40}
                onChange={(e) => setCal({ ownDates: cal.ownDates.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })}
              />
              <button type="button" className="btn ghost icon" aria-label="Remove this date" onClick={() => setCal({ ownDates: cal.ownDates.filter((_, j) => j !== i) })}>
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn ghost"
            onClick={() => setCal({ ownDates: [...cal.ownDates, { m: calMonth(d, page).month + 1, d: 1, label: '' }] })}
          >
            + Add a date
          </button>
        </div>
      </Section>

      <Section id="calf.words" title="Words on the months" note={words ? (onPhoto ? 'On the photo' : 'Above the month') : 'None'}>
        <AiWordsEntry mode="captions" />
        <Seg<CalTextPlace>
          label="Where the words go"
          value={cal.text}
          options={[
            ['off', 'No words'],
            ['caption', 'Above the month'],
            ...(hasPhoto ? ([['photo', 'On the photo']] as [CalTextPlace, string][]) : []),
          ]}
          onChange={(text) => setCal({ text })}
        />
        {!words && <p className="hint">Choose where to put a caption, like a festival name, on each month.</p>}
        {words && (
          <>
            <label className="f">
              Words for every month
              <input
                type="text"
                value={d.heading}
                placeholder="e.g. Festivals of India"
                onChange={(e) => setDesign({ heading: e.target.value, showHeading: true })}
              />
            </label>
            <div className="chips">
              {t.heads.map((x) => (
                <button key={x} type="button" className="chip" onClick={() => setDesign({ heading: x, showHeading: true })}>
                  {x}
                </button>
              ))}
            </div>
            {!strip && (
              <details className="mcaps-box" open={filled > 0}>
                <summary>
                  A different caption for each month <small>{filled ? `${filled} of ${n} written` : 'optional'}</small>
                </summary>
                <p className="hint">A month with no caption uses the words above. Click a month to see it in the preview.</p>
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
                        placeholder={d.heading || `${MONTHS[month]} caption`}
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
            {strip && <p className="hint">The Year strip is a single page, so it shows these words once.</p>}
            <FontPicker
              label="Caption font"
              value={cal.capFont || d.headFont}
              sample={cal.captions[calMonth(d, page).month] || d.heading || 'Makar Sankranti'}
              weight="hw"
              onChange={(capFont) => setCal({ capFont: capFont === d.headFont ? '' : capFont })}
            />
            <SizeSlider label="Caption size" value={d.textScale} onChange={(textScale) => setDesign({ textScale })} />
            <div className="inline">
              <Check checked={d.customColor} onChange={(customColor) => setDesign({ customColor })}>
                Own colour
              </Check>
              <input
                type="color"
                aria-label="Caption colour"
                value={d.color}
                onChange={(e) => setDesign({ color: e.target.value, customColor: true })}
              />
            </div>
            {!onPhoto && <p className="hint">Above the month, the caption lines up with the month title.</p>}
          </>
        )}
      </Section>

      {onPhoto && (
        <Section id="calf.photo" title="On the photo">
          <p className="hint">A quote and signature can follow the caption when the words sit on the photo.</p>
          <Check checked={d.showQuote} onChange={(showQuote) => setDesign({ showQuote })}>
            Quote
          </Check>
          {d.showQuote && (
            <>
              <textarea rows={2} aria-label="Quote" value={d.quote} onChange={(e) => setDesign({ quote: e.target.value })} />
              <FontPicker
                label="Quote font"
                value={d.quoteFont}
                sample={d.quote || 'Wish you were here'}
                weight="bw"
                onChange={(quoteFont) => setDesign({ quoteFont })}
              />
            </>
          )}
          <Check checked={d.showSig} onChange={(showSig) => setDesign({ showSig })}>
            Signature
          </Check>
          {d.showSig && (
            <>
              <input type="text" aria-label="Signature" value={d.sig} onChange={(e) => setDesign({ sig: e.target.value })} />
              <FontPicker
                label="Signature font"
                value={d.sigFont || d.quoteFont}
                sample={d.sig || 'With love'}
                weight="bw"
                onChange={(f) => setDesign({ sigFont: f === d.quoteFont ? '' : f })}
              />
            </>
          )}
          <Seg<VAlign>
            label="Position on the photo"
            value={d.vAlign}
            options={[
              ['top', 'Top'],
              ['middle', 'Middle'],
              ['bottom', 'Bottom'],
            ]}
            onChange={(vAlign) => setDesign({ vAlign })}
          />
          <Seg<HAlign>
            label="Alignment on the photo"
            value={d.hAlign}
            options={[
              ['left', 'Left'],
              ['center', 'Centre'],
              ['right', 'Right'],
            ]}
            onChange={(hAlign) => setDesign({ hAlign })}
          />
          <Check checked={d.scrim} onChange={(scrim) => setDesign({ scrim })}>
            Darken the photo behind the words
          </Check>
          {d.showQuote && (
            <Check checked={d.ornament} onChange={(ornament) => setDesign({ ornament })}>
              Ornament between caption and quote
            </Check>
          )}
        </Section>
      )}

      <Section id="calf.insta" title="Instagram tag" note={d.insta ? `@${d.insta}` : undefined} defaultOpen={false}>
        <label className="f">
          Shown in the photo’s bottom-right corner
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
        {d.insta && (
          <FontPicker
            label="Tag font"
            value={d.instaFont || 'Hind'}
            sample={d.insta}
            weight="hw"
            onChange={(f) => setDesign({ instaFont: f === 'Hind' ? '' : f })}
          />
        )}
      </Section>
    </Pane>
  );
}
