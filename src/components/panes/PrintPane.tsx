import { useState } from 'react';
import { sizeOf } from '../../engine/design';
import { exportSummary } from '../../engine/export';
import { applyInstaxPreset, downloadPNG, downloadPrintFile, open3D } from '../../state/actions';
import { setExp, useApp } from '../../state/store';
import type { ExportFormat, ExportSettings, SheetId } from '../../types';
import { Check, Pane } from '../common';

const FORMATS: [ExportFormat, string, string][] = [
  ['pdf', 'Print shop PDF', 'One page per side at the exact card size, with bleed and crop marks.'],
  [
    'sheet',
    'Sheet PDF (A4 and more)',
    'As many cards as fit on one sheet, front page and back page lined up for double-sided printing. Ideal for Instax-style prints.',
  ],
  ['png', 'PNG images', 'Separate front and back images tagged with their print resolution.'],
];

export function PrintPane() {
  const d = useApp((s) => s.design),
    photos = useApp((s) => s.photos);
  const e = d.exp;
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  return (
    <Pane title="Print file">
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
      <div className="row">
        <label className="f">
          Bleed
          <select value={e.bleed} onChange={(x) => setExp({ bleed: x.target.value })}>
            <option value="0">None</option>
            <option value="3">3 mm (India, Europe)</option>
            <option value="3.175">⅛ in (US)</option>
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
        <label className="f" style={{ visibility: e.format === 'png' ? 'hidden' : 'visible' }}>
          Image quality in PDF
          <select value={e.quality} onChange={(x) => setExp({ quality: x.target.value as ExportSettings['quality'] })}>
            <option value="jpeg">High (smaller file)</option>
            <option value="png">Lossless (larger file)</option>
          </select>
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 6 }}>
          {e.format !== 'png' && (
            <Check checked={e.marks} onChange={(marks) => setExp({ marks })}>
              Crop marks
            </Check>
          )}
          <Check checked={e.back} onChange={(back) => setExp({ back })}>
            Include back
          </Check>
        </div>
      </div>
      <div className="summary">{exportSummary({ d, photos })}</div>
      {e.format === 'png' ? (
        <div className="inline">
          <button type="button" className="btn" onClick={() => void open3D()}>
            View in 3D first
          </button>
          <button type="button" className="btn primary" disabled={!!busy} onClick={() => run('f', () => downloadPNG('front'))}>
            {busy === 'f' ? 'Preparing…' : 'Download front PNG'}
          </button>
          <button type="button" className="btn" disabled={!!busy} onClick={() => run('b', () => downloadPNG('back'))}>
            {busy === 'b' ? 'Preparing…' : 'Download back PNG'}
          </button>
        </div>
      ) : (
        <div className="inline">
          <button type="button" className="btn" onClick={() => void open3D()}>
            View in 3D first
          </button>
          <button type="button" className="btn primary" disabled={!!busy} onClick={() => run('pdf', downloadPrintFile)}>
            {busy === 'pdf' ? 'Preparing file…' : 'Download print file'}
          </button>
        </div>
      )}
      <ul className="tips">
        <li>Print at 100% or “actual size”, never “fit to page”.</li>
        <li>For double-sided sheets, choose “flip on long edge”.</li>
        <li>Ask for 300–350 gsm card. Matte takes handwriting well on the back.</li>
        <li>Files are RGB. Digital print shops accept this; offset printers convert to CMYK.</li>
      </ul>
    </Pane>
  );
}
