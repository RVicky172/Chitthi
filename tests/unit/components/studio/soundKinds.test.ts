import { describe, expect, it } from 'vitest';
import { KIND_NAMES, kindClass, soundKind } from '@/components/studio/soundKinds';
import { MUSIC, type Track } from '@/engine/tracks';
import { readDeclarations } from '../../../support/cssDeclarations';

/*
 * 505 §4 (AC-2): sound is named and coloured by its kind (Music, Voice, Effects) wherever it is shown: one rule from
 * the track's role, one class per kind setting --kind from the role tokens of 501.
 */

/**
 * A sound track.
 * @param id its id
 * @param role its role, if set
 * @returns the track
 */
const track = (id: string, role?: Track['role']): Track => ({
  id,
  kind: 'audio',
  name: id,
  hidden: false,
  muted: false,
  locked: false,
  ...(role ? { role } : {}),
});

describe('soundKind (D2)', () => {
  it.each([
    ['music', 'music'],
    ['voice', 'voice'],
    ['effects', 'fx'],
  ] as const)('a %s track is %s', (role, kind) => {
    expect(soundKind(track('A2', role))).toBe(kind);
  });

  it('reads a track without a role as 208 does: the Music track Music, the others Effects', () => {
    expect(soundKind(track(MUSIC))).toBe('music');
    expect(soundKind(track('A3'))).toBe('fx');
  });

  it('names each kind and gives its class', () => {
    expect(KIND_NAMES).toEqual({ music: 'Music', voice: 'Voice', fx: 'Effects' });
    expect(kindClass('fx')).toBe('kind-fx');
  });
});

describe('the kind colours', () => {
  const tokens = { music: '--sound-music', voice: '--sound-voice', fx: '--sound-fx' } as const;

  it.each(Object.entries(tokens))('.kind-%s sets --kind from %s', (kind, token) => {
    const set = readDeclarations('36-media-studio.css').find(
      (declaration) => declaration.rule.split(',').map((part) => part.trim()).includes(`.kind-${kind}`) && declaration.property === '--kind',
    );
    expect(set?.value).toBe(`var(${token})`);
  });

  it.each(Object.values(tokens))('%s exists in the light theme and both dark blocks', (token) => {
    const blocks = readDeclarations('01-base.css')
      .filter((declaration) => declaration.property === token)
      .map((declaration) => declaration.selector);
    expect(blocks).toContain(':root');
    expect(blocks.some((selector) => selector.startsWith('@media (prefers-color-scheme: dark)'))).toBe(true);
    expect(blocks).toContain(":root[data-theme='dark']");
  });
});
