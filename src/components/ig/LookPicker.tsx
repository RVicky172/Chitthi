import { useEffect, useState } from 'react';
import type { Adjustments } from '../../engine/adjust';
import { lutById, LutError } from '../../engine/lut';
import { BUILT_IN_PRESETS, PRESET_NAME_MAX, presetApplied, PresetError, type SavedPreset } from '../../engine/presets';
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

/**
 * A saved preset's LUT is loaded before it is applied; one that is gone is applied without it, with a note.
 * @param preset the saved preset
 * @param apply where its settings go
 */
async function applySaved(preset: SavedPreset, apply: (adjust: Adjustments) => void): Promise<void> {
  if (preset.adjust.lut && !(await ensureLut(preset.adjust.lut).catch(() => undefined)))
    toast(`“${preset.name}” uses a LUT that isn’t on this device, so it is applied without it.`);
  apply(preset.adjust);
}

/**
 * "1 preset", "3 presets".
 * @param count how many
 * @param word the singular word
 * @returns the count and the word
 */
const counted = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** The settings being edited and where changes go. */
interface LookPickerProps {
  adjust: Adjustments;
  onChange: (patch: Partial<Adjustments>) => void;
  /** Prefix for the inputs' ids, unique on the page. */
  idPrefix: string;
  /** Applies settings to every photo of the batch; offered for saved presets when given. */
  onApplyAll?: (adjust: Adjustments) => void;
}

/**
 * Presets and LUTs: the preset chips, the LUT select with import, amount and removal, saving a preset and the saved
 * presets.
 * @param props the settings, their change handler, the id prefix and (photo editor) apply-to-all
 */
export function LookPicker({ adjust, onChange, idPrefix, onApplyAll }: Readonly<LookPickerProps>) {
  const luts = useLutLibrary(),
    saved = usePresets();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void loadLutLibrary();
    void loadPresets();
  }, []);
  const missing = !!adjust.lut && !lutById(adjust.lut);

  const choose = async (id: string) => {
    if (!id) {
      onChange({ lut: '' });
      return;
    }
    setBusy(true);
    try {
      if (await ensureLut(id)) onChange({ lut: id });
      else toast('That LUT isn’t on this device any more.');
    } catch (error) {
      logError('handled', error);
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
    } catch (error) {
      // A file that isn't a usable LUT is the file's problem, not the app's: say why, don't report it.
      if (error instanceof LutError) toast(`That LUT can’t be used. ${error.message}`);
      else {
        logError('handled', error);
        toast('The LUT couldn’t be read.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="chips" role="radiogroup" aria-label="Presets">
        {BUILT_IN_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            role="radio"
            className="chip"
            aria-checked={presetApplied(adjust, preset)}
            onClick={() => onChange(preset.adjust)}
          >
            {preset.name}
          </button>
        ))}
        {saved.map((preset) => (
          <button
            key={preset.id}
            type="button"
            role="radio"
            className="chip"
            aria-checked={presetApplied(adjust, preset)}
            onClick={() => void applySaved(preset, onChange)}
          >
            {preset.name}
          </button>
        ))}
      </div>
      <div className="ig-lut">
        <label htmlFor={`${idPrefix}-lut`}>LUT</label>
        <select
          id={`${idPrefix}-lut`}
          value={adjust.lut}
          disabled={busy}
          onChange={(event) => void choose(event.target.value)}
        >
          <option value="">None</option>
          {luts.map((lut) => (
            <option key={lut.id} value={lut.id}>
              {lut.title}
            </option>
          ))}
          {adjust.lut && !luts.some((lut) => lut.id === adjust.lut) && <option value={adjust.lut}>Missing LUT</option>}
        </select>
        <label className="sbtn mst-file">
          Import .cube
          <input
            type="file"
            accept=".cube"
            disabled={busy}
            onChange={(event) =>
              void add(event.target.files?.[0]).then(() => {
                event.target.value = '';
              })
            }
          />
        </label>
      </div>
      {missing && <p className="hint bad">This LUT isn’t on this device any more, so it isn’t applied.</p>}
      {adjust.lut && !missing && (
        <>
          <div className="ig-slider">
            <label htmlFor={`${idPrefix}-lutamt`}>
              LUT amount <output htmlFor={`${idPrefix}-lutamt`}>{Math.round(adjust.lutAmount)}</output>
            </label>
            <input
              id={`${idPrefix}-lutamt`}
              type="range"
              min={0}
              max={100}
              step={1}
              value={adjust.lutAmount}
              onChange={(event) => onChange({ lutAmount: +event.target.value })}
              onDoubleClick={() => onChange({ lutAmount: 100 })}
            />
          </div>
          <button
            type="button"
            className="sbtn"
            onClick={() => {
              const id = adjust.lut;
              onChange({ lut: '' });
              void forgetLut(id);
              toast('LUT removed from this device.');
            }}
          >
            Remove this LUT from the device
          </button>
        </>
      )}
      <SavePreset idPrefix={idPrefix} adjust={adjust} />
      <PresetManager saved={saved} onApplyAll={onApplyAll && ((preset) => void applySaved(preset, onApplyAll))} />
    </>
  );
}

/** The settings a new preset would hold. */
interface SavePresetProps {
  idPrefix: string;
  adjust: Adjustments;
}

/**
 * Saving the current settings as a named preset.
 * @param props the id prefix and the settings
 */
function SavePreset({ idPrefix, adjust }: Readonly<SavePresetProps>) {
  const [name, setName] = useState('');
  return (
    <form
      className="ig-preset-save"
      onSubmit={(event) => {
        event.preventDefault();
        void savePreset(name, adjust).then((preset) => {
          if (!preset) {
            toast('Give the preset a name first.');
            return;
          }
          setName('');
          toast(`Preset “${preset.name}” saved.`);
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
        onChange={(event) => setName(event.target.value)}
      />
      <button type="submit" className="sbtn" disabled={!name.trim()}>
        Save as preset
      </button>
    </form>
  );
}

/** The saved presets and, in the photo editor, applying one to every photo. */
interface PresetManagerProps {
  saved: SavedPreset[];
  onApplyAll?: (preset: SavedPreset) => void;
}

/**
 * The saved presets: rename, apply to all, delete, and export / import as a preset file.
 * @param props the saved presets and apply-to-all
 */
function PresetManager({ saved, onApplyAll }: Readonly<PresetManagerProps>) {
  const [busy, setBusy] = useState(false);
  const exportAll = async () => {
    setBusy(true);
    try {
      const json = await exportPresets(saved);
      await saveFile(
        `chitthi-presets-${new Date().toISOString().slice(0, 10)}.json`,
        new Blob([json], { type: 'application/json' }),
      );
    } catch (error) {
      logError('handled', error);
      toast('The presets couldn’t be exported.');
    } finally {
      setBusy(false);
    }
  };
  const importFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const result = await importPresets(file);
      toast(
        `${counted(result.added, 'preset')} added` +
          (result.skipped ? `, ${result.skipped} already here` : '') +
          (result.luts ? `, with ${counted(result.luts, 'LUT')}` : '') +
          '.',
      );
    } catch (error) {
      // A file that isn't a preset file is the file's problem: say why, don't report it.
      if (error instanceof PresetError) toast(`Those presets can’t be imported. ${error.message}`);
      else {
        logError('handled', error);
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
          {saved.map((preset) => (
            <li key={`${preset.id}:${preset.name}`}>
              <input
                type="text"
                aria-label={`Name of preset ${preset.name}`}
                maxLength={PRESET_NAME_MAX}
                defaultValue={preset.name}
                onBlur={(event) => {
                  const field = event.currentTarget;
                  void renamePreset(preset.id, field.value).then((name) => {
                    field.value = name;
                  });
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur();
                  if (event.key === 'Escape') {
                    event.currentTarget.value = preset.name;
                    event.currentTarget.blur();
                  }
                }}
              />
              {onApplyAll && (
                <button
                  type="button"
                  className="sbtn"
                  aria-label={`Apply ${preset.name} to all photos`}
                  onClick={() => onApplyAll(preset)}
                >
                  To all
                </button>
              )}
              <button
                type="button"
                className="sbtn"
                aria-label={`Delete preset ${preset.name}`}
                onClick={() => {
                  if (confirm(`Delete the preset “${preset.name}”? Photos already edited with it keep their settings.`))
                    void deletePreset(preset.id);
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
            onChange={(event) =>
              void importFile(event.target.files?.[0]).then(() => {
                event.target.value = '';
              })
            }
          />
        </label>
      </div>
    </details>
  );
}
