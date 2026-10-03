import { useEffect, useState } from 'react';
import { BUILT_IN_PRESETS, presetApplied } from '../../data/presets';
import type { Adjustments } from '../../engine/adjust';
import { lutById, LutError } from '../../engine/lut';
import { logError } from '../../lib/errors';
import { toast } from '../../lib/toast';
import { ensureLut, forgetLut, importCube, loadLutLibrary, useLutLibrary } from '../../lib/userLuts';

/*
 * Presets and LUTs (P1.4), shared by the photo and video editors: the built-in looks as presets, then a 3D LUT chosen
 * from the LUTs imported on this device (or a new .cube file), with how strongly it applies.
 */

export function LookPicker({
  adjust: a,
  onChange,
  idPrefix,
}: {
  adjust: Adjustments;
  onChange: (patch: Partial<Adjustments>) => void;
  idPrefix: string;
}) {
  const luts = useLutLibrary();
  const [busy, setBusy] = useState(false);
  useEffect(() => void loadLutLibrary(), []);
  const missing = !!a.lut && !lutById(a.lut);

  const choose = async (id: string) => {
    if (!id) return onChange({ lut: '' });
    setBusy(true);
    try {
      if (await ensureLut(id)) onChange({ lut: id });
      else toast('That LUT isn’t on this device any more.');
    } catch (e) {
      logError('handled', e);
      toast('The LUT couldn’t be loaded. Try importing the .cube file again.');
    } finally {
      setBusy(false);
    }
  };
  const add = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const lut = await importCube(file);
      onChange({ lut: lut.id, lutAmount: 100 });
      toast(`LUT “${lut.title}” added (${lut.size}³).`);
    } catch (e) {
      // A file that isn't a usable LUT is the file's problem, not the app's: say why, don't report it.
      if (e instanceof LutError) toast(`That LUT can’t be used. ${e.message}`);
      else {
        logError('handled', e);
        toast('The LUT couldn’t be read.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="chips" role="radiogroup" aria-label="Presets">
        {BUILT_IN_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            className="chip"
            aria-checked={presetApplied(a, p)}
            onClick={() => onChange(p.adjust)}
          >
            {p.name}
          </button>
        ))}
      </div>
      <div className="ig-lut">
        <label htmlFor={`${idPrefix}-lut`}>LUT</label>
        <select id={`${idPrefix}-lut`} value={a.lut} disabled={busy} onChange={(e) => void choose(e.target.value)}>
          <option value="">None</option>
          {luts.map((l) => (
            <option key={l.id} value={l.id}>
              {l.title}
            </option>
          ))}
          {a.lut && !luts.some((l) => l.id === a.lut) && <option value={a.lut}>Missing LUT</option>}
        </select>
        <label className="sbtn mst-file">
          Import .cube
          <input
            type="file"
            accept=".cube"
            disabled={busy}
            onChange={(e) => void add(e.target.files?.[0]).then(() => (e.target.value = ''))}
          />
        </label>
      </div>
      {missing && <p className="hint bad">This LUT isn’t on this device any more, so it isn’t applied.</p>}
      {a.lut && !missing && (
        <>
          <div className="ig-slider">
            <label htmlFor={`${idPrefix}-lutamt`}>
              LUT amount <output htmlFor={`${idPrefix}-lutamt`}>{Math.round(a.lutAmount)}</output>
            </label>
            <input
              id={`${idPrefix}-lutamt`}
              type="range"
              min={0}
              max={100}
              step={1}
              value={a.lutAmount}
              onChange={(e) => onChange({ lutAmount: +e.target.value })}
              onDoubleClick={() => onChange({ lutAmount: 100 })}
            />
          </div>
          <button
            type="button"
            className="sbtn"
            onClick={() => {
              const id = a.lut;
              onChange({ lut: '' });
              void forgetLut(id);
              toast('LUT removed from this device.');
            }}
          >
            Remove this LUT from the device
          </button>
        </>
      )}
    </>
  );
}
