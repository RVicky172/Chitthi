import { useState } from 'react';
import { Check, Section, Seg } from 'chitthi-studio';

localStorage.clear();

export const Open = () => {
  const [align, setAlign] = useState('center');
  const [show, setShow] = useState(true);
  return (
    <div className="panel" style={{ width: 400 }}>
      <Section id="preview-greeting" title="Greeting" note={show ? 'Shown' : 'Hidden'}>
        <Check checked={show} onChange={setShow}>
          Show the greeting
        </Check>
        <Seg label="Alignment" value={align} options={[['left', 'Left'], ['center', 'Centre'], ['right', 'Right']]} onChange={setAlign} />
      </Section>
    </div>
  );
};

export const Collapsed = () => (
  <div className="panel" style={{ width: 400 }}>
    <Section id="preview-captions" title="Words on the months" note="8 of 12 written" defaultOpen={false}>
      <p className="hint">A caption for each month.</p>
    </Section>
    <Section id="preview-festivals" title="Festivals and your dates" note="14 marked" defaultOpen={false}>
      <p className="hint">National days and festivals in red.</p>
    </Section>
  </div>
);
