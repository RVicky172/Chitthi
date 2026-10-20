import { useState } from 'react';
import { productOf } from '../../data/products';
import { sizeOf } from '../../engine/design';
import { exportSummary, nup, pagesOf, type PrintPage } from '../../engine/printPages';
import { QUOTE_QTY } from '../../data/printSpecs';
import { envelopeSummary, templateSheet } from '../../engine/envelope';
import {
  applyInstaxPreset,
  downloadEnvelope,
  downloadPack,
  downloadPNG,
  downloadPrintFile,
  downloadQuote,
  open3D,
} from '../../state/actions';
import { setBack, setExp, useApp } from '../../state/store';
import type { ExportFormat, ExportSettings, SheetId } from '../../types';
import { aiCreditOf, creditOf, isPexels } from '../../lib/credits';
import { Check, Pane } from '../common';
import { FoldSection } from '../panel';
import { PackIcon } from '../icons';

const SHEET_OPTS: [SheetId, string][] = [
  ['a4', 'A4 (210×297 mm)'],
  ['a3', 'A3 (297×420 mm)'],
  ['1319', '13×19 in (print shop sheet)'],
  ['letter', 'US Letter'],
];
const FORMATS: [ExportFormat, string, string][] = [
  ['pdf', 'Print shop PDF', 'One page per side at the exact size, with bleed and crop marks.'],
  [
    'sheet',
    'Sheet PDF (A4 and more)',
    'As many as fit on one sheet, fronts and backs lined up for double-sided printing.',
  ],
  ['png', 'PNG images only', 'Separate front and back images tagged with their print resolution.'],
];

/**
 * A bleed in words: ⅛ in for the US bleed, else millimetres.
 * @param bleed the bleed setting
 * @returns the size
 */
const bleedSize = (bleed: string) => (bleed === '3.175' ? '⅛ in' : `${bleed} mm`);

/**
 * A page's name on its PNG button: the front page's label, or Back.
 * @param page the page
 * @returns the name
 */
const pageName = (page: PrintPage) => (page.side === 'front' ? page.label : 'Back');

/** The Print step: the print pack, export settings, single files, the envelope and quote requests. */
export function PrintPane() {
  const design = useApp((state) => state.design),
    photos = useApp((state) => state.photos);
  const exportSettings = design.exp,
    prod = productOf(design.product),
    pages = pagesOf(design);
  const bleedNote = +exportSettings.bleed ? `${exportSettings.bleed} mm bleed` : 'no bleed';
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
            {exportSettings.pngs && (
              <>
                , {pages.filter((page) => page.side === 'front').length > 1 ? 'every front page' : 'the front'}
                {exportSettings.back ? ' and back' : ''} as separate PNG files
              </>
            )}
            , and a <code>PRINT-SPEC.txt</code> for the print shop with trim size,{' '}
            {+exportSettings.bleed ? `${bleedSize(exportSettings.bleed)} bleed` : 'bleed'}, safe area, resolution and
            paper.
            {design.env.on &&
              ' It also holds the matching envelope: a PDF to print on a ready-made envelope and a fold-your-own template.'}{' '}
            And a <code>QUOTE-REQUEST.pdf</code> to send to print shops: previews, paper, finishing and a price grid by
            quantity.
          </small>
        </div>
        <button
          type="button"
          className="btn primary"
          disabled={!!busy}
          onClick={() => void run('pack', () => downloadPack(setStep))}
        >
          {busy === 'pack' ? step || 'Preparing…' : 'Download print pack'}
        </button>
      </div>

      <PexelsNotice />

      <FoldSection id="print.settings" title="Settings" note={`${exportSettings.dpi} dpi, ${bleedNote}`}>
        <div className="row">
          <label className="f">
            Bleed
            <select value={exportSettings.bleed} onChange={(x) => setExp({ bleed: x.target.value })}>
              <option value="0">None</option>
              <option value="3">3 mm (India, Europe)</option>
              <option value="3.175">⅛ in (US)</option>
              <option value="5">5 mm (large prints, some labs)</option>
            </select>
          </label>
          <label className="f">
            Resolution
            <select value={exportSettings.dpi} onChange={(x) => setExp({ dpi: x.target.value })}>
              <option value="300">300 dpi (print)</option>
              <option value="150">150 dpi (draft)</option>
            </select>
          </label>
        </div>
        <div className="row">
          <label className="f">
            Image quality in PDF
            <select
              value={exportSettings.quality}
              onChange={(x) => setExp({ quality: x.target.value as ExportSettings['quality'] })}
            >
              <option value="jpeg">High (smaller file)</option>
              <option value="png">Lossless (larger file)</option>
            </select>
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 6 }}>
            <Check checked={exportSettings.marks} onChange={(marks) => setExp({ marks })}>
              Crop marks
            </Check>
            {design.product !== 'magnet' && (
              <Check checked={exportSettings.back} onChange={(back) => setExp({ back })}>
                Include back ({prod.backLabel.toLowerCase()})
              </Check>
            )}
          </div>
        </div>
        <Check checked={exportSettings.pngs} onChange={(pngs) => setExp({ pngs })}>
          PNG images in the print pack
          {pages.length > 3 ? ` (${pages.length} pages: turn off for a much smaller ZIP)` : ''}
        </Check>
      </FoldSection>
      <FoldSection id="print.format" title="File type">
        <div className="fmt" role="radiogroup" aria-label="File type">
          {FORMATS.map(([format, title, summary]) => (
            <label key={format}>
              <input
                type="radio"
                name="fmt"
                checked={exportSettings.format === format}
                onChange={() => {
                  // Switching to sheets moves off a sheet the piece doesn't fit on, to the smallest one it does.
                  const fits = (id: SheetId) => {
                    const layout = nup({ ...design, exp: { ...exportSettings, sheet: id } });
                    return layout.cols * layout.rows > 0;
                  };
                  const sheet =
                    format === 'sheet' && !fits(exportSettings.sheet)
                      ? (SHEET_OPTS.map(([id]) => id).find(fits) ?? exportSettings.sheet)
                      : exportSettings.sheet;
                  setExp({ format: format, sheet });
                }}
              />
              <span>
                <b>{title}</b>
                <small>{summary}</small>
              </span>
            </label>
          ))}
        </div>
        {!!sizeOf(design).instax && (
          <button type="button" className="btn" onClick={applyInstaxPreset}>
            Use A4 sheet, no bleed (best for Instax-style)
          </button>
        )}
        {exportSettings.format === 'sheet' && (
          <label className="f">
            Sheet size
            <select value={exportSettings.sheet} onChange={(x) => setExp({ sheet: x.target.value as SheetId })}>
              {SHEET_OPTS.map(([id, name]) => {
                const layout = nup({ ...design, exp: { ...exportSettings, sheet: id } }),
                  count = layout.cols * layout.rows;
                return (
                  <option key={id} value={id} disabled={!count && id !== exportSettings.sheet}>
                    {name} · {count ? `${count} per sheet` : 'too small'}
                  </option>
                );
              })}
            </select>
          </label>
        )}
        <div className="summary">{exportSummary({ d: design, photos })}</div>
        <div className="inline">
          <button type="button" className="btn" onClick={() => void open3D()}>
            View in 3D
          </button>
          {exportSettings.format === 'png' ? (
            pages.map((pg) => (
              <button
                key={pg.tag}
                type="button"
                className="btn"
                disabled={!!busy}
                onClick={() => void run(pg.tag, () => downloadPNG(pg))}
              >
                {busy === pg.tag ? 'Preparing…' : `${pageName(pg)} PNG`}
              </button>
            ))
          ) : (
            <button type="button" className="btn" disabled={!!busy} onClick={() => void run('pdf', downloadPrintFile)}>
              {busy === 'pdf' ? 'Preparing file…' : 'PDF only'}
            </button>
          )}
        </div>
      </FoldSection>
      {design.env.on && (
        <FoldSection id="print.envelope" title="Envelope">
          <p className="hint">{envelopeSummary(design)}.</p>
          <div className="inline">
            <button
              type="button"
              className="btn"
              disabled={!!busy}
              onClick={() => void run('env', () => downloadEnvelope('pdf'))}
            >
              {busy === 'env' ? 'Preparing…' : 'Envelope PDF'}
            </button>
            {templateSheet(design) && (
              <button
                type="button"
                className="btn"
                disabled={!!busy}
                onClick={() => void run('envt', () => downloadEnvelope('template'))}
              >
                {busy === 'envt' ? 'Preparing…' : 'Fold-your-own template'}
              </button>
            )}
            <button type="button" className="btn" onClick={() => void open3D(undefined, 'envelope')}>
              Envelope in 3D
            </button>
          </div>
        </FoldSection>
      )}
      <FoldSection id="print.quote" title="Get a quote from a print shop">
        <p className="hint">
          Send these to printers to compare prices. Both list the paper, weight, finish, colour sides and finishing,
          every size with bleed and sheet counts, and a blank price-per-piece grid for {QUOTE_QTY.join(', ')} pieces.
        </p>
        <div className="inline">
          <button
            type="button"
            className="btn"
            disabled={!!busy}
            onClick={() => void run('quote', () => downloadQuote('design'))}
          >
            {busy === 'quote' ? 'Preparing…' : 'Quote request for this design'}
          </button>
          <button
            type="button"
            className="btn"
            disabled={!!busy}
            onClick={() => void run('catalog', () => downloadQuote('catalog'))}
          >
            {busy === 'catalog' ? 'Preparing…' : 'All products and sizes (PDF)'}
          </button>
        </div>
      </FoldSection>
      <ul className="tips">
        <li>Print at 100% or “actual size”, never “fit to page”.</li>
        <li>{prod.paper}</li>
        {design.product === 'postcard' && <li>For double-sided sheets, choose “flip on long edge”.</li>}
        {design.product === 'magnet' && <li>Choose “Sheet PDF” to fit as many magnets as possible on one A4 page.</li>}
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
  const design = useApp((state) => state.design),
    photos = useApp((state) => state.photos);
  const pex = photos.filter((photo) => isPexels(photo.name));
  const ai = [...new Set(photos.map((photo) => aiCreditOf(photo.name)?.made).filter((made): made is string => !!made))];
  if (!pex.length && !ai.length) return null;
  const credits = [
    ...new Map(
      pex
        .map((photo) => creditOf(photo.name))
        .filter((credit) => credit !== null)
        .map((credit) => [credit.url ?? credit.photographer, credit]),
    ).values(),
  ];
  const words =
    (design.showHeading && design.heading.trim()) ||
    (design.showQuote && design.quote.trim()) ||
    (design.showSig && design.sig.trim());
  // A photo with nothing added around it: a full-bleed postcard or magnet, or a frame print without a caption.
  const bare =
    !words &&
    (['full', 'mag-full'].includes(design.layout) || (design.product === 'frame' && design.layout !== 'frame-caption'));
  const note = [credits.length ? `${credits.length} from Pexels` : '', ai.length ? 'AI pictures' : '']
    .filter(Boolean)
    .join(' · ');
  if (!pex.length)
    return (
      <FoldSection id="print.license" title="Photo credits and license" note={note}>
        <AiNotice made={ai} />
        {(design.product === 'postcard' || design.product === 'frame') && (
          <Check checked={design.back.credit} onChange={(credit) => setBack({ credit })}>
            Print “AI picture” in small type on the back
          </Check>
        )}
      </FoldSection>
    );
  return (
    <FoldSection id="print.license" title="Photo credits and license" note={note}>
      <ul className="tips">
        {credits.map((credit) => (
          <li key={credit.url ?? credit.photographer}>
            Photo by {credit.photographer} on{' '}
            {credit.url ? (
              <a href={credit.url} target="_blank" rel="noopener noreferrer">
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
        . The print pack includes a <code>PHOTO-CREDITS.txt</code>. If you sell what you print, the design has to change
        the photo (words, layout, artwork): selling an unaltered copy as a print isn’t allowed. Don’t show identifiable
        people in a bad light, or suggest they endorse anything.
      </p>
      {bare && (
        <p className="warnbox" role="note">
          This design prints the Pexels photo almost as it is. That’s fine for yourself or as a gift. To sell it, add
          words, a different layout or occasion artwork first.
        </p>
      )}
      {ai.length > 0 && <AiNotice made={ai} />}
      {(design.product === 'postcard' || design.product === 'frame') && (
        <Check checked={design.back.credit} onChange={(credit) => setBack({ credit })}>
          Print the photo credit in small type on the back
        </Check>
      )}
    </FoldSection>
  );
}

/** AI pictures on the design: what made them, and what disclosing them means. */
function AiNotice({ made }: Readonly<{ made: string[] }>) {
  return (
    <>
      <ul className="tips">
        {made.map((maker) => (
          <li key={maker}>AI picture made with {maker}</li>
        ))}
      </ul>
      <p className="hint">
        AI pictures were made with your own account, so that service’s terms apply. The print pack’s{' '}
        <code>PHOTO-CREDITS.txt</code> lists them; say they are AI-generated where the law or a marketplace asks you to.
      </p>
    </>
  );
}
