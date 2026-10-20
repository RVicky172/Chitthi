import { useDeferredValue, useEffect, useRef } from 'react';
import { envelopeSpec, envelopeSummary } from '../../engine/envelope';
import { renderEnvelope, type EnvelopeFace } from '../../engine/envelopeDraw';
import { open3D } from '../../state/actions';
import { setBack, setDesign, useApp } from '../../state/store';
import type { Design, EnvelopeSettings, Photo } from '../../types';
import { postmarkYear } from '../../engine/design';
import { Check, Seg, YearField } from '../common';
import { FoldSection } from '../panel';
import { CubeIcon } from '../icons';

/** One face of the envelope and what it is drawn from. */
interface EnvelopeThumbProps {
  face: EnvelopeFace;
  design: Design;
  photos: Photo[];
  /** Changes when fonts load: redraw. */
  fontTick: number;
}

/**
 * A small drawing of one face of the envelope.
 * @param props the face, the design, its photos and the font tick
 */
function EnvelopeThumb({ face, design, photos, fontTick }: Readonly<EnvelopeThumbProps>) {
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
  const design = useApp((state) => state.design),
    photos = useApp((state) => state.photos),
    fontTick = useApp((state) => state.ui.fontTick);
  const dd = useDeferredValue(design),
    pp = useDeferredValue(photos);
  const envelope = design.env,
    set = (patch: Partial<EnvelopeSettings>) => setDesign({ env: { ...design.env, ...patch } }),
    spec = envelopeSpec(design);
  return (
    <FoldSection id="env" title="Envelope" note={envelope.on ? spec.name : 'off'}>
      <Check checked={envelope.on} onChange={(on) => set({ on })}>
        Make a matching envelope ({spec.name})
      </Check>
      {envelope.on && (
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
          <p className="hint">{envelopeSummary(design)}. Both are added to the print pack automatically.</p>
          <button type="button" className="btn" onClick={() => void open3D(undefined, 'envelope')}>
            <CubeIcon />
            See it in 3D
          </button>
          <Seg<EnvelopeSettings['style']>
            label="Flap"
            value={envelope.style}
            options={[
              ['pointed', 'Pointed flap'],
              ['straight', 'Straight flap'],
              ['wallet', 'Curved flap'],
            ]}
            onChange={(style) => set({ style })}
          />
          <Seg<EnvelopeSettings['paper']>
            label="Envelope paper"
            value={envelope.paper}
            options={[
              ['occasion', 'Occasion'],
              ['cream', 'Cream'],
              ['white', 'White'],
              ['kraft', 'Kraft'],
            ]}
            onChange={(paper) => set({ paper })}
          />
          <div className="inline">
            <Check checked={envelope.art} onChange={(art) => set({ art })}>
              Occasion artwork
            </Check>
            <Check checked={envelope.photo} onChange={(photo) => set({ photo })}>
              Your photo in the seal
            </Check>
          </div>
          <PostmarkYear />
          <label className="f">
            Return address (under your name from the back)
            <textarea
              rows={2}
              placeholder={'Flat 4B, Rose Apartments\nPune 411001'}
              value={envelope.sender}
              onChange={(x) => set({ sender: x.target.value })}
            />
          </label>
          {design.product !== 'postcard' && (
            <>
              <label className="f">
                From (your name)
                <input type="text" value={design.back.from} onChange={(x) => setBack({ from: x.target.value })} />
              </label>
              <label className="f">
                To (name)
                <input type="text" value={design.back.to} onChange={(x) => setBack({ to: x.target.value })} />
              </label>
              <label className="f">
                Address
                <textarea rows={3} value={design.back.address} onChange={(x) => setBack({ address: x.target.value })} />
              </label>
              <label className="f">
                PIN code
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={design.back.pin}
                  onChange={(x) => setBack({ pin: x.target.value.replace(/\D/g, '') })}
                />
              </label>
            </>
          )}
          {design.product === 'postcard' && (
            <p className="hint">The address and PIN come from the fields above, so envelope and card match.</p>
          )}
        </>
      )}
    </FoldSection>
  );
}

/** The year on postmarks (the envelope, and the Postage stamp layout): automatic, or one you choose. */
export function PostmarkYear() {
  const design = useApp((state) => state.design);
  const auto =
    design.product === 'calendar'
      ? `the calendar’s year (${design.cal.year})`
      : `this year (${new Date().getFullYear()})`;
  return (
    <div className="postyear">
      <Seg<'auto' | 'own'>
        label="Postmark year"
        value={design.postYear ? 'own' : 'auto'}
        options={[
          ['auto', 'Postmark: automatic'],
          ['own', 'Choose the year'],
        ]}
        onChange={(year) => setDesign({ postYear: year === 'own' ? postmarkYear(design) : 0 })}
      />
      {design.postYear ? (
        <YearField label="Postmark year" value={design.postYear} onChange={(postYear) => setDesign({ postYear })} />
      ) : (
        <p className="hint">The postmark shows {auto}.</p>
      )}
    </div>
  );
}
