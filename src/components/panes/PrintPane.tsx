import { useState } from 'react';
import { productOf } from '../../data/products';
import { sizeOf } from '../../engine/design';
import { exportSummary, pagesOf } from '../../engine/export';
import { QUOTE_QTY } from '../../data/printSpecs';
import { envelopeSummary, templateSheet } from '../../engine/envelope';
import { applyInstaxPreset, downloadEnvelope, downloadPack, downloadPNG, downloadPrintFile, downloadQuote, open3D } from '../../state/actions';
import { setExp, useApp } from '../../state/store';
import type { ExportFormat, ExportSettings, SheetId } from '../../types';
import { Check, Pane, Section } from '../common';
import { PackIcon } from '../icons';

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
            One ZIP with {pages.filter((p) => p.side === 'front').length > 1 ? 'every front page' : 'the front'}
            {e.back ? ' and back' : ''} as separate PNG files, the print PDF, and a <code>PRINT-SPEC.txt</code> for the print
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
      </Section>
      <Section id="print.format" title="File type">
      <div className="fmt" role="radiogroup" aria-label="File type">
        {FORMATS.map(([v, t, s]) => (
          <label key={v}>
            <input type="radio" name="fmt" checked={e.format === v} onChange={() => setExp({ format: v })} />
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
            <option value="a4">A4 (210×297 mm)</option>
            <option value="a3">A3 (297×420 mm)</option>
            <option value="1319">13×19 in (print shop sheet)</option>
            <option value="letter">US Letter</option>
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
