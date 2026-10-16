import { FESTIVAL_YEARS, hasFestivals } from '../../data/holidays';
import { MONTHS } from '../../data/products';
import { calPages, resolveTheme } from '../../engine/design';
import { calMonth } from '../../engine/calendarDraw';
import { setDesign, setUI, useApp } from '../../state/store';
import type { CalendarSettings, CalTextPlace, Design, HAlign, VAlign } from '../../types';
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
  [
    'classic',
    'Classic',
    { font: '', numFont: '', numSync: false, numBold: true, grid: 'lines', numbers: 'corner', titleAlign: 'center' },
  ],
  [
    'modern',
    'Modern',
    {
      font: 'Mukta',
      numFont: 'Mukta',
      numSync: false,
      numBold: true,
      grid: 'tiles',
      numbers: 'center',
      titleAlign: 'left',
    },
  ],
  [
    'minimal',
    'Minimal',
    {
      font: 'Playfair Display',
      numFont: 'Hind',
      numSync: false,
      numBold: false,
      grid: 'none',
      numbers: 'center',
      titleAlign: 'left',
    },
  ],
  [
    'elegant',
    'Elegant',
    {
      font: 'Cinzel',
      numFont: '',
      numSync: true,
      numBold: false,
      grid: 'lines',
      numbers: 'center',
      titleAlign: 'center',
    },
  ],
  [
    'bold',
    'Bold',
    {
      font: 'Bebas Neue',
      numFont: 'Khand',
      numSync: false,
      numBold: true,
      grid: 'boxes',
      numbers: 'corner',
      titleAlign: 'left',
    },
  ],
];
const styleOf = (cal: CalendarSettings) =>
  STYLES.find(([, , preset]) =>
    (Object.keys(preset) as (keyof CalStyle)[]).every((key) => cal[key] === preset[key]),
  )?.[0];

/**
 * A size slider with its value and a way back to the layout's own size.
 * @param props the label, the value (0 or 1 for the layout's own size) and its change handler
 */
function SizeSlider({
  label,
  value,
  onChange,
}: Readonly<{ label: string; value: number; onChange: (v: number) => void }>) {
  const scale = value || 1;
  return (
    <label className="f sizef">
      <span className="sizef-top">
        {label}
        <span>
          <b>{Math.round(scale * 100)}%</b>
          {Math.abs(scale - 1) > 0.001 && (
            <button type="button" className="linkbtn" onClick={() => onChange(1)}>
              Reset
            </button>
          )}
        </span>
      </span>
      <input
        type="range"
        min={0.6}
        max={1.6}
        step={0.05}
        value={scale}
        onChange={(event) => onChange(+event.target.value)}
      />
    </label>
  );
}

/**
 * Changes calendar settings.
 * @param patch the settings to change
 */
function setCal(patch: Partial<CalendarSettings>): void {
  setDesign((cur) => ({ cal: { ...cur.cal, ...patch } }));
}

/**
 * Sets one month's caption; typing a caption while words are off turns them on, so it shows up straight away.
 * @param month the month, 0–11
 * @param text the caption
 */
function setCaption(month: number, text: string): void {
  setDesign((cur) => {
    const captions = [...cur.cal.captions];
    captions[month] = text;
    return { cal: { ...cur.cal, captions, text: cur.cal.text === 'off' && text.trim() ? 'caption' : cur.cal.text } };
  });
}

/** The marked days, in words. */
const MARKS_NOTES: Record<CalendarSettings['marks'], string> = {
  off: 'No festivals',
  national: 'National days',
  all: 'Festivals',
};

/**
 * The Festivals section's note: the marked days, and how many dates of the user's own.
 * @param cal the calendar settings
 * @returns the note
 */
function marksNote(cal: CalendarSettings): string {
  const own = cal.ownDates.length ? ` · ${cal.ownDates.length} of yours` : '';
  return MARKS_NOTES[cal.marks] + own;
}

/**
 * Where the words go, in words.
 * @param place the setting
 * @returns the note
 */
function wordsNote(place: CalTextPlace): string {
  if (place === 'off') return 'None';
  return place === 'photo' ? 'On the photo' : 'Above the month';
}

/** The design. */
interface DesignProps {
  design: Design;
}

/** The design and the month shown in the preview. */
interface FrontProps extends DesignProps {
  page: number;
}

/**
 * Ready-made looks, each drawn as a small sample.
 * @param props the design
 */
function StyleSection({ design }: Readonly<DesignProps>) {
  const current = styleOf(design.cal);
  return (
    <Section id="calf.style" title="Style" note={STYLES.find(([id]) => id === current)?.[1] ?? 'Custom'}>
      <p className="hint">Start from a look, then fine-tune the title and dates below.</p>
      <div className="calstyles" role="group" aria-label="Calendar style">
        {STYLES.map(([id, name, preset]) => (
          <button
            key={id}
            type="button"
            className="calstyle"
            aria-pressed={current === id}
            onClick={() => setCal({ ...preset, titleScale: 1, numScale: 1 })}
          >
            <span
              className="calstyle-t"
              style={{
                fontFamily: `"${preset.font || design.headFont}", serif`,
                textAlign: preset.titleAlign === 'left' ? 'left' : 'center',
              }}
            >
              Jan
            </span>
            <span className={`calstyle-g g-${preset.grid}`} aria-hidden="true">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((count) => (
                <i
                  key={count}
                  style={{
                    fontFamily: `"${preset.numSync ? preset.font || design.headFont : preset.numFont || 'Hind'}", sans-serif`,
                    fontWeight: preset.numBold ? 700 : 400,
                  }}
                >
                  {count}
                </i>
              ))}
            </span>
            <small>{name}</small>
          </button>
        ))}
      </div>
    </Section>
  );
}

/**
 * The year, the first month and the first day of the week.
 * @param props the design
 */
function YearSection({ design }: Readonly<DesignProps>) {
  const cal = design.cal;
  return (
    <Section id="calf.year" title="Year" note={`${cal.year}`}>
      <div className="row">
        <YearField value={cal.year} onChange={(year) => setCal({ year })} />
        <label className="f">
          {cal.months === 12 ? 'Starts in' : 'Month'}
          <select value={cal.start} onChange={(event) => setCal({ start: +event.target.value })}>
            {MONTHS.map((monthName, index) => (
              <option key={monthName} value={index}>
                {monthName}
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
        onChange={(value) => setCal({ weekStart: +value as 0 | 1 })}
      />
    </Section>
  );
}

/**
 * The month title's font, size, alignment and year.
 * @param props the design and the month shown
 */
function TitleSection({ design, page }: Readonly<FrontProps>) {
  const cal = design.cal,
    monthFont = cal.font || design.headFont;
  return (
    <Section id="calf.title" title="Month title" note={monthFont}>
      <FontPicker
        label="Font"
        value={monthFont}
        sample={MONTHS.at(calMonth(design, page).month) ?? ''}
        weight="hw"
        onChange={(font) => setCal({ font: font === design.headFont ? '' : font })}
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
      <Check checked={cal.showYear} onChange={(showYear) => setCal({ showYear })}>
        Show the year beside the month
      </Check>
    </Section>
  );
}

/**
 * The dates' font, size, weight, position and grid.
 * @param props the design
 */
function DatesSection({ design }: Readonly<DesignProps>) {
  const cal = design.cal;
  return (
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
        <Check checked={cal.sundays} onChange={(sundays) => setCal({ sundays })}>
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
  );
}

/**
 * Festivals, national days and the user's own dates.
 * @param props the design and the month shown
 */
function DaysSection({ design, page }: Readonly<FrontProps>) {
  const cal = design.cal;
  return (
    <Section id="calf.days" title="Festivals and your dates" note={marksNote(cal)}>
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
          Festival dates move every year, and {cal.year}’s aren’t built in yet (available: {FESTIVAL_YEARS.join(', ')}
          ). National days and your own dates still show. Add any festival below as one of your dates.
        </p>
      )}
      {cal.marks !== 'off' && (
        <p className="hint">
          Dates from the Government of India holiday list. Eid and Muharram follow the moon and can move by a day; some
          states celebrate festivals on other days.
        </p>
      )}
      <Check checked={cal.markNames} onChange={(markNames) => setCal({ markNames })}>
        Write the names in the date boxes (otherwise a small dot)
      </Check>
      <div className="owndates">
        <p className="f-lab">Your dates, every year: birthdays, anniversaries</p>
        {cal.ownDates.map((date, index) => (
          <div key={index} className="owndate">
            <select
              aria-label="Month"
              value={date.m}
              onChange={(event) =>
                setCal({
                  ownDates: cal.ownDates.map((x, other) => (other === index ? { ...x, m: +event.target.value } : x)),
                })
              }
            >
              {MONTHS.map((monthName, monthIndex) => (
                <option key={monthName} value={monthIndex + 1}>
                  {monthName.slice(0, 3)}
                </option>
              ))}
            </select>
            <input
              type="number"
              aria-label="Day"
              min={1}
              max={31}
              value={date.d}
              onChange={(event) =>
                setCal({
                  ownDates: cal.ownDates.map((x, other) =>
                    other === index ? { ...x, d: Math.min(31, Math.max(1, Math.round(+event.target.value || 1))) } : x,
                  ),
                })
              }
            />
            <input
              type="text"
              aria-label="What"
              placeholder="e.g. Maa’s birthday"
              value={date.label}
              maxLength={40}
              onChange={(event) =>
                setCal({
                  ownDates: cal.ownDates.map((x, other) => (other === index ? { ...x, label: event.target.value } : x)),
                })
              }
            />
            <button
              type="button"
              className="btn ghost icon"
              aria-label="Remove this date"
              onClick={() => setCal({ ownDates: cal.ownDates.filter((_, other) => other !== index) })}
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn ghost"
          onClick={() =>
            setCal({ ownDates: [...cal.ownDates, { m: calMonth(design, page).month + 1, d: 1, label: '' }] })
          }
        >
          + Add a date
        </button>
      </div>
    </Section>
  );
}

/**
 * Words on the months: where they go, the words for every month, a caption per month, font, size and colour.
 * @param props the design and the month shown
 */
function WordsSection({ design, page }: Readonly<FrontProps>) {
  const cal = design.cal,
    theme = resolveTheme(design),
    pageCount = calPages(design),
    strip = design.layout === 'cal-strip',
    hasPhoto = design.layout !== 'cal-plain',
    words = cal.text !== 'off',
    onPhoto = cal.text === 'photo';
  const months = Array.from({ length: pageCount }, (_, pageIndex) => ({
    p: pageIndex,
    ...calMonth(design, pageIndex),
  }));
  const filled = months.filter((month) => cal.captions[month.month]?.trim()).length;
  return (
    <Section id="calf.words" title="Words on the months" note={wordsNote(cal.text)}>
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
              value={design.heading}
              placeholder="e.g. Festivals of India"
              onChange={(event) => setDesign({ heading: event.target.value, showHeading: true })}
            />
          </label>
          <div className="chips">
            {theme.heads.map((x) => (
              <button
                key={x}
                type="button"
                className="chip"
                onClick={() => setDesign({ heading: x, showHeading: true })}
              >
                {x}
              </button>
            ))}
          </div>
          {!strip && (
            <details className="mcaps-box" open={filled > 0}>
              <summary>
                A different caption for each month{' '}
                <small>{filled ? `${filled} of ${pageCount} written` : 'optional'}</small>
              </summary>
              <p className="hint">
                A month with no caption uses the words above. Click a month to see it in the preview.
              </p>
              <ol className="mcaps">
                {months.map(({ p, month, year }) => (
                  <li key={p} className={p === page ? 'on' : undefined}>
                    <label htmlFor={`cap-${p}`}>
                      <b>{(MONTHS.at(month) ?? '').slice(0, 3)}</b>
                      <small>{year}</small>
                    </label>
                    <input
                      id={`cap-${p}`}
                      type="text"
                      value={cal.captions[month] ?? ''}
                      placeholder={design.heading || `${MONTHS[month]} caption`}
                      onFocus={() => setUI({ calPage: p, side: 'front' })}
                      onChange={(event) => setCaption(month, event.target.value)}
                    />
                  </li>
                ))}
              </ol>
              {filled > 0 && (
                <button
                  type="button"
                  className="linkbtn"
                  onClick={() => setCal({ captions: Array.from({ length: 12 }, () => '') })}
                >
                  Clear all captions
                </button>
              )}
            </details>
          )}
          {strip && <p className="hint">The Year strip is a single page, so it shows these words once.</p>}
          <FontPicker
            label="Caption font"
            value={cal.capFont || design.headFont}
            sample={(cal.captions[calMonth(design, page).month] ?? '') || design.heading || 'Makar Sankranti'}
            weight="hw"
            onChange={(capFont) => setCal({ capFont: capFont === design.headFont ? '' : capFont })}
          />
          <SizeSlider
            label="Caption size"
            value={design.textScale}
            onChange={(textScale) => setDesign({ textScale })}
          />
          <div className="inline">
            <Check checked={design.customColor} onChange={(customColor) => setDesign({ customColor })}>
              Own colour
            </Check>
            <input
              type="color"
              aria-label="Caption colour"
              value={design.color}
              onChange={(event) => setDesign({ color: event.target.value, customColor: true })}
            />
          </div>
          {!onPhoto && <p className="hint">Above the month, the caption lines up with the month title.</p>}
        </>
      )}
    </Section>
  );
}

/**
 * A quote and signature on the photo, where they sit, and a darker photo behind them.
 * @param props the design
 */
function PhotoWordsSection({ design }: Readonly<DesignProps>) {
  return (
    <Section id="calf.photo" title="On the photo">
      <p className="hint">A quote and signature can follow the caption when the words sit on the photo.</p>
      <Check checked={design.showQuote} onChange={(showQuote) => setDesign({ showQuote })}>
        Quote
      </Check>
      {design.showQuote && (
        <>
          <textarea
            rows={2}
            aria-label="Quote"
            value={design.quote}
            onChange={(event) => setDesign({ quote: event.target.value })}
          />
          <FontPicker
            label="Quote font"
            value={design.quoteFont}
            sample={design.quote || 'Wish you were here'}
            weight="bw"
            onChange={(quoteFont) => setDesign({ quoteFont })}
          />
        </>
      )}
      <Check checked={design.showSig} onChange={(showSig) => setDesign({ showSig })}>
        Signature
      </Check>
      {design.showSig && (
        <>
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
        </>
      )}
      <Seg<VAlign>
        label="Position on the photo"
        value={design.vAlign}
        options={[
          ['top', 'Top'],
          ['middle', 'Middle'],
          ['bottom', 'Bottom'],
        ]}
        onChange={(vAlign) => setDesign({ vAlign })}
      />
      <Seg<HAlign>
        label="Alignment on the photo"
        value={design.hAlign}
        options={[
          ['left', 'Left'],
          ['center', 'Centre'],
          ['right', 'Right'],
        ]}
        onChange={(hAlign) => setDesign({ hAlign })}
      />
      <Check checked={design.scrim} onChange={(scrim) => setDesign({ scrim })}>
        Darken the photo behind the words
      </Check>
      {design.showQuote && (
        <Check checked={design.ornament} onChange={(ornament) => setDesign({ ornament })}>
          Ornament between caption and quote
        </Check>
      )}
    </Section>
  );
}

/**
 * The Instagram tag in the corner of the photo, and its font.
 * @param props the design
 */
function InstaSection({ design }: Readonly<DesignProps>) {
  return (
    <Section
      id="calf.insta"
      title="Instagram tag"
      note={design.insta ? `@${design.insta}` : undefined}
      defaultOpen={false}
    >
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
            value={design.insta}
            onChange={(event) => setDesign({ insta: event.target.value.replace(/[@\s]/g, '') })}
          />
        </span>
      </label>
      {design.insta && (
        <FontPicker
          label="Tag font"
          value={design.instaFont || 'Hind'}
          sample={design.insta}
          weight="hw"
          onChange={(font) => setDesign({ instaFont: font === 'Hind' ? '' : font })}
        />
      )}
    </Section>
  );
}

/** The calendar's Front step: style, year, title, dates, festivals, words, words on the photo and the Instagram tag. */
export function CalendarFront() {
  const design = useApp((state) => state.design),
    calPage = useApp((state) => state.ui.calPage);
  const page = Math.min(calPage, calPages(design) - 1);
  return (
    <Pane
      title="Front"
      lead="Every setting here applies to all the month pages, so they match when the calendar is bound."
      next="back"
      onNext={() => setUI({ pane: 'back' })}
    >
      <StyleSection design={design} />
      <YearSection design={design} />
      <TitleSection design={design} page={page} />
      <DatesSection design={design} />
      <DaysSection design={design} page={page} />
      <WordsSection design={design} page={page} />
      {design.cal.text === 'photo' && <PhotoWordsSection design={design} />}
      <InstaSection design={design} />
    </Pane>
  );
}
