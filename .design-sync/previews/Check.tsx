import { useState } from 'react';
import { Check } from 'chitthi-postcard-studio';

export const Checked = () => {
  const [on, setOn] = useState(true);
  return (
    <Check checked={on} onChange={setOn}>
      Darken the photo behind text
    </Check>
  );
};

export const Unchecked = () => {
  const [on, setOn] = useState(false);
  return (
    <Check checked={on} onChange={setOn}>
      Include back (dedication label)
    </Check>
  );
};

export const OptionList = () => {
  const [v, setV] = useState({ stamp: true, label: true, tint: false });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Check checked={v.stamp} onChange={(stamp) => setV({ ...v, stamp })}>
        Stamp box
      </Check>
      <Check checked={v.label} onChange={(label) => setV({ ...v, label })}>
        “Post card” heading
      </Check>
      <Check checked={v.tint} onChange={(tint) => setV({ ...v, tint })}>
        Tint the back with the card colour
      </Check>
    </div>
  );
};
