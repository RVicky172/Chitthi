import { useState } from 'react';
import { productOf } from '../../data/products';
import { sizeOf } from '../../engine/design';
import { exportSummary, nup, pagesOf } from '../../engine/export';
import { QUOTE_QTY } from '../../data/printSpecs';
import { envelopeSummary, templateSheet } from '../../engine/envelope';
import { applyInstaxPreset, downloadEnvelope, downloadPack, downloadPNG, downloadPrintFile, downloadQuote, open3D } from '../../state/actions';
import { setBack, setExp, useApp } from '../../state/store';
import type { ExportFormat, ExportSettings, SheetId } from '../../types';
import { creditOf, isPexels } from '../../lib/credits';
import { Check, Pane, Section } from '../common';
import { PackIcon } from '../icons';

const SHEET_OPTS: [SheetId, string][] = [
  ['a4', 'A4 (210×297 mm)'],
  ['a3', 'A3 (297×420 mm)'],
  ['1319', '13×19 in (print shop sheet)'],
  ['letter', 'US Letter'],
];
const FORMATS: [ExportFormat, string, string][] = [
  ['pdf', 'Print shop PDF', 'One page per side at the exact size, with bleed and crop marks.'],
  ['sheet', 'Sheet PDF (A4 and more)', 'As many as fit on one sheet, fronts and backs lined up for double-sided printing.'],
  ['png', 'PNG images only', 'Separate front and back images tagged with their print resolution.'],
];

export function PrintPane() {
  const d = useApp((s) => s.design),
    photos = useApp((s) => s.photos);
  const e = d.exp,
    prod = productOf(d.product),
    pages = pagesOf(d);
  const [busy, setBusy] = useState<string | null>(null);
  const [step, setStep] = useState('');
  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(null);
      setStep('');
    }
  };

  return (
    <Pane title="Print and export">
      <div className="pack">
        <div>
          <b>
            <PackIcon />
            Print pack
          </b>
          <small>
            One ZIP with the print PDF
            {e.pngs !== false && (
              <>
                , {pages.filter((p) => p.side === 'front').length > 1 ? 'every front page' : 'the front'}
                {e.back ? ' and back' : ''} as separate PNG files
              </>
            )}
            , and a <code>PRINT-SPEC.txt</code> for the print
            shop with trim size, {+e.bleed ? `${e.bleed === '3.175' ? '⅛ in' : `${e.bleed} mm`} bleed` : 'bleed'}, safe area,
            resolution and paper.
            {d.env.on && ' It also holds the matching envelope: a PDF to print on a ready-made envelope and a fold-your-own template.'}{' '}
            And a <code>QUOTE-REQUEST.pdf</code> to send to print shops: previews, paper, finishing and a price grid by quantity.
          </small>
        </div>
        <button type="button" className="btn primary" disabled={!!busy} onClick={() => run('pack', () => downloadPack(setStep))}>
          {busy === 'pack' ? step || 'Preparing…' : 'Download print pack'}
        </button>
      </div>

      <PexelsNotice />

      <Section id="print.settings" title="Settings" note={`${e.dpi} dpi, ${+e.bleed ? `${e.bleed} mm bleed` : 'no bleed'}`}>
      <div className="row">
        <label className="f">
          Bleed
          <select value={e.bleed} onChange={(x) => setExp({ bleed: x.target.value })}>
            <option value="0">None</option>
            <option value="3">3 mm (India, Europe)</option>
            <option value="3.175">⅛ in (US)</option>
            <option value="5">5 mm (large prints, some labs)</option>
          </select>
        </label>
        <label className="f">
          Resolution
          <select value={e.dpi} onChange={(x) => setExp({ dpi: x.target.value })}>
            <option value="300">300 dpi (print)</option>
            <option value="150">150 dpi (draft)</option>
          </select>
        </label>
      </div>
      <div className="row">
        <label className="f">
          Image quality in PDF
          <select value={e.quality} onChange={(x) => setExp({ quality: x.target.value as ExportSettings['quality'] })}>
            <option value="jpeg">High (smaller file)</option>
            <option value="png">Lossless (larger file)</option>
          </select>
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 6 }}>
          <Check checked={e.marks} onChange={(marks) => setExp({ marks })}>
            Crop marks
          </Check>
          {d.product !== 'magnet' && (
            <Check checked={e.back} onChange={(back) => setExp({ back })}>
              Include back ({prod.backLabel.toLowerCase()})
            </Check>
          )}
        </div>
      </div>
      <Check checked={e.pngs !== false} onChange={(pngs) => setExp({ pngs })}>
        PNG images in the print pack{pages.length > 3 ? ` (${pages.length} pages: turn off for a much smaller ZIP)` : ''}
      </Check>
      </Section>
      <Section id="print.format" title="File type">
      <div className="fmt" role="radiogroup" aria-label="File type">
        {FORMATS.map(([v, t, s]) => (
          <label key={v}>
            <input
              type="radio"
              name="fmt"
              checked={e.format === v}
              onChange={() => {
                // Switching to sheets moves off a sheet the piece doesn't fit on, to the smallest one it does.
                const fits = (id: SheetId) => {
                  const n = nup({ ...d, exp: { ...e, sheet: id } });
                  return n.cols * n.rows > 0;
                };
                const sheet = v === 'sheet' && !fits(e.sheet) ? (SHEET_OPTS.map(([id]) => id).find(fits) ?? e.sheet) : e.sheet;
                setExp({ format: v, sheet });
              }}
            />
            <span>
              <b>{t}</b>
              <small>{s}</small>
            </span>
          </label>
        ))}
      </div>
      {!!sizeOf(d).instax && (
        <button type="button" className="btn" onClick={applyInstaxPreset}>
          Use A4 sheet, no bleed (best for Instax-style)
        </button>
      )}
      {e.format === 'sheet' && (
        <label className="f">
          Sheet size
          <select value={e.sheet} onChange={(x) => setExp({ sheet: x.target.value as SheetId })}>
            {SHEET_OPTS.map(([id, name]) => {
              const n = nup({ ...d, exp: { ...e, sheet: id } }),
                count = n.cols * n.rows;
              return (
                <option key={id} value={id} disabled={!count && id !== e.sheet}>
                  {name} · {count ? `${count} per sheet` : 'too small'}
                </option>
              );
            })}
          </select>
        </label>
      )}
      <div className="summary">{exportSummary({ d, photos })}</div>
      <div className="inline">
        <button type="button" className="btn" onClick={() => void open3D()}>
          View in 3D
        </button>
        {e.format === 'png' ? (
          pages.map((pg) => (
            <button key={pg.tag} type="button" className="btn" disabled={!!busy} onClick={() => run(pg.tag, () => downloadPNG(pg))}>
              {busy === pg.tag ? 'Preparing…' : `${pg.side === 'front' ? pg.label : 'Back'} PNG`}
            </button>
          ))
        ) : (
          <button type="button" className="btn" disabled={!!busy} onClick={() => run('pdf', downloadPrintFile)}>
            {busy === 'pdf' ? 'Preparing file…' : 'PDF only'}
          </button>
        )}
      </div>
      </Section>
      {d.env.on && (
        <Section id="print.envelope" title="Envelope">
          <p className="hint">{envelopeSummary(d)}.</p>
          <div className="inline">
            <button type="button" className="btn" disabled={!!busy} onClick={() => run('env', () => downloadEnvelope('pdf'))}>
              {busy === 'env' ? 'Preparing…' : 'Envelope PDF'}
            </button>
            {templateSheet(d) && (
              <button type="button" className="btn" disabled={!!busy} onClick={() => run('envt', () => downloadEnvelope('template'))}>
                {busy === 'envt' ? 'Preparing…' : 'Fold-your-own template'}
              </button>
            )}
            <button type="button" className="btn" onClick={() => void open3D(undefined, 'envelope')}>
              Envelope in 3D
            </button>
          </div>
        </Section>
      )}
      <Section id="print.quote" title="Get a quote from a print shop">
        <p className="hint">
          Send these to printers to compare prices. Both list the paper, weight, finish, colour sides and finishing, every size
          with bleed and sheet counts, and a blank price-per-piece grid for {QUOTE_QTY.join(', ')} pieces.
        </p>
        <div className="inline">
          <button type="button" className="btn" disabled={!!busy} onClick={() => run('quote', () => downloadQuote('design'))}>
            {busy === 'quote' ? 'Preparing…' : 'Quote request for this design'}
          </button>
          <button type="button" className="btn" disabled={!!busy} onClick={() => run('catalog', () => downloadQuote('catalog'))}>
            {busy === 'catalog' ? 'Preparing…' : 'All products and sizes (PDF)'}
          </button>
        </div>
      </Section>
      <ul className="tips">
        <li>Print at 100% or “actual size”, never “fit to page”.</li>
        <li>{prod.paper}</li>
        {d.product === 'postcard' && <li>For double-sided sheets, choose “flip on long edge”.</li>}
        {d.product === 'magnet' && <li>Choose “Sheet PDF” to fit as many magnets as possible on one A4 page.</li>}
        <li>Files are RGB. Digital print shops accept this; offset printers convert to CMYK.</li>
      </ul>
    </Pane>
  );
}

/**
 * Photos from Pexels: who took them (linked), what the license allows, and a clear warning when the design prints
 * a Pexels photo almost unchanged, which the license doesn't allow selling. Shown only when the design uses one.
 */
function PexelsNotice() {
  const d = useApp((s) => s.design),
    photos = useApp((s) => s.photos);
  const pex = photos.filter((p) => isPexels(p.name));
  if (!pex.length) return null;
  const credits = [...new Map(pex.map((p) => creditOf(p.name)!).map((c) => [c.url ?? c.photographer, c])).values()];
  const words = (d.showHeading && d.heading.trim()) || (d.showQuote && d.quote.trim()) || (d.showSig && d.sig.trim());
  // A photo with nothing added around it: a full-bleed postcard or magnet, or a frame print without a caption.
  const bare = !words && (['full', 'mag-full'].includes(d.layout) || (d.product === 'frame' && d.layout !== 'frame-caption'));
  return (
    <Section id="print.license" title="Photo credits and license" note={`${credits.length} from Pexels`}>
      <ul className="tips">
        {credits.map((c) => (
          <li key={c.url ?? c.photographer}>
            Photo by {c.photographer} on{' '}
            {c.url ? (
              <a href={c.url} target="_blank" rel="noopener noreferrer">
                Pexels
              </a>
            ) : (
              'Pexels'
            )}
          </li>
        ))}
      </ul>
      <p className="hint">
        Pexels photos are free to print under the{' '}
        <a href="https://www.pexels.com/license/" target="_blank" rel="noopener noreferrer">
          Pexels license
        </a>
        . The print pack includes a <code>PHOTO-CREDITS.txt</code>. If you sell what you print, the design has to change the
        photo (words, layout, artwork): selling an unaltered copy as a print isn’t allowed. Don’t show identifiable people in
        a bad light, or suggest they endorse anything.
      </p>
      {bare && (
        <p className="warnbox" role="note">
          This design prints the Pexels photo almost as it is. That’s fine for yourself or as a gift. To sell it, add words, a
          different layout or occasion artwork first.
        </p>
      )}
      {(d.product === 'postcard' || d.product === 'frame') && (
        <Check checked={d.back.credit} onChange={(credit) => setBack({ credit })}>
          Print the photo credit in small type on the back
        </Check>
      )}
    </Section>
  );
}
