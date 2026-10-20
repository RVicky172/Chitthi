import { soundRole, type Track } from '../../engine/tracks';

/*
 * The kind of sound (505 §4, AC-2): Music, Voice or Effects, from the track's role (208), named and coloured the same
 * wherever sound is shown. A `kind-*` class sets `--kind` from the role tokens (01-base.css); the parts read
 * `var(--kind)`. Colour is never the only cue: the kind's name is written beside it.
 */

/** A kind of sound. */
export type SoundKind = 'music' | 'voice' | 'fx';

/** What each kind is called. */
export const KIND_NAMES: Readonly<Record<SoundKind, string>> = { music: 'Music', voice: 'Voice', fx: 'Effects' };

/**
 * The kind of the sound on a track: its role, read as 208 reads it (a track without one: the Music track is Music,
 * the others Effects).
 * @param track the sound track
 * @returns the kind
 */
export function soundKind(track: Track): SoundKind {
  const role = soundRole(track);
  return role === 'effects' ? 'fx' : role;
}

/**
 * The class that colours a part by its kind.
 * @param kind the kind
 * @returns e.g. "kind-voice"
 */
export const kindClass = (kind: SoundKind): string => `kind-${kind}`;
