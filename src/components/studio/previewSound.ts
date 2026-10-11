// The video stage's clip sound (204 §4, D1): audio-only <audio> elements on the clip's file, for the clip under the
// playhead, the next one within 2 s and a clip an overlay covers for now, released after, so elements don't grow with
// the clip count and the pool alone decodes pictures. Kept within a frame of the picture by nudging playbackRate (AC-8, Q5). The music keeps its
// own element in VideoStage.
import { lanePlan } from '../../engine/decodePool';
import { MAIN_VIDEO, videoAt, type Project, type TimedClip } from '../../engine/timeline';

/**
 * Whose sound plays at playhead `t`: the video clip on top (a photo has none); the video clips starting within `ahead`
 * seconds, to load and pre-seek; and the other video clips under the playhead (covered by an overlay), kept loaded
 * and silent so they play on when it ends. A hidden video track still plays its clips' sound (201 D2): the clips are
 * found as if it were shown.
 */
export function soundPlan<C extends TimedClip>(
  p: Project<C>,
  t: number,
  ahead = 2,
): { current: { clip: C; local: number } | null; next: C[]; held: C[] } {
  const shown = { ...p, tracks: p.tracks.map((tr) => (tr.id === MAIN_VIDEO ? { ...tr, hidden: false } : tr)) };
  const at = videoAt(shown, t),
    lanes = lanePlan(shown, t, ahead);
  const current = at?.clip.kind === 'video' ? at : null;
  return { current, next: lanes.next, held: lanes.visible.filter((c) => c.id !== current?.clip.id) };
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

/** The clip sound of one stage: at most the current clip's element and the next ones' (pre-seeked to their `in`). */
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
  const sound = {
    /**
     * One tick (a soundPlan): `current` is the clip whose sound plays at the playhead (with its local time), `next` the
     * clips to start within 2 s (pre-seeked to their `in`), `held` the covered clips (kept, silent); every other element
     * is released. Playing, the current element plays (seeked first if it was paused elsewhere) and is kept in step;
     * paused, it waits at the playhead's time.
     */
    update(
      {
        current,
        next,
        held,
      }: { current: { clip: SoundClip; local: number } | null; next: SoundClip[]; held: SoundClip[] },
      play: boolean,
      fps: number,
    ) {
      const keep = new Set([...(current ? [current.clip.id] : []), ...next.map((c) => c.id), ...held.map((c) => c.id)]);
      for (const [id, el] of els)
        if (!keep.has(id)) {
          release(el);
          els.delete(id);
        }
      for (const c of next) {
        if (c.id === current?.clip.id) continue;
        const el = element(c);
        halt(el);
        if (Math.abs(el.currentTime - c.in) > SETTLED) el.currentTime = c.in;
      }
      for (const c of held) if (c.id !== current?.clip.id) halt(element(c));
      if (!current) return;
      const { clip: c, local } = current;
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
