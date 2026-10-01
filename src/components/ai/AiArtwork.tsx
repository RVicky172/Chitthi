import { useEffect, useRef, useState } from 'react';
import { ART_STYLES, type ArtStyle } from '../../ai/prompts/artwork';
import { aiPhotoName, aiReadyAsync, blobToJpegDataUrl, generateArt, slotShape, suggestSubject, thumbUrl, type Readiness } from '../../ai/service';
import { AiError } from '../../ai/types';
import { calPages } from '../../engine/design';
import { toast } from '../../lib/toast';
import { putOnCard, storePhotos } from '../../state/library';
import { usePhotoSlots } from '../../state/photoSlots';
import { setUI, useApp } from '../../state/store';
import { Check } from '../common';
import { logError } from '../../lib/errors';

/*
 * "Create a picture with AI": pictures shaped for the selected photo slot, from a description the design suggests.
 * Memory: only small previews are shown; the full pictures stay as Blobs until one is chosen (then saved to the
 * photo library like an upload) or the panel closes, and every preview URL is revoked.
 */

interface Candidate {
  thumb: string;
  blob: Blob;
}

export default function AiArtwork({ wide = false }: { wide?: boolean }) {
  const d = useApp((s) => s.design),
    calPage = useApp((s) => s.ui.calPage);
  const { active, count } = usePhotoSlots();
  const page = Math.min(calPage, calPages(d) - 1);
  const [ready, setReady] = useState<Readiness | null>(null);
  const [subject, setSubject] = useState(() => suggestSubject(d, page));
  const [style, setStyle] = useState<ArtStyle>('photo');
  const [people, setPeople] = useState(false);
  const [n, setN] = useState(2);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [cands, setCands] = useState<Candidate[]>([]);
  const [meta, setMeta] = useState<{ provider: string; model: string } | null>(null);
  const ctl = useRef<AbortController | null>(null);
  const live = useRef<Candidate[]>([]);
  live.current = cands;

  useEffect(() => {
    void aiReadyAsync('image').then(setReady);
    return () => {
      ctl.current?.abort();
      for (const c of live.current) URL.revokeObjectURL(c.thumb);
    };
  }, []);

  const clear = () => {
    for (const c of cands) URL.revokeObjectURL(c.thumb);
    setCands([]);
  };
  const shape = slotShape(d, active);

  const run = async () => {
    ctl.current?.abort();
    const c = new AbortController();
    ctl.current = c;
    clear();
    setBusy(true);
    setErr('');
    try {
      const r = await generateArt(d, active, { subject: subject.trim() || suggestSubject(d, page), style, people, n }, c.signal);
      setMeta({ provider: r.provider, model: r.model });
      const out: Candidate[] = [];
      for (const blob of r.blobs) out.push({ blob, thumb: await thumbUrl(blob) });
      setCands(out);
    } catch (e) {
      if (!(e instanceof AiError && e.kind === 'cancelled')) setErr(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const use = async (cand: Candidate) => {
    if (!meta) return;
    setUI({ loading: 'Adding the picture…' });
    try {
      const ph = { name: aiPhotoName(subject, meta.provider, meta.model), url: await blobToJpegDataUrl(cand.blob) };
      await storePhotos([ph]);
      await putOnCard({ id: '', added: Date.now(), ...ph });
      toast(`Added${count > 1 ? ` to slot ${active + 1}` : ''}. AI picture made with ${meta.provider}.`);
    } catch (e) {
      logError('handled', e);
      toast('That picture couldn’t be added. Try again.');
    } finally {
      setUI({ loading: null });
    }
  };

  if (ready && !ready.ready)
    return (
      <div className="aiw">
        <p className="hint">{ready.reason}</p>
        <button type="button" className="btn" onClick={() => setUI({ settings: true })}>
          Open Settings → AI
        </button>
      </div>
    );

  return (
    <div className={`aiw${wide ? ' wide' : ''}`}>
      <label className="f">
        Describe the picture
        <textarea rows={2} value={subject} maxLength={400} onChange={(e) => setSubject(e.target.value)} />
      </label>
      <div className="row">
        <label className="f">
          Style
          <select value={style} onChange={(e) => setStyle(e.target.value as ArtStyle)}>
            {ART_STYLES.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="f">
          Pictures to choose from
          <select value={n} onChange={(e) => setN(+e.target.value)}>
            {[1, 2, 3, 4].map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Check checked={people} onChange={setPeople}>
        People may appear (never a real person)
      </Check>
      <p className="hint">
        Shaped for {count > 1 ? `slot ${active + 1}` : 'the photo'} ({shape.aspect}){shape.space ? `, calm at the ${shape.space} for the words` : ''}. No
        lettering or logos. Uses {n} of today’s picture requests and your {ready?.providerName ?? 'provider'} credit.
      </p>
      <div className="inline">
        <button type="button" className="btn primary" disabled={busy} onClick={() => void run()}>
          {busy ? 'Creating…' : 'Create'}
        </button>
        {busy && (
          <button type="button" className="btn ghost" onClick={() => ctl.current?.abort()}>
            Cancel
          </button>
        )}
        {ready?.providerName && (
          <small className="hint">
            {ready.providerName} · {ready.model}
          </small>
        )}
      </div>
      {err && (
        <p className="hint bad" role="alert">
          {err}
        </p>
      )}
      {cands.length > 0 && (
        <ul className="aigrid">
          {cands.map((c, i) => (
            <li key={c.thumb}>
              <img src={c.thumb} alt={`Choice ${i + 1}`} />
              <button type="button" className="btn" onClick={() => void use(c)}>
                Use this
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="hint">AI pictures are marked as such in your library, the print pack’s credits and the Print step.</p>
    </div>
  );
}
