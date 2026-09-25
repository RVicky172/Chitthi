import { HANDWRITING } from '../../data/fonts';
import { setBack, setDesign, setUI, useApp } from '../../state/store';
import { Check, Pane } from '../common';
import { FontPicker } from '../FontPicker';

export function BackPane() {
  const b = useApp((s) => s.design.back),
    product = useApp((s) => s.design.product);
  if (product === 'calendar') return <CalendarBack />;
  if (product === 'frame') return <FrameBack />;
  return (
    <Pane title="Back of the card" next="print file" onNext={() => setUI({ pane: 'print' })}>
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
        label="Handwriting font"
        value={b.font}
        sample={b.message || 'Dear Nani, wish you were here'}
        weight="bw"
        only={HANDWRITING}
        onChange={(font) => setBack({ font })}
      />
      <label className="f">
        From
        <input type="text" placeholder="Your name" value={b.from} onChange={(e) => setBack({ from: e.target.value })} />
      </label>
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
      <Check checked={b.stamp} onChange={(stamp) => setBack({ stamp })}>
        Stamp box
      </Check>
      <Check checked={b.label} onChange={(label) => setBack({ label })}>
        “Post card” heading
      </Check>
      <Check checked={b.tint} onChange={(tint) => setBack({ tint })}>
        Tint the back with the card colour
      </Check>
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
      <Check checked={d.showHeading} onChange={(showHeading) => setDesign({ showHeading })}>
        Title (otherwise the year is shown)
      </Check>
      <input type="text" aria-label="Title" value={d.heading} onChange={(e) => setDesign({ heading: e.target.value })} />
      <Check checked={d.back.tint} onChange={(tint) => setBack({ tint })}>
        Tint the page with the theme colour
      </Check>
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
      <label className="f">
        Title (uses the design name, or the greeting)
        <input type="text" value={d.designName} placeholder={d.heading} onChange={(e) => setDesign({ designName: e.target.value })} />
      </label>
      <label className="f">
        Message (leave empty for lines to write by hand)
        <textarea rows={4} placeholder="For Maa and Papa, on your 40th anniversary…" value={b.message} onChange={(e) => setBack({ message: e.target.value })} />
      </label>
      <FontPicker
        label="Handwriting font"
        value={b.font}
        sample={b.message || 'With all our love'}
        weight="bw"
        only={HANDWRITING}
        onChange={(font) => setBack({ font })}
      />
      <label className="f">
        From
        <input type="text" placeholder="Your name" value={b.from} onChange={(e) => setBack({ from: e.target.value })} />
      </label>
      <Check checked={b.tint} onChange={(tint) => setBack({ tint })}>
        Tint with the theme colour
      </Check>
    </Pane>
  );
}
