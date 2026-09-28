import { setBack, setDesign, setUI, useApp } from '../../state/store';
import type { CalendarSettings } from '../../types';
import { Check, Pane, Section, Seg, YearField } from '../common';
import { FontPicker } from '../FontPicker';
import { EnvelopeSection } from './EnvelopeSection';

export function BackPane() {
  const b = useApp((s) => s.design.back),
    product = useApp((s) => s.design.product);
  if (product === 'calendar') return <CalendarBack />;
  if (product === 'frame') return <FrameBack />;
  if (product === 'magnet') return <MagnetBack />;
  return (
    <Pane title="Back of the card" next="print file" onNext={() => setUI({ pane: 'print' })}>
      <Section id="back.message" title="Message">
      <label className="f">
        Message (leave empty for ruled lines to write by hand)
        <textarea
          rows={4}
          placeholder={'Dear Nani,\n\nWishing you…'}
          value={b.message}
          onChange={(e) => setBack({ message: e.target.value })}
        />
      </label>
      <FontPicker
        label="Message font"
        value={b.font}
        sample={b.message || 'Dear Nani, wish you were here'}
        weight="bw"
        onChange={(font) => setBack({ font })}
      />
      <label className="f">
        From
        <input type="text" placeholder="Your name" value={b.from} onChange={(e) => setBack({ from: e.target.value })} />
      </label>
      <FontPicker
        label="From font"
        value={b.fromFont || b.font}
        sample={`— ${b.from || 'Asha'}`}
        weight="bw"
        onChange={(f) => setBack({ fromFont: f === b.font ? '' : f })}
      />
      </Section>
      <Section id="back.address" title="Address" note={b.to || undefined}>
      <label className="f">
        To (name)
        <input type="text" value={b.to} onChange={(e) => setBack({ to: e.target.value })} />
      </label>
      <label className="f">
        Address
        <textarea
          rows={3}
          placeholder={'House no., street\nArea, city\nState'}
          value={b.address}
          onChange={(e) => setBack({ address: e.target.value })}
        />
      </label>
      <label className="f">
        PIN code
        <input
          type="text"
          inputMode="numeric"
          maxLength={6}
          value={b.pin}
          onChange={(e) => setBack({ pin: e.target.value.replace(/\D/g, '') })}
        />
      </label>
      <FontPicker
        label="Address font (name, address and PIN)"
        value={b.addrFont || b.font}
        sample={b.to || b.address.split('\n')[0] || 'Nani Ma, 12 Gandhi Road'}
        weight="bw"
        onChange={(f) => setBack({ addrFont: f === b.font ? '' : f })}
      />
      </Section>
      <Section id="back.style" title="Stamp and style">
      <Check checked={b.stamp} onChange={(stamp) => setBack({ stamp })}>
        Stamp box
      </Check>
      <Check checked={b.label} onChange={(label) => setBack({ label })}>
        “Post card” heading
      </Check>
      <FontPicker
        label="Printed labels font (Post card, To, PIN, Stamp)"
        value={b.labelFont || 'Hind'}
        sample="POST CARD  ·  To  ·  PIN  ·  Stamp"
        weight="hw"
        onChange={(f) => setBack({ labelFont: f === 'Hind' ? '' : f })}
      />
      <Check checked={b.tint} onChange={(tint) => setBack({ tint })}>
        Tint the back with the card colour
      </Check>
      </Section>
      <EnvelopeSection />
    </Pane>
  );
}

/** Calendar back: the year at a glance under a title. */
function CalendarBack() {
  const d = useApp((s) => s.design);
  return (
    <Pane
      title="Year at a glance"
      lead="The back page shows all twelve months. Use it as the calendar's cover or last page."
      next="print file"
      onNext={() => setUI({ pane: 'print' })}
    >
      <Section id="back.year" title="Year page">
      <YearField value={d.cal.year} onChange={(year) => setDesign({ cal: { ...d.cal, year } })} />
      <Check checked={d.showHeading} onChange={(showHeading) => setDesign({ showHeading })}>
        Title (otherwise the year is shown)
      </Check>
      <input type="text" aria-label="Title" value={d.heading} onChange={(e) => setDesign({ heading: e.target.value })} />
      <FontPicker
        label="Title font"
        value={d.cal.titleFont || d.cal.font || d.headFont}
        sample={(d.showHeading && d.heading) || String(d.cal.year)}
        weight="hw"
        onChange={(f) => setDesign({ cal: { ...d.cal, titleFont: f === (d.cal.font || d.headFont) ? '' : f } })}
      />
      <Check checked={d.cal.backQuote} onChange={(backQuote) => setDesign({ cal: { ...d.cal, backQuote } })}>
        Subtitle under the title
      </Check>
      {d.cal.backQuote && (
        <>
          <textarea rows={2} aria-label="Subtitle" value={d.quote} onChange={(e) => setDesign({ quote: e.target.value })} />
          <FontPicker
            label="Subtitle font (shared with the quote)"
            value={d.quoteFont}
            sample={d.quote || 'A year of festivals'}
            weight="bw"
            onChange={(quoteFont) => setDesign({ quoteFont })}
          />
        </>
      )}
      <Seg<CalendarSettings['titleAlign']>
        label="Title alignment"
        value={d.cal.titleAlign}
        options={[
          ['left', 'Left'],
          ['center', 'Centred'],
        ]}
        onChange={(titleAlign) => setDesign({ cal: { ...d.cal, titleAlign } })}
      />
      <p className="hint">The title, the subtitle and the twelve month names share this alignment with the month pages, so front and back match.</p>
      <Check checked={d.back.tint} onChange={(tint) => setBack({ tint })}>
        Tint the page with the theme colour
      </Check>
      </Section>
      <EnvelopeSection />
    </Pane>
  );
}

/** Frame print back: an optional dedication label. */
function FrameBack() {
  const d = useApp((s) => s.design),
    b = d.back;
  return (
    <Pane
      title="Dedication label"
      lead="Optional. Print it on the back of the photo, or on sticker paper for the back of the frame. Turn it on with “Include back” in Print."
      next="print file"
      onNext={() => setUI({ pane: 'print' })}
    >
      <Section id="back.label" title="Dedication label">
      <label className="f">
        Title (uses the design name, or the greeting)
        <input type="text" value={d.designName} placeholder={d.heading} onChange={(e) => setDesign({ designName: e.target.value })} />
      </label>
      <label className="f">
        Message (leave empty for lines to write by hand)
        <textarea rows={4} placeholder="For Maa and Papa, on your 40th anniversary…" value={b.message} onChange={(e) => setBack({ message: e.target.value })} />
      </label>
      <FontPicker
        label="Message font"
        value={b.font}
        sample={b.message || 'With all our love'}
        weight="bw"
        onChange={(font) => setBack({ font })}
      />
      <label className="f">
        From
        <input type="text" placeholder="Your name" value={b.from} onChange={(e) => setBack({ from: e.target.value })} />
      </label>
      <FontPicker
        label="From font"
        value={b.fromFont || b.font}
        sample={`— ${b.from || 'Riya'}`}
        weight="bw"
        onChange={(f) => setBack({ fromFont: f === b.font ? '' : f })}
      />
      <label className="f">
        Date (leave empty for the day it's printed)
        <input
          type="text"
          placeholder={new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}
          value={b.date}
          onChange={(e) => setBack({ date: e.target.value })}
        />
      </label>
      <FontPicker
        label="Date font"
        value={b.labelFont || 'Hind'}
        sample={new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}
        weight="hw"
        onChange={(f) => setBack({ labelFont: f === 'Hind' ? '' : f })}
      />
      <Check checked={b.tint} onChange={(tint) => setBack({ tint })}>
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
