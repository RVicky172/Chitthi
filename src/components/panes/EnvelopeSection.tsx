import { useDeferredValue, useEffect, useRef } from 'react';
import { envelopeSpec, envelopeSummary, renderEnvelope, type EnvelopeFace } from '../../engine/envelope';
import { open3D } from '../../state/actions';
import { setBack, setDesign, useApp } from '../../state/store';
import type { Design, EnvelopeSettings, Photo } from '../../types';
import { Check, Section, Seg } from '../common';
import { CubeIcon } from '../icons';

function EnvelopeThumb({ face, design, photos, fontTick }: { face: EnvelopeFace; design: Design; photos: Photo[]; fontTick: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) renderEnvelope(ref.current, face, 300 / envelopeSpec(design).w, { d: design, photos });
  }, [face, design, photos, fontTick]);
  return <canvas ref={ref} className="env-thumb" aria-hidden="true" />;
}

/**
 * The matching envelope, in the Back step of every product: sized to the smallest standard envelope the piece fits,
 * styled from the design, and exported with the print pack (print-on-envelope PDF and a fold-your-own template).
 */
export function EnvelopeSection() {
  const d = useApp((s) => s.design),
    photos = useApp((s) => s.photos),
    fontTick = useApp((s) => s.ui.fontTick);
  const dd = useDeferredValue(d),
    pp = useDeferredValue(photos);
  const e = d.env,
    set = (p: Partial<EnvelopeSettings>) => setDesign({ env: { ...d.env, ...p } }),
    spec = envelopeSpec(d);
  return (
    <Section id="env" title="Envelope" note={e.on ? spec.name : 'off'}>
      <Check checked={e.on} onChange={(on) => set({ on })}>
        Make a matching envelope ({spec.name})
      </Check>
      {e.on && (
        <>
          <div className="env-previews">
            <figure>
              <EnvelopeThumb face="front" design={dd} photos={pp} fontTick={fontTick} />
              <figcaption>Address side</figcaption>
            </figure>
            <figure>
              <EnvelopeThumb face="back" design={dd} photos={pp} fontTick={fontTick} />
              <figcaption>Flap side</figcaption>
            </figure>
          </div>
          <p className="hint">{envelopeSummary(d)}. Both are added to the print pack automatically.</p>
          <button type="button" className="btn" onClick={() => void open3D(undefined, 'envelope')}>
            <CubeIcon />
            See it in 3D
          </button>
          <Seg<EnvelopeSettings['style']>
            label="Flap"
            value={e.style}
            options={[
              ['pointed', 'Pointed flap'],
              ['straight', 'Straight flap'],
              ['wallet', 'Curved flap'],
            ]}
            onChange={(style) => set({ style })}
          />
          <Seg<EnvelopeSettings['paper']>
            label="Envelope paper"
            value={e.paper}
            options={[
              ['occasion', 'Occasion'],
              ['cream', 'Cream'],
              ['white', 'White'],
              ['kraft', 'Kraft'],
            ]}
            onChange={(paper) => set({ paper })}
          />
          <div className="inline">
            <Check checked={e.art} onChange={(art) => set({ art })}>
              Occasion artwork
            </Check>
            <Check checked={e.photo} onChange={(photo) => set({ photo })}>
              Your photo in the seal
            </Check>
          </div>
          <label className="f">
            Return address (under your name from the back)
            <textarea rows={2} placeholder={'Flat 4B, Rose Apartments\nPune 411001'} value={e.sender} onChange={(x) => set({ sender: x.target.value })} />
          </label>
          {d.product !== 'postcard' && (
            <>
              <label className="f">
                From (your name)
                <input type="text" value={d.back.from} onChange={(x) => setBack({ from: x.target.value })} />
              </label>
              <label className="f">
                To (name)
                <input type="text" value={d.back.to} onChange={(x) => setBack({ to: x.target.value })} />
              </label>
              <label className="f">
                Address
                <textarea rows={3} value={d.back.address} onChange={(x) => setBack({ address: x.target.value })} />
              </label>
              <label className="f">
                PIN code
                <input type="text" inputMode="numeric" maxLength={6} value={d.back.pin} onChange={(x) => setBack({ pin: x.target.value.replace(/\D/g, '') })} />
              </label>
            </>
          )}
          {d.product === 'postcard' && <p className="hint">The address and PIN come from the fields above, so envelope and card match.</p>}
        </>
      )}
    </Section>
  );
}
