// The video stage's clip sound (204 §4, D1): audio-only <audio> elements on the clip's file, for every clip sounding
// under the playhead (the main track's and each unmuted overlay track's, 203 §7), the next ones within 2 s and the
// clips of muted overlay tracks on screen, released after, so elements don't grow with the clip count and the pool
// alone decodes pictures. Kept within a frame of the picture by nudging playbackRate (AC-8, Q5). The music keeps its
// own element in VideoStage.
import { lanePlan } from '../../engine/decodePool';
import { frameStack } from '../../engine/stack';
import { type Project, type TimedClip } from '../../engine/timeline';

/**
 * Whose sound plays at playhead `t`: every video clip under it, bottom track first: the main track's and each overlay
 * track's that isn't muted (a photo has none); the video clips starting within `ahead` seconds on those tracks, to load
 * and pre-seek; and the video clips under it on muted overlay tracks, kept loaded and silent so an Unmute plays at
 * once. Hide is about pictures: a hidden track still plays its clips' sound (201 D2, 203 Q7), so the clips are found
 * as if every track were shown. "Under the playhead" is frameStack's (its EDGE_EPS edges), so the sound starts on the
 * frame the picture does. Every clip in `current` and `held` is under the playhead at once (on screen or on a hidden
 * track), so together they stay within `mostVideosAt`, the videos-at-once limit (203 AC-9).
 */
export function soundPlan<C extends TimedClip>(
  p: Project<C>,
  t: number,
  ahead = 2,
): { current: { clip: C; local: number }[]; next: C[]; held: C[] } {
  const shown = { ...p, tracks: p.tracks.map((tr) => (tr.hidden ? { ...tr, hidden: false } : tr)) };
  const muted = new Set(p.tracks.filter((tr) => tr.kind === 'overlay' && tr.muted).map((tr) => tr.id));
  const current: { clip: C; local: number }[] = [],
    held: C[] = [];
  for (const it of frameStack(shown, t)) {
    if (it.clip.kind !== 'video') continue;
    if (muted.has(it.track)) held.push(it.clip);
    else current.push({ clip: it.clip, local: it.local });
  }
  const on = new Set([...current.map((x) => x.clip.id), ...held.map((c) => c.id)]);
  const sounding = { ...shown, tracks: shown.tracks.filter((tr) => !muted.has(tr.id)) };
  return { current, next: lanePlan(sounding, t, ahead).next.filter((c) => !on.has(c.id)), held };
}

/** Over this drift (seconds) the element seeks instead of catching up. */
export const SEEK_DRIFT = 0.25;
/** The most playbackRate moves away from 1 to catch up (±3 %). */
export const MAX_NUDGE = 0.03;
/** A nudge stops once the drift is within this (seconds). */
export const SETTLED = 0.01;

/**
 * How to correct a playing element whose sound is `drift` seconds ahead (positive) or behind (negative) the picture,
 * given its playbackRate now: seek over SEEK_DRIFT; over one frame (or still nudging and over SETTLED) a rate up to
 * ±MAX_NUDGE toward catching up (twice the gap per second); otherwise 1.
 */
export function soundFix(drift: number, fps: number, rate: number): { seek: true } | { seek: false; rate: number } {
  const a = Math.abs(drift);
  if (a > SEEK_DRIFT) return { seek: true };
  // In steps of 0.5 %, so the element's rate is written only when the step changes, not on every tick.
  if (a > 1 / fps || (rate !== 1 && a > SETTLED))
    return { seek: false, rate: Math.round((1 - Math.sign(drift) * Math.min(MAX_NUDGE, a * 2)) * 200) / 200 };
  return { seek: false, rate: 1 };
}

export interface SoundClip {
  id: string;
  url: string;
  in: number;
  out: number;
  volume: number;
}

/** The clip sound of one stage: one element per current clip, the next ones' (pre-seeked to their `in`) and the held. */
export function previewSound() {
  const els = new Map<string, HTMLAudioElement>();
  /** Elements whose sound is coming out (after 'playing'): only those are drift-corrected. */
  const started = new WeakSet<HTMLAudioElement>();
  const element = (c: SoundClip) => {
    let el = els.get(c.id);
    if (!el) {
      el = document.createElement('audio');
      el.preload = 'auto';
      el.dataset.clip = c.id;
      el.src = c.url;
      el.currentTime = c.in;
      const a = el;
      a.addEventListener('playing', () => started.add(a));
      a.addEventListener('pause', () => started.delete(a));
      a.addEventListener('waiting', () => started.delete(a));
      els.set(c.id, el);
    }
    el.volume = Math.max(0, Math.min(1, c.volume));
    el.muted = c.volume <= 0;
    return el;
  };
  const release = (el: HTMLAudioElement) => {
    el.pause();
    el.removeAttribute('src');
    el.load();
  };
  const halt = (el: HTMLAudioElement) => {
    if (!el.paused) el.pause();
    if (el.playbackRate !== 1) el.playbackRate = 1;
  };
  /** One current clip's element at `local` seconds into the clip: playing and kept in step, or waiting there. */
  const follow = (c: SoundClip, local: number, play: boolean, fps: number) => {
    const el = element(c),
      want = c.in + local;
    if (local < 0 || want >= c.out - 1e-3) return halt(el);
    if (!play) {
      halt(el);
      if (Math.abs(el.currentTime - want) > SETTLED) el.currentTime = want;
      return;
    }
    if (el.paused) {
      // A pre-seeked element starts at once on the cut's tick (a frame late at most); a seek would delay it.
      if (Math.abs(el.currentTime - want) > 1 / fps) el.currentTime = want;
      el.playbackRate = 1;
      void el.play().catch(() => undefined);
      return;
    }
    if (!started.has(el)) return;
    const fix = soundFix(el.currentTime - want, fps, el.playbackRate);
    if (fix.seek) {
      el.currentTime = want;
      el.playbackRate = 1;
    } else if (fix.rate !== el.playbackRate) el.playbackRate = fix.rate;
  };
  const sound = {
    /**
     * One tick (a soundPlan): `current` are the clips whose sound plays at the playhead (each with its local time),
     * `next` the clips to start within 2 s (pre-seeked to their `in`), `held` the silent clips on screen (kept loaded);
     * every other element is released. Playing, each current element plays (seeked first if it was paused elsewhere)
     * and is kept in step on its own; paused, each waits at its clip's time.
     */
    update(
      { current, next, held }: { current: { clip: SoundClip; local: number }[]; next: SoundClip[]; held: SoundClip[] },
      play: boolean,
      fps: number,
    ) {
      const playing = new Set(current.map((x) => x.clip.id));
      const keep = new Set([...playing, ...next.map((c) => c.id), ...held.map((c) => c.id)]);
      for (const [id, el] of els)
        if (!keep.has(id)) {
          release(el);
          els.delete(id);
        }
      for (const c of next) {
        if (playing.has(c.id)) continue;
        const el = element(c);
        halt(el);
        if (Math.abs(el.currentTime - c.in) > SETTLED) el.currentTime = c.in;
      }
      for (const c of held)
        if (!playing.has(c.id)) {
          // A muted track's clip: loaded and silent (muted, not only paused), so an Unmute plays at once.
          const el = element(c);
          halt(el);
          el.muted = true;
        }
      for (const x of current) follow(x.clip, x.local, play, fps);
    },
    /** The element playing a clip's sound now, if any (self-tests capture it: AC-8). */
    element: (id: string): HTMLAudioElement | undefined => els.get(id),
    /** How many elements are open (bounded: the clips under the playhead and the next ones). */
    get size() {
      return els.size;
    },
    dispose() {
      liveSounds.delete(sound);
      for (const el of els.values()) release(el);
      els.clear();
    },
  };
  liveSounds.add(sound);
  return sound;
}

/** The stage sounds alive now (the editor's), so self-tests can reach a clip's <audio> element. */
export const liveSounds = new Set<ReturnType<typeof previewSound>>();
