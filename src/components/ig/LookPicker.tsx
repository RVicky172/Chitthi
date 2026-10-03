import { useEffect, useState } from 'react';
import { BUILT_IN_PRESETS, presetApplied } from '../../data/presets';
import type { Adjustments } from '../../engine/adjust';
import { lutById, LutError } from '../../engine/lut';
import { PRESET_NAME_MAX, PresetError, type SavedPreset } from '../../engine/presets';
import { saveFile } from '../../lib/download';
import { logError } from '../../lib/errors';
import { toast } from '../../lib/toast';
import { ensureLut, forgetLut, importCube, loadLutLibrary, useLutLibrary } from '../../lib/userLuts';
import {
  deletePreset,
  exportPresets,
  importPresets,
  loadPresets,
  renamePreset,
  savePreset,
  usePresets,
} from '../../state/presets';
import { TrashIcon } from '../icons';

/*
 * Presets and LUTs (P1.4, P1.5), shared by the photo and video editors: the built-in looks and the user's saved
 * presets, then a 3D LUT chosen from the LUTs imported on this device (or a new .cube file), with how strongly it
 * applies. Below, saving the current settings as a preset, and managing saved ones: rename, delete, apply to every
 * photo (photo editor), export and import as a preset file.
 */

export function LookPicker({
  adjust: a,
  onChange,
  idPrefix,
  onApplyAll,
}: {
  adjust: Adjustments;
  onChange: (patch: Partial<Adjustments>) => void;
  idPrefix: string;
  /** Applies settings to every photo of the batch; offered for saved presets when given. */
  onApplyAll?: (adjust: Adjustments) => void;
}) {
  const luts = useLutLibrary(),
    saved = usePresets();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void loadLutLibrary();
    void loadPresets();
  }, []);
  const missing = !!a.lut && !lutById(a.lut);

  /** A saved preset's LUT is loaded before it is applied; one that is gone shows as missing. */
  const applySaved = async (p: SavedPreset, apply: (adj: Adjustments) => void) => {
    if (p.adjust.lut && !(await ensureLut(p.adjust.lut).catch(() => undefined)))
      toast(`“${p.name}” uses a LUT that isn’t on this device, so it is applied without it.`);
    apply(p.adjust);
  };

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
        {saved.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            className="chip"
            aria-checked={presetApplied(a, p)}
            onClick={() => void applySaved(p, onChange)}
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
      <SavePreset idPrefix={idPrefix} adjust={a} />
      <PresetManager saved={saved} onApplyAll={onApplyAll && ((p) => void applySaved(p, onApplyAll))} />
    </>
  );
}

function SavePreset({ idPrefix, adjust }: { idPrefix: string; adjust: Adjustments }) {
  const [name, setName] = useState('');
  return (
    <form
      className="ig-preset-save"
      onSubmit={(e) => {
        e.preventDefault();
        void savePreset(name, adjust).then((p) => {
          if (!p) return toast('Give the preset a name first.');
          setName('');
          toast(`Preset “${p.name}” saved.`);
        });
      }}
    >
      <label className="vh" htmlFor={`${idPrefix}-preset-name`}>
        New preset name
      </label>
      <input
        id={`${idPrefix}-preset-name`}
        type="text"
        maxLength={PRESET_NAME_MAX}
        placeholder="Name these settings"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <button type="submit" className="sbtn" disabled={!name.trim()}>
        Save as preset
      </button>
    </form>
  );
}

function PresetManager({ saved, onApplyAll }: { saved: SavedPreset[]; onApplyAll?: (p: SavedPreset) => void }) {
  const [busy, setBusy] = useState(false);
  const exportAll = async () => {
    setBusy(true);
    try {
      const json = await exportPresets(saved);
      await saveFile(
        `chitthi-presets-${new Date().toISOString().slice(0, 10)}.json`,
        new Blob([json], { type: 'application/json' }),
      );
    } catch (e) {
      logError('handled', e);
      toast('The presets couldn’t be exported.');
    } finally {
      setBusy(false);
    }
  };
  const importFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const r = await importPresets(file);
      toast(
        `${r.added} preset${r.added === 1 ? '' : 's'} added` +
          (r.skipped ? `, ${r.skipped} already here` : '') +
          (r.luts ? `, with ${r.luts} LUT${r.luts === 1 ? '' : 's'}` : '') +
          '.',
      );
    } catch (e) {
      // A file that isn't a preset file is the file's problem: say why, don't report it.
      if (e instanceof PresetError) toast(`Those presets can’t be imported. ${e.message}`);
      else {
        logError('handled', e);
        toast('The preset file couldn’t be read.');
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="ig-presets">
      <summary>Your presets ({saved.length})</summary>
      {saved.length ? (
        <ul>
          {saved.map((p) => (
            <li key={`${p.id}:${p.name}`}>
              <input
                type="text"
                aria-label={`Name of preset ${p.name}`}
                maxLength={PRESET_NAME_MAX}
                defaultValue={p.name}
                onBlur={(e) => {
                  const el = e.currentTarget;
                  void renamePreset(p.id, el.value).then((n) => (el.value = n));
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                  if (e.key === 'Escape') {
                    e.currentTarget.value = p.name;
                    e.currentTarget.blur();
                  }
                }}
              />
              {onApplyAll && (
                <button
                  type="button"
                  className="sbtn"
                  aria-label={`Apply ${p.name} to all photos`}
                  onClick={() => onApplyAll(p)}
                >
                  To all
                </button>
              )}
              <button
                type="button"
                className="sbtn"
                aria-label={`Delete preset ${p.name}`}
                onClick={() => {
                  if (confirm(`Delete the preset “${p.name}”? Photos already edited with it keep their settings.`))
                    void deletePreset(p.id);
                }}
              >
                <TrashIcon />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint">Save the settings of a photo or clip to use them again, here or on another device.</p>
      )}
      <div className="inline ig-tools">
        <button type="button" className="sbtn" disabled={busy || !saved.length} onClick={() => void exportAll()}>
          Export presets
        </button>
        <label className="sbtn mst-file">
          Import presets
          <input
            type="file"
            accept=".json,application/json"
            disabled={busy}
            onChange={(e) => void importFile(e.target.files?.[0]).then(() => (e.target.value = ''))}
          />
        </label>
      </div>
    </details>
  );
}
