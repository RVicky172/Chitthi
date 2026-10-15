import { setBack, setDesign, setUI, useApp } from '../../state/store';
import type { CalendarSettings } from '../../types';
import { Check, Pane, Section, Seg, YearField } from '../common';
import { FontPicker } from '../FontPicker';
import { AiWordsEntry } from '../ai/AiEntry';
import { EnvelopeSection } from './EnvelopeSection';

/** The Back step: the message, signature and address of a card, or the calendar's back. */
export function BackPane() {
  const back = useApp((state) => state.design.back),
    product = useApp((state) => state.design.product);
  if (product === 'calendar') return <CalendarBack />;
  if (product === 'frame') return <FrameBack />;
  if (product === 'magnet') return <MagnetBack />;
  return (
    <Pane title="Back of the card" next="print file" onNext={() => setUI({ pane: 'print' })}>
      <Section id="back.message" title="Message">
        <AiWordsEntry mode="message" />
        <label className="f">
          Message (leave empty for ruled lines to write by hand)
          <textarea
            rows={4}
            placeholder={'Dear Nani,\n\nWishing you…'}
            value={back.message}
            onChange={(event) => setBack({ message: event.target.value })}
          />
        </label>
        <FontPicker
          label="Message font"
          value={back.font}
          sample={back.message || 'Dear Nani, wish you were here'}
          weight="bw"
          onChange={(font) => setBack({ font })}
        />
        <label className="f">
          From
          <input
            type="text"
            placeholder="Your name"
            value={back.from}
            onChange={(event) => setBack({ from: event.target.value })}
          />
        </label>
        <FontPicker
          label="From font"
          value={back.fromFont || back.font}
          sample={`— ${back.from || 'Asha'}`}
          weight="bw"
          onChange={(font) => setBack({ fromFont: font === back.font ? '' : font })}
        />
      </Section>
      <Section id="back.address" title="Address" note={back.to || undefined}>
        <label className="f">
          To (name)
          <input type="text" value={back.to} onChange={(event) => setBack({ to: event.target.value })} />
        </label>
        <label className="f">
          Address
          <textarea
            rows={3}
            placeholder={'House no., street\nArea, city\nState'}
            value={back.address}
            onChange={(event) => setBack({ address: event.target.value })}
          />
        </label>
        <label className="f">
          PIN code
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={back.pin}
            onChange={(event) => setBack({ pin: event.target.value.replace(/\D/g, '') })}
          />
        </label>
        <FontPicker
          label="Address font (name, address and PIN)"
          value={back.addrFont || back.font}
          sample={back.to || back.address.split('\n')[0] || 'Nani Ma, 12 Gandhi Road'}
          weight="bw"
          onChange={(font) => setBack({ addrFont: font === back.font ? '' : font })}
        />
      </Section>
      <Section id="back.style" title="Stamp and style">
        <Check checked={back.stamp} onChange={(stamp) => setBack({ stamp })}>
          Stamp box
        </Check>
        <Check checked={back.label} onChange={(label) => setBack({ label })}>
          “Post card” heading
        </Check>
        <FontPicker
          label="Printed labels font (Post card, To, PIN, Stamp)"
          value={back.labelFont || 'Hind'}
          sample="POST CARD  ·  To  ·  PIN  ·  Stamp"
          weight="hw"
          onChange={(font) => setBack({ labelFont: font === 'Hind' ? '' : font })}
        />
        <Check checked={back.tint} onChange={(tint) => setBack({ tint })}>
          Tint the back with the card colour
        </Check>
      </Section>
      <EnvelopeSection />
    </Pane>
  );
}

/** Calendar back: the year at a glance under a title. */
function CalendarBack() {
  const design = useApp((state) => state.design);
  return (
    <Pane
      title="Year at a glance"
      lead="The back page shows all twelve months. Use it as the calendar's cover or last page."
      next="print file"
      onNext={() => setUI({ pane: 'print' })}
    >
      <Section id="back.year" title="Year page">
        <YearField value={design.cal.year} onChange={(year) => setDesign({ cal: { ...design.cal, year } })} />
        <Check checked={design.showHeading} onChange={(showHeading) => setDesign({ showHeading })}>
          Title (otherwise the year is shown)
        </Check>
        <input
          type="text"
          aria-label="Title"
          value={design.heading}
          onChange={(event) => setDesign({ heading: event.target.value })}
        />
        <FontPicker
          label="Title font"
          value={design.cal.titleFont || design.cal.font || design.headFont}
          sample={(design.showHeading && design.heading) || String(design.cal.year)}
          weight="hw"
          onChange={(font) =>
            setDesign({ cal: { ...design.cal, titleFont: font === (design.cal.font || design.headFont) ? '' : font } })
          }
        />
        <Check
          checked={design.cal.backQuote}
          onChange={(backQuote) => setDesign({ cal: { ...design.cal, backQuote } })}
        >
          Subtitle under the title
        </Check>
        {design.cal.backQuote && (
          <>
            <textarea
              rows={2}
              aria-label="Subtitle"
              value={design.quote}
              onChange={(event) => setDesign({ quote: event.target.value })}
            />
            <FontPicker
              label="Subtitle font (shared with the quote)"
              value={design.quoteFont}
              sample={design.quote || 'A year of festivals'}
              weight="bw"
              onChange={(quoteFont) => setDesign({ quoteFont })}
            />
          </>
        )}
        <Seg<CalendarSettings['titleAlign']>
          label="Title alignment"
          value={design.cal.titleAlign}
          options={[
            ['left', 'Left'],
            ['center', 'Centred'],
          ]}
          onChange={(titleAlign) => setDesign({ cal: { ...design.cal, titleAlign } })}
        />
        <p className="hint">
          The title, the subtitle and the twelve month names share this alignment with the month pages, so front and
          back match.
        </p>
        <Check checked={design.back.tint} onChange={(tint) => setBack({ tint })}>
          Tint the page with the theme colour
        </Check>
      </Section>
      <EnvelopeSection />
    </Pane>
  );
}

/** Frame print back: an optional dedication label. */
function FrameBack() {
  const design = useApp((state) => state.design),
    back = design.back;
  return (
    <Pane
      title="Dedication label"
      lead="Optional. Print it on the back of the photo, or on sticker paper for the back of the frame. Turn it on with “Include back” in Print."
      next="print file"
      onNext={() => setUI({ pane: 'print' })}
    >
      <Section id="back.label" title="Dedication label">
        <AiWordsEntry mode="message" />
        <label className="f">
          Title (uses the design name, or the greeting)
          <input
            type="text"
            value={design.designName}
            placeholder={design.heading}
            onChange={(event) => setDesign({ designName: event.target.value })}
          />
        </label>
        <label className="f">
          Message (leave empty for lines to write by hand)
          <textarea
            rows={4}
            placeholder="For Maa and Papa, on your 40th anniversary…"
            value={back.message}
            onChange={(event) => setBack({ message: event.target.value })}
          />
        </label>
        <FontPicker
          label="Message font"
          value={back.font}
          sample={back.message || 'With all our love'}
          weight="bw"
          onChange={(font) => setBack({ font })}
        />
        <label className="f">
          From
          <input
            type="text"
            placeholder="Your name"
            value={back.from}
            onChange={(event) => setBack({ from: event.target.value })}
          />
        </label>
        <FontPicker
          label="From font"
          value={back.fromFont || back.font}
          sample={`— ${back.from || 'Riya'}`}
          weight="bw"
          onChange={(font) => setBack({ fromFont: font === back.font ? '' : font })}
        />
        <label className="f">
          Date (leave empty for the day it's printed)
          <input
            type="text"
            placeholder={new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}
            value={back.date}
            onChange={(event) => setBack({ date: event.target.value })}
          />
        </label>
        <FontPicker
          label="Date font"
          value={back.labelFont || 'Hind'}
          sample={new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}
          weight="hw"
          onChange={(font) => setBack({ labelFont: font === 'Hind' ? '' : font })}
        />
        <Check checked={back.tint} onChange={(tint) => setBack({ tint })}>
          Tint with the theme colour
        </Check>
      </Section>
      <EnvelopeSection />
    </Pane>
  );
}

/** Magnets have nothing printed on the back: explain what goes there instead. */
function MagnetBack() {
  return (
    <Pane
      title="Magnetic back"
      lead="The back of a fridge magnet is the magnetic sheet, so nothing is printed on it. Below: a matching envelope to post or gift it in."
      next="print file"
      onNext={() => setUI({ pane: 'print' })}
    >
      <Section id="back.magnet" title="About the back">
        <ul className="tips">
          <li>Easiest: print straight onto inkjet printable magnet sheet (A4), then cut.</li>
          <li>Sturdier: print on photo paper and stick it onto self-adhesive magnetic sheet (0.5–0.76 mm).</li>
          <li>Round button magnets: the bleed wraps around the badge, so keep words inside the blue safe circle.</li>
          <li>Round the corners of square and card magnets with a 3 mm corner punch.</li>
        </ul>
      </Section>
      <EnvelopeSection />
    </Pane>
  );
}
