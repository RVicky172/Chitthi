import { HANDWRITING } from '../../data/fonts';
import { setBack, setUI, useApp } from '../../state/store';
import { Check, Pane } from '../common';
import { FontPicker } from '../FontPicker';

export function BackPane() {
  const b = useApp((s) => s.design.back);
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
