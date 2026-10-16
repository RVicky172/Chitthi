import type { Adjustments } from '../engine/adjust';
import { LUT_MAX_BYTES, lutById, LutError, parseCube } from '../engine/lut';
import { BUILT_IN_PRESETS, PresetError } from '../engine/presets';
import { ensureLut, getLutLibrary, keepLut, loadLutLibrary } from '../lib/userLuts';
import { adjustEach, adjustPhoto, getIg } from '../state/instagram';
import { deletePreset, exportPresets, getPresets, importPresets, loadPresets, savePreset } from '../state/presets';
import { booleanSchema, objectSchema, ok, stringArg, stringSchema, ToolError, type AgentTool } from './common';
import { PHOTO_ARG } from './photoEdits';
import { changed, currentItem, itemOf, NO_PHOTOS, targetOf } from './photoStudioInfo';

/* Presets and LUTs: built-in looks, the user's saved presets, preset files and imported 3D LUTs. */

/**
 * The text of a .cube file an agent gives, or downloads it.
 * @param args the import_lut arguments: `cube` text or an https `url`
 * @returns the file's text
 * @throws ToolError when neither is given or the download fails
 */
async function cubeText(args: Record<string, unknown>): Promise<string> {
  if (typeof args.cube === 'string' && args.cube) return args.cube;
  if (typeof args.url !== 'string' || !args.url.startsWith('https://')) throw new ToolError('Give the .cube text, or an https URL.');
  const response = await fetch(args.url);
  if (!response.ok) throw new ToolError(`The LUT couldn’t be downloaded (${response.status}).`);
  return response.text();
}

/** The preset and LUT tools. */
export const PRESET_TOOLS: AgentTool[] = [
  {
    name: 'list_presets',
    title: 'List presets',
    description:
      'Built-in presets (the looks; applying one changes only the look) and the user’s saved presets (applying one replaces every colour setting), with their settings.',
    inputSchema: objectSchema(),
    readOnly: true,
    run: async () => {
      await loadPresets();
      return ok('Presets', {
        builtIn: BUILT_IN_PRESETS.map((preset) => ({ id: preset.id, name: preset.name, settings: preset.adjust })),
        saved: getPresets().map((preset) => ({ id: preset.id, name: preset.name, settings: changed(preset.adjust) })),
      });
    },
  },
  {
    name: 'apply_preset',
    title: 'Apply a preset',
    description:
      'Applies a preset (id from list_presets) to one photo or to all. A saved preset replaces the photo’s colour settings; a built-in one sets only its look. Masks and framing are kept.',
    inputSchema: objectSchema({ preset: stringSchema('Preset id from list_presets'), photo: stringSchema('Photo id, or "all" (default: the selected photo)') }, ['preset']),
    run: async (args) => {
      await loadPresets();
      const builtIn = BUILT_IN_PRESETS.find((preset) => preset.id === args.preset);
      const saved = getPresets().find((preset) => preset.id === args.preset);
      const preset = builtIn ?? saved;
      if (!preset) throw new ToolError(`Unknown preset “${stringArg(args.preset)}”. Use list_presets.`);
      let note = '';
      if (saved?.adjust.lut) {
        await loadLutLibrary();
        if (!(await ensureLut(saved.adjust.lut).catch(() => undefined))) note = ' Its LUT isn’t on this device, so it applies without it.';
      }
      const patch: Partial<Adjustments> = builtIn ? builtIn.adjust : { ...preset.adjust };
      if (args.photo === 'all') {
        if (!getIg().items.length) throw new ToolError(NO_PHOTOS);
        adjustEach((adjust) => ({ ...adjust, ...patch }));
        return ok(`“${preset.name}” applied to ${getIg().items.length} photo(s).${note}`);
      }
      const item = targetOf(args.photo);
      adjustPhoto(item.id, patch);
      return ok(`“${preset.name}” applied.${note}`, changed(currentItem(item.id).edit.adjust));
    },
  },
  {
    name: 'save_preset',
    title: 'Save a preset',
    description:
      'Saves a photo’s colour settings (all of them, not its masks or framing) as a named preset on this device. A name already taken gets a number.',
    inputSchema: objectSchema({ name: stringSchema('Preset name (up to 60 characters)'), photo: PHOTO_ARG }, ['name']),
    run: async (args) => {
      await loadPresets();
      const preset = await savePreset(stringArg(args.name), itemOf(args.photo).edit.adjust);
      if (!preset) throw new ToolError('Give the preset a name.');
      return ok(`Saved as “${preset.name}”.`, { id: preset.id, name: preset.name, settings: changed(preset.adjust) });
    },
  },
  {
    name: 'delete_preset',
    title: 'Delete a saved preset',
    description:
      'Deletes one of the user’s saved presets from this device. This can’t be undone, so it needs confirm: true. Photos it was applied to keep their settings.',
    inputSchema: objectSchema({ preset: stringSchema('Saved preset id from list_presets'), confirm: booleanSchema('Required: the preset is deleted for good') }, ['preset']),
    destructive: true,
    run: async (args) => {
      await loadPresets();
      const preset = getPresets().find((candidate) => candidate.id === args.preset);
      if (!preset) throw new ToolError(`No saved preset “${stringArg(args.preset)}”. Built-in presets can’t be deleted.`);
      if (args.confirm !== true) throw new ToolError(`This deletes “${preset.name}” for good. Pass confirm: true to go ahead.`);
      await deletePreset(preset.id);
      return ok(`Deleted “${preset.name}”.`);
    },
  },
  {
    name: 'export_presets',
    title: 'Export presets to a file',
    description:
      'Writes saved presets (all, or the ids given) to a Chitthi preset file, with the LUTs they use, so they can be imported on another device.',
    inputSchema: objectSchema({ presets: { type: 'array', items: { type: 'string' }, description: 'Saved preset ids (default: all)' } }),
    run: async (args) => {
      await loadPresets();
      await loadLutLibrary();
      const ids: unknown[] | null = Array.isArray(args.presets) ? args.presets : null;
      const presets = ids ? getPresets().filter((preset) => ids.includes(preset.id)) : getPresets();
      if (!presets.length) throw new ToolError('There are no saved presets to export.');
      const name = `chitthi-presets-${new Date().toISOString().slice(0, 10)}.json`;
      const blob = new Blob([await exportPresets(presets)], { type: 'application/json' });
      return { text: `${presets.length} preset(s) exported.`, files: [{ name, blob }] };
    },
  },
  {
    name: 'import_presets',
    title: 'Import presets from a file',
    description:
      'Adds the presets (and their LUTs) from the text of a Chitthi preset file. Presets already saved with the same name and settings are skipped.',
    inputSchema: objectSchema({ json: stringSchema('The preset file’s contents') }, ['json']),
    run: async (args) => {
      try {
        const result = await importPresets(new File([stringArg(args.json)], 'presets.json', { type: 'application/json' }));
        return ok(`${result.added} preset(s) added, ${result.skipped} already there, ${result.luts} LUT(s) kept.`, result);
      } catch (error) {
        if (error instanceof PresetError) throw new ToolError(error.message);
        throw error;
      }
    },
  },
  {
    name: 'list_luts',
    title: 'List imported LUTs',
    description:
      '3D LUTs imported on this device (id, title, points per side). Use an id as the lut setting of adjust_photo, with lutAmount for its strength.',
    inputSchema: objectSchema(),
    readOnly: true,
    run: async () => {
      await loadLutLibrary();
      return ok('LUTs', getLutLibrary().map((lut) => ({ id: lut.id, title: lut.title, size: lut.size })));
    },
  },
  {
    name: 'import_lut',
    title: 'Import a LUT',
    description:
      'Imports a 3D LUT from the text of a .cube file (2–65 points per side) or an https URL, and keeps it on this device. Returns its id for adjust_photo.',
    inputSchema: objectSchema({ cube: stringSchema('Contents of a .cube file'), url: stringSchema('https URL of a .cube file'), name: stringSchema('Name, if the file has no TITLE') }),
    run: async (args) => {
      const text = await cubeText(args);
      if (text.length > LUT_MAX_BYTES) throw new ToolError(`That LUT is over ${LUT_MAX_BYTES / 1048576} MB.`);
      try {
        const lut = parseCube(text, stringArg(args.name) || 'LUT');
        await loadLutLibrary();
        await keepLut(lut);
        return ok(`LUT “${lut.title}” imported (${lut.size}³) as ${lut.id}.`, { id: lut.id, title: lut.title, size: lut.size, loaded: !!lutById(lut.id) });
      } catch (error) {
        if (error instanceof LutError) throw new ToolError(`That LUT can’t be used. ${error.message}`);
        throw error;
      }
    },
  },
];
