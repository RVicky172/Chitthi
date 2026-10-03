import { describe, expect, it } from 'vitest';
import { DEFAULT_ADJUST, mergeAdjust } from './adjust';
import { identityLut, lutFromJson, LutError, lutToJson, parseCube } from './lut';
import {
  cleanName,
  mergePreset,
  PRESET_FILE_MAX,
  PRESET_NAME_MAX,
  PresetError,
  presetFile,
  presetId,
  readPresetFile,
  sameSettings,
  uniqueName,
  type SavedPreset,
} from './presets';

const preset = (name: string, adjust = DEFAULT_ADJUST): SavedPreset => ({
  id: presetId(),
  name,
  adjust: { ...adjust },
  created: 1,
});

describe('preset names', () => {
  it('are trimmed, single-spaced and cut to the limit', () => {
    expect(cleanName('  Warm \n  evening ')).toBe('Warm evening');
    expect(cleanName('x'.repeat(200))).toHaveLength(PRESET_NAME_MAX);
    expect(cleanName('   ')).toBe('');
    expect(cleanName(42)).toBe('');
  });
  it('get a number when taken, ignoring case, and stay within the limit', () => {
    expect(uniqueName('Warm', ['Cool'])).toBe('Warm');
    expect(uniqueName('Warm', ['warm'])).toBe('Warm (2)');
    expect(uniqueName('Warm', ['Warm', 'Warm (2)'])).toBe('Warm (3)');
    const long = 'y'.repeat(PRESET_NAME_MAX);
    expect(uniqueName(long, [long])).toHaveLength(PRESET_NAME_MAX);
  });
  it('ids are new each time and safe as file names', () => {
    const ids = new Set(Array.from({ length: 200 }, presetId));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9_-]{1,100}$/);
  });
});

describe('mergePreset', () => {
  it('keeps a valid preset, validating its settings with mergeAdjust', () => {
    const p = mergePreset({ id: 'p1', name: ' Golden ', adjust: { exposure: 9, look: 'warm', bogus: 1 }, created: 5 });
    expect(p).toEqual({ id: 'p1', name: 'Golden', adjust: mergeAdjust({ exposure: 4, look: 'warm' }), created: 5 });
  });
  it('drops what cannot be a preset: no object, a bad id, no name', () => {
    for (const raw of [null, 3, 'x', {}, { id: '../x', name: 'a' }, { id: 'p1', name: '  ' }, { id: 'p1' }])
      expect(mergePreset(raw)).toBeNull();
  });
  it('gives missing settings their defaults', () => {
    expect(mergePreset({ id: 'p1', name: 'Plain' })?.adjust).toEqual(DEFAULT_ADJUST);
  });
});

describe('LUTs in preset files', () => {
  it('round-trip exactly, with the same id', () => {
    const rows: string[] = [];
    for (let i = 0; i < 27; i++) rows.push(`${(i % 3) / 2} ${Math.sin(i) * 0.5 + 0.5} ${1 / (i + 1)}`);
    const l = parseCube(`TITLE "Odd"\nDOMAIN_MAX 1 2 1\nLUT_3D_SIZE 3\n${rows.join('\n')}`);
    const back = lutFromJson(JSON.parse(JSON.stringify(lutToJson(l))));
    expect(back).toEqual(l);
  });
  it.each([
    ['a wrong size', (j: Record<string, unknown>) => ({ ...j, size: 66 })],
    ['a short table', (j: Record<string, unknown>) => ({ ...j, size: 3 })],
    ['a broken range', (j: Record<string, unknown>) => ({ ...j, max: [0, 0, 0] })],
    ['damaged data', (j: Record<string, unknown>) => ({ ...j, data: '%%%' })],
    [
      'a NaN in the table',
      (j: Record<string, unknown>) => ({
        ...j,
        data: btoa(String.fromCharCode(...new Uint8Array(new Float32Array(24).fill(NaN).buffer))),
      }),
    ],
  ])('are refused with %s', (_, spoil) => {
    expect(() => lutFromJson(spoil(lutToJson(identityLut(2)) as unknown as Record<string, unknown>))).toThrow(LutError);
  });
});

describe('preset files', () => {
  it('carry the presets and their LUTs, and read back the same', () => {
    const lut = identityLut(5);
    const a = preset('Teal', { ...DEFAULT_ADJUST, lut: lut.id, lutAmount: 70, contrast: 20 }),
      b = preset('Plain');
    const read = readPresetFile(presetFile([a, b], [lut]));
    expect(read.presets).toEqual([
      { name: 'Teal', adjust: a.adjust },
      { name: 'Plain', adjust: b.adjust },
    ]);
    expect(read.luts.map((l) => l.id)).toEqual([lut.id]);
    // No storage ids in the file: they belong to the device.
    expect(presetFile([a], [])).not.toContain(a.id);
  });
  it('validate every preset in them and skip the nameless', () => {
    const text = JSON.stringify({
      format: 'chitthi-presets',
      version: 1,
      presets: [{ name: 'Bright', adjust: { exposure: 50 } }, { adjust: {} }],
    });
    expect(readPresetFile(text).presets).toEqual([{ name: 'Bright', adjust: mergeAdjust({ exposure: 4 }) }]);
  });
  it('leave out a damaged LUT and keep the presets', () => {
    const text = JSON.stringify({
      format: 'chitthi-presets',
      version: 1,
      presets: [{ name: 'A' }],
      luts: [{ size: 2, data: 'x' }],
    });
    const r = readPresetFile(text);
    expect([r.presets.length, r.luts.length]).toEqual([1, 0]);
  });
  it.each([
    ['not JSON', '{'],
    ['another JSON file', '{"designs": []}'],
    ['a newer format', JSON.stringify({ format: 'chitthi-presets', version: 2, presets: [] })],
    [
      'too many presets',
      JSON.stringify({
        format: 'chitthi-presets',
        version: 1,
        presets: Array(PRESET_FILE_MAX + 1).fill({ name: 'x' }),
      }),
    ],
  ])('are refused when %s', (_, text) => {
    expect(() => readPresetFile(text)).toThrow(PresetError);
  });
  it('compare settings, not names', () => {
    expect(sameSettings(DEFAULT_ADJUST, { ...DEFAULT_ADJUST })).toBe(true);
    expect(sameSettings(DEFAULT_ADJUST, { ...DEFAULT_ADJUST, grain: 1 })).toBe(false);
  });
});
