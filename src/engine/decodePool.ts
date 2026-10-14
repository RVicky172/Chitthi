import { transitionItems } from './stack';
import { MAIN_VIDEO, type Project, type TimedClip } from './timeline';
import { clipLength } from './video';

/*
 * The decoder pool (P2.4, specs/features/204-decoder-pool): the frames of every video visible at a time, for the
 * preview and the export alike. A pool keeps one **lane** per clip that needs pictures (two clips of one file get two
 * lanes), each with a frame source on the clip's file, up to `ahead` frames decoded ahead and the frame last handed
 * out, held until a newer one replaces it. Decoders, frames and bytes are bounded by `PoolLimits` whatever the
 * project's size. The pool knows nothing of Mediabunny: frames come from a `FrameSourceFactory` (frameSource.ts in the
 * app, a fake in the tests). Only the pool closes the frames it hands out.
 */

/** A decoded frame, as the pool holds and hands it out. */
export interface PoolFrame {
  image: CanvasImageSource;
  width: number;
  height: number;
  /** Source time the frame starts at, and how long it shows, seconds. */
  time: number;
  duration: number;
  close(): void;
}

/** Frames of one file, read in order. */
export interface FrameSource {
  /** Frames in order, starting with the one showing at a source time (the first frame if it is before it). Each
   * reader decodes on its own; `return()` stops it. */
  from(time: number): AsyncIterator<PoolFrame>;
  close(): void;
}

/** How frames are decoded: full size for the preview, resized canvases for an export lane (D5). */
export interface SourceOptions {
  maxWidth?: number;
}

/** Opens a frame source on a file (frameSource.ts's `mediabunnySource` in the app). */
export type FrameSourceFactory = (file: Blob, options: SourceOptions) => Promise<FrameSource>;

/** What a pool may hold at once. */
export interface PoolLimits {
  decoders: number;
  /** Frames decoded ahead of the one shown, per lane. */
  ahead: number;
  /** Decoded frames held at once, at width × height × 4 bytes each (D2). */
  bytes: number;
}

/** What a pool holds right now, as `stats` returns it. */
export interface PoolStats {
  decoders: number;
  frames: number;
  bytes: number;
  /** Times `peek` couldn't give the frame asked for. */
  holds: number;
}

/** A clip as the pool sees it: its file, the part of it used, and where it sits. */
export interface PoolClip {
  id: string;
  file: Blob;
  in: number;
  out: number;
  start: number;
  track: string;
}

/** Tolerance on times, as `frameTime`. */
const EPS = 1e-6;
/** A reader keeps going for a move forward under this many seconds, else restarts at the new time. */
const REREAD = 2;

/**
 * A time on the project's frame grid, as the export encodes it (D3).
 * @param time seconds
 * @param fps the project's frame rate
 * @returns the start of the frame showing at `time`
 */
export const frameTime = (time: number, fps: number) => Math.floor(time * fps + EPS) / fps;

/**
 * Q3: the visible clips plus the next to start plus one spare for scrubbing; 4 frames ahead; 256 MB / 1 GB.
 * @param videosAtOnce the most videos on screen at once
 * @param desktop whether this is the desktop app
 * @returns the pool's limits
 */
export function poolLimits(videosAtOnce: number, desktop: boolean): PoolLimits {
  return { decoders: videosAtOnce + 2, ahead: 4, bytes: (desktop ? 1024 : 256) * 2 ** 20 };
}

/** The clips a time needs, as `lanePlan` returns them. */
export interface LanePlan<C> {
  /** The video clips showing, bottom track first. */
  visible: C[];
  /** Each track's next video clip to start soon. */
  next: C[];
}

const endOf = (clip: TimedClip) => clip.start + clipLength(clip);

/**
 * The clip a picture track shows at a time: the one covering it; on the main track only, before 0 its first clip
 * (when that starts at 0) and at or past the video's end its last clip, as `videoAt` does.
 * @param onTrack the track's clips, in start order
 * @param track the track's id
 * @param time timeline seconds
 * @returns the clip, or undefined for a gap
 */
function clipAt<C extends TimedClip>(onTrack: readonly C[], track: string, time: number): C | undefined {
  const hit = onTrack.find((clip) => time >= clip.start && time < endOf(clip));
  if (hit || track !== MAIN_VIDEO) return hit;
  const first = onTrack.at(0);
  const last = onTrack.at(-1);
  if (!first || !last) return undefined;
  if (time < 0 && first.start <= 0) return first;
  return time >= endOf(last) ? last : undefined;
}

/**
 * A track's next video clip whose picture starts (its incoming transition first) less than `ahead` seconds after a
 * time.
 * @param onTrack the track's clips, in start order
 * @param shown the clips showing now
 * @param time timeline seconds
 * @param ahead seconds to look ahead
 * @returns the clip, or undefined
 */
function nextToStart<C extends TimedClip>(
  onTrack: readonly C[],
  shown: readonly C[],
  time: number,
  ahead: number,
): C | undefined {
  // A clip's picture starts half its incoming transition before the clip does.
  const pictureStart = (clip: C) =>
    clip.start - (onTrack.find((other) => other.transition?.to === clip.id)?.transition?.dur ?? 0) / 2;
  return onTrack.find(
    (clip) => !shown.includes(clip) && clip.kind === 'video' && clip.start > time && pictureStart(clip) - time < ahead,
  );
}

/**
 * The clips a time needs (Q10): the video clip visible on every visible picture track (bottom track first; the main
 * track clamps at its ends as `videoAt` does) and, during a transition, the other clip of it too (206); and each such
 * track's next video clip to start soon. Photos need no lane.
 * @param project the project
 * @param time timeline seconds
 * @param ahead seconds to look ahead for the next clips
 * @returns the visible clips and the next ones
 */
export function lanePlan<C extends TimedClip>(project: Project<C>, time: number, ahead: number): LanePlan<C> {
  const visible: C[] = [];
  const next: C[] = [];
  for (const track of project.tracks) {
    if ((track.kind !== 'video' && track.kind !== 'overlay') || track.hidden) continue;
    const onTrack = project.clips.filter((clip) => clip.track === track.id);
    if (!onTrack.length) continue;
    const hit = clipAt(onTrack, track.id, time);
    const shown = hit ? (transitionItems(onTrack, track.id, hit, time)?.map((item) => item.clip) ?? [hit]) : [];
    for (const clip of shown) if (clip.kind === 'video') visible.push(clip);
    const upcoming = nextToStart(onTrack, shown, time, ahead);
    if (upcoming) next.push(upcoming);
  }
  return { visible, next };
}

/** One Mediabunny iterator reading a lane's frames in order. */
interface Reader {
  iterator: AsyncIterator<PoolFrame>;
  /** Start of the last frame read. */
  lastTime: number | null;
  /** Where the next frame starts: the end of the last one read (the start time before any). */
  pos: number;
  read: number;
  ended: boolean;
}

/** An exact frame asked for (`frame()`). */
interface ExactAsk {
  time: number;
  resolve: (frame: PoolFrame | null) => void;
  reject: (error: Error) => void;
}

/** One clip's decoding: its source, its reader and the frames it holds. */
interface Lane {
  id: string;
  file: Blob;
  clip: PoolClip;
  src: FrameSource | null;
  opening: boolean;
  /** Waiting for a decoder to free up. */
  waiting: boolean;
  running: boolean;
  closed: boolean;
  failed: string | null;
  /** Times the decoder was taken back (not the file's fault) and the lane reopened. */
  reopened: number;
  reader: Reader | null;
  /** Decoded, not handed out yet, in time order. */
  buf: PoolFrame[];
  /** The frame handed out last: held until a newer one replaces it. */
  last: PoolFrame | null;
  /** An exact frame asked for; a newer ask replaces it. */
  exact: ExactAsk | null;
  /** Playing: `peek` asks for `target` and frames are decoded ahead. */
  playing: boolean;
  target: number;
  /** `prepare`: the first frame wanted. */
  prime: boolean;
  /** The source's first and last frame times, once seen. */
  head: number | null;
  tail: number | null;
  used: number;
}

/** What a step does next: nothing, done for now, decode ahead of the frame shown, or decode towards the goal. */
type NextMove = 'stop' | 'done' | 'ahead' | 'decode';

const bytesOf = (frame: PoolFrame) => frame.width * frame.height * 4;

/** Reopens of a lane whose decoder was taken back, before it goes to fallback. */
const REOPENS = 2;

/**
 * Whether the browser closed a decoder for its own reasons (Chrome: "Codec reclaimed due to inactivity"), not a bad
 * file.
 * @param error what the decoder threw
 * @returns true when the file can be opened again
 */
const takenBack = (error: unknown): boolean =>
  error instanceof DOMException && (error.name === 'QuotaExceededError' || /reclaim/i.test(error.message));

/**
 * The decoder pool: frames for the clips visible at a time, within its limits. See the module's header.
 */
export class DecodePool {
  private lanes = new Map<string, Lane>();
  private wanted = new Set<string>();
  /** Sources still opening for lanes already closed: they count as decoders until they open and are closed. */
  private orphans = 0;
  /** Bytes of frames being decoded, reserved before asking so the budget holds when they arrive. */
  private reserved = 0;
  private biggest = 0;
  private holds = 0;
  private clock = 0;
  private disposed = false;

  /**
   * A pool.
   * @param open opens a frame source on a file
   * @param limits what the pool may hold at once
   * @param source how its sources decode (an export lane's `maxWidth`)
   */
  constructor(
    private open: FrameSourceFactory,
    private limits: PoolLimits,
    private source: SourceOptions = {},
  ) {}

  /**
   * The frame showing at a source time, exactly (the export, a paused preview). A newer ask on the same clip resolves
   * this one to null (latest wins).
   * @param clip the clip
   * @param time source seconds
   * @returns the frame, or null when a newer ask replaced this one; rejects when the clip can't be decoded (see
   *   `fallback`)
   */
  frame(clip: PoolClip, time: number): Promise<PoolFrame | null> {
    if (this.disposed) return Promise.resolve(null);
    const lane = this.lane(clip);
    if (lane.failed) return Promise.reject(new Error(lane.failed));
    lane.playing = false;
    lane.exact?.resolve(null);
    lane.exact = null;
    const ready = this.covering(lane, time);
    if (ready) {
      this.hand(lane, ready);
      return Promise.resolve(ready);
    }
    return new Promise((resolve, reject) => {
      lane.exact = { time, resolve, reject };
      this.kick(lane);
    });
  }

  /**
   * Never waits: the frame for a source time if decoded, else the clip's last frame (a hold).
   * @param clip the clip
   * @param time source seconds
   * @returns the frame, or null before the clip's first
   */
  peek(clip: PoolClip, time: number): PoolFrame | null {
    if (this.disposed) return null;
    const lane = this.lane(clip);
    if (lane.failed) return null;
    lane.playing = true;
    lane.prime = false;
    lane.target = time;
    const frame = this.covering(lane, time);
    if (frame) this.hand(lane, frame);
    else {
      this.holds++;
      // Before its first shown frame, any decoded frame of the clip beats nothing.
      const first = lane.buf.at(0);
      if (!lane.last && first) this.hand(lane, first);
    }
    this.kick(lane);
    return frame ?? lane.last;
  }

  /**
   * Look-ahead: opens the clip's lane and decodes its first frame.
   * @param clip the clip
   */
  prepare(clip: PoolClip): void {
    if (this.disposed) return;
    const lane = this.lane(clip);
    if (lane.failed) return;
    if (!lane.last && !lane.buf.length && !lane.exact && !lane.playing) lane.prime = true;
    this.kick(lane);
  }

  /**
   * The clips still needed; the others are closed first when a limit needs room.
   * @param ids the clips' ids
   */
  want(ids: Iterable<string>): void {
    this.wanted = new Set(ids);
  }

  /**
   * Closes a clip's lane and frees what it holds.
   * @param id the clip's id
   */
  forget(id: string): void {
    const lane = this.lanes.get(id);
    if (lane) this.close(lane);
  }

  /**
   * Why a clip can't be decoded here.
   * @param id the clip's id
   * @returns the reason, or null
   */
  fallback(id: string): string | null {
    return this.lanes.get(id)?.failed ?? null;
  }

  /**
   * What the pool holds right now.
   * @returns its decoders, frames, bytes and holds
   */
  stats(): PoolStats {
    let frames = 0;
    for (const lane of this.lanes.values()) frames += lane.buf.length + (lane.last ? 1 : 0);
    return { decoders: this.decoders(), frames, bytes: this.held(), holds: this.holds };
  }

  /** Closes every lane; the pool gives no more frames. */
  dispose(): void {
    this.disposed = true;
    for (const lane of [...this.lanes.values()]) this.close(lane);
    this.wanted.clear();
  }

  /* ---------- lanes ---------- */

  private lane(clip: PoolClip): Lane {
    let lane = this.lanes.get(clip.id);
    if (lane && lane.file !== clip.file) {
      this.close(lane);
      lane = undefined;
    }
    if (!lane) {
      lane = {
        id: clip.id,
        file: clip.file,
        clip,
        src: null,
        opening: false,
        waiting: false,
        running: false,
        closed: false,
        failed: null,
        reopened: 0,
        reader: null,
        buf: [],
        last: null,
        exact: null,
        playing: false,
        target: 0,
        prime: false,
        head: null,
        tail: null,
        used: 0,
      };
      this.lanes.set(clip.id, lane);
    }
    lane.clip = clip;
    lane.used = ++this.clock;
    return lane;
  }

  private decoders(): number {
    let count = this.orphans;
    for (const lane of this.lanes.values()) if (lane.src || lane.opening) count++;
    return count;
  }

  private held(): number {
    let bytes = 0;
    for (const lane of this.lanes.values()) {
      for (const frame of lane.buf) bytes += bytesOf(frame);
      if (lane.last) bytes += bytesOf(lane.last);
    }
    return bytes;
  }

  /**
   * Lanes in the order they give way: not wanted first, then least recently used.
   * @param except the lane that needs room
   * @returns the other lanes
   */
  private byPriority(except: Lane): Lane[] {
    return [...this.lanes.values()]
      .filter((lane) => lane !== except)
      .sort(
        (left, right) => Number(this.wanted.has(left.id)) - Number(this.wanted.has(right.id)) || left.used - right.used,
      );
  }

  /**
   * Frees a lane's resources: frames, reader, source.
   * @param lane the lane
   */
  private release(lane: Lane): void {
    lane.exact?.resolve(null);
    lane.exact = null;
    for (const frame of lane.buf) frame.close();
    lane.buf = [];
    lane.last?.close();
    lane.last = null;
    this.stopReader(lane);
    if (lane.src) {
      lane.src.close();
      lane.src = null;
    }
  }

  private close(lane: Lane): void {
    if (lane.closed) return;
    lane.closed = true;
    this.release(lane);
    if (lane.opening) this.orphans++;
    if (this.lanes.get(lane.id) === lane) this.lanes.delete(lane.id);
    this.wake();
  }

  private fail(lane: Lane, error: unknown): void {
    const reason = error instanceof Error ? error.message : String(error);
    const ask = lane.exact;
    lane.exact = null;
    this.release(lane);
    lane.failed = reason;
    ask?.reject(new Error(reason));
    this.wake();
  }

  /** Lanes waiting for a decoder try again. */
  private wake(): void {
    for (const lane of this.lanes.values()) if (lane.waiting) this.kick(lane);
  }

  private kick(lane: Lane): void {
    void this.run(lane);
  }

  // Read through a call: other async work closes or fails a lane while this one awaits, which TypeScript's narrowing
  // of `lane.closed` can't see.
  private isClosed(lane: Lane): boolean {
    return lane.closed;
  }

  private isLive(lane: Lane): boolean {
    return !lane.closed && !lane.failed;
  }

  /* ---------- the work of one lane: one worker at a time ---------- */

  private async run(lane: Lane): Promise<void> {
    if (lane.running || lane.closed || lane.failed) return;
    lane.running = true;
    let reopen = false;
    try {
      await this.work(lane);
    } catch (error) {
      if (this.isClosed(lane)) return;
      reopen = this.reopenAfter(lane, error);
    } finally {
      lane.running = false;
      if (reopen) this.kick(lane);
    }
  }

  /**
   * Opens the lane's source, then steps towards its goal until there is nothing to do.
   * @param lane the lane
   */
  private async work(lane: Lane): Promise<void> {
    while (this.isLive(lane)) {
      if (!lane.src) {
        if (!(await this.openLane(lane))) return;
      } else if (!(await this.step(lane))) return;
    }
  }

  /**
   * After a decoding error: the browser took the decoder back (an idle background tab, too many decoders), so the
   * file is fine and the lane opens it again rather than put the clip in fallback, which would say it can't be
   * exported; any other error puts the clip in fallback.
   * @param lane the lane
   * @param error what the decoder threw
   * @returns true when the lane is to be reopened
   */
  private reopenAfter(lane: Lane, error: unknown): boolean {
    if (!takenBack(error) || lane.reopened >= REOPENS) {
      this.fail(lane, error);
      return false;
    }
    // The frame asked for is still wanted: it comes from the reopened decoder.
    const ask = lane.exact;
    lane.exact = null;
    lane.reopened++;
    this.release(lane);
    lane.exact = ask;
    return true;
  }

  private async openLane(lane: Lane): Promise<boolean> {
    if (this.goal(lane) === null) return false;
    // Closing a lane wakes the waiting ones, which may take its decoder: check again until there is one.
    while (this.decoders() >= this.limits.decoders) {
      // Close an open lane (not one still opening: that frees nothing yet), not wanted first, then oldest.
      const victim = this.byPriority(lane).find((other) => other.src);
      if (!victim) {
        lane.waiting = true;
        return false;
      }
      this.close(victim);
    }
    lane.waiting = false;
    lane.opening = true;
    let opened: FrameSource;
    try {
      opened = await this.open(lane.file, this.source);
    } catch (error) {
      lane.opening = false;
      if (lane.closed) {
        this.orphans--;
        this.wake();
        return false;
      }
      throw error;
    }
    lane.opening = false;
    if (lane.closed) {
      opened.close();
      this.orphans--;
      this.wake();
      return false;
    }
    lane.src = opened;
    return true;
  }

  private goal(lane: Lane): number | null {
    if (lane.exact) return lane.exact.time;
    if (lane.playing) return lane.target;
    if (lane.prime) return lane.clip.in;
    return null;
  }

  private covers(lane: Lane, frame: PoolFrame, time: number): boolean {
    if (frame.time <= time + EPS)
      return time + EPS < frame.time + frame.duration || (lane.tail !== null && frame.time >= lane.tail - EPS);
    return lane.head !== null && frame.time <= lane.head + EPS;
  }

  private covering(lane: Lane, time: number): PoolFrame | null {
    if (lane.last && this.covers(lane, lane.last, time)) return lane.last;
    return lane.buf.find((frame) => this.covers(lane, frame, time)) ?? null;
  }

  /**
   * Hands a frame out: it replaces the last one, and frames before it are no longer needed.
   * @param lane the lane
   * @param frame the frame
   */
  private hand(lane: Lane, frame: PoolFrame): void {
    if (lane.last !== frame) {
      lane.last?.close();
      lane.last = frame;
    }
    const keep: PoolFrame[] = [];
    for (const buffered of lane.buf) {
      if (buffered === frame) continue;
      if (buffered.time < frame.time) buffered.close();
      else keep.push(buffered);
    }
    lane.buf = keep;
  }

  /**
   * One step towards the lane's goal.
   * @param lane the lane
   * @returns false when there is nothing to do
   */
  private async step(lane: Lane): Promise<boolean> {
    const goalTime = this.goal(lane);
    if (goalTime === null) return false;
    const covered = this.covering(lane, goalTime);
    const move = this.nextMove(lane, covered);
    if (move === 'stop') return false;
    if (move === 'done') return true;
    const source = lane.src;
    if (!source) return false;
    const ahead = move === 'ahead';
    const reader = this.readerFor(lane, source, goalTime, ahead ? covered : null);
    if (!reader) return false;
    return this.readNext(lane, reader, goalTime, ahead);
  }

  /**
   * What a step does with the frame covering the goal: an exact ask takes it; playing decodes ahead of it (up to
   * `ahead` frames); a prepare is done with it. Without one, decode towards the goal.
   * @param lane the lane
   * @param covered the frame covering the goal, if decoded
   * @returns what the step does next
   */
  private nextMove(lane: Lane, covered: PoolFrame | null): NextMove {
    if (lane.exact) {
      if (!covered) return 'decode';
      const ask = lane.exact;
      lane.exact = null;
      this.hand(lane, covered);
      ask.resolve(covered);
      return 'done';
    }
    if (lane.playing) {
      if (!covered) return 'decode';
      return lane.buf.length >= this.limits.ahead ? 'stop' : 'ahead';
    }
    if (!covered) return 'decode';
    lane.prime = false;
    return 'done';
  }

  /**
   * The reader to decode with: decoding ahead goes on after the frame shown, from where the reader is if it's there;
   * else from the goal. A reader too far off restarts.
   * @param lane the lane
   * @param source its frame source
   * @param goalTime the source time wanted
   * @param shown the frame shown, when decoding ahead of it
   * @returns the reader, or null when decoding ahead and the source has ended
   */
  private readerFor(lane: Lane, source: FrameSource, goalTime: number, shown: PoolFrame | null): Reader | null {
    const current = lane.reader;
    if (shown) {
      const after = shown.time + shown.duration;
      if (current?.ended) return null;
      if (!current || current.pos + EPS < after || current.pos >= after + REREAD) this.restart(lane, source, after);
    } else if (!current || current.ended || goalTime < current.pos - EPS || goalTime >= current.pos + REREAD)
      this.restart(lane, source, goalTime);
    return lane.reader;
  }

  /**
   * Decodes the reader's next frame within the byte budget.
   * @param lane the lane
   * @param reader its reader
   * @param goalTime the source time wanted
   * @param ahead whether this decodes ahead of the frame shown
   * @returns false when there is nothing more to do now
   */
  private async readNext(lane: Lane, reader: Reader, goalTime: number, ahead: boolean): Promise<boolean> {
    const size = this.sizeOf(lane);
    if (this.held() + this.reserved + size > this.limits.bytes) {
      if (ahead) return false;
      this.makeRoom(lane, size);
    }
    this.reserved += size;
    let result: IteratorResult<PoolFrame>;
    try {
      result = await reader.iterator.next();
    } finally {
      this.reserved -= size;
    }
    if (lane.closed || lane.reader !== reader) {
      if (!result.done) result.value.close();
      return !lane.closed;
    }
    if (result.done) {
      reader.ended = true;
      if (!reader.read) throw new Error('The video has no frames');
      lane.tail = reader.lastTime;
      return true;
    }
    return this.keep(lane, reader, result.value, goalTime, ahead);
  }

  /**
   * Keeps a decoded frame in the lane's buffer, within the byte budget.
   * @param lane the lane
   * @param reader the reader it came from
   * @param frame the frame
   * @param goalTime the source time wanted
   * @param ahead whether this decodes ahead of the frame shown
   * @returns false when decoding ahead must stop
   */
  private keep(lane: Lane, reader: Reader, frame: PoolFrame, goalTime: number, ahead: boolean): boolean {
    if (!reader.read && frame.time > reader.pos + EPS) lane.head = Math.min(lane.head ?? frame.time, frame.time);
    reader.read++;
    reader.lastTime = frame.time;
    reader.pos = frame.time + frame.duration;
    this.biggest = Math.max(this.biggest, bytesOf(frame));
    lane.buf.push(frame);
    this.prune(lane, goalTime);
    if (this.held() <= this.limits.bytes) return true;
    this.makeRoom(lane, 0);
    if (ahead && this.held() > this.limits.bytes) {
      lane.buf.pop()?.close();
      this.stopReader(lane);
      return false;
    }
    return true;
  }

  /**
   * Of the unshown frames at or before a time only the newest is kept (it may be the source's last).
   * @param lane the lane
   * @param time the source time wanted
   */
  private prune(lane: Lane, time: number): void {
    let newest = -1;
    for (const [index, frame] of lane.buf.entries()) if (frame.time <= time + EPS) newest = index;
    if (newest <= 0) return;
    for (const frame of lane.buf.slice(0, newest)) frame.close();
    lane.buf = lane.buf.slice(newest);
  }

  private restart(lane: Lane, source: FrameSource, time: number): void {
    this.stopReader(lane);
    for (const frame of lane.buf) frame.close();
    lane.buf = [];
    lane.reader = { iterator: source.from(time), lastTime: null, pos: time, read: 0, ended: false };
  }

  private stopReader(lane: Lane): void {
    const reader = lane.reader;
    lane.reader = null;
    if (reader?.iterator.return) void reader.iterator.return().catch(() => undefined);
  }

  private sizeOf(lane: Lane): number {
    const frame = lane.last ?? lane.buf.at(0);
    return frame ? bytesOf(frame) : this.biggest;
  }

  /**
   * Room for more bytes: other lanes' frames decoded ahead go first, then their held frames.
   * @param lane the lane that needs room
   * @param size the bytes needed
   */
  private makeRoom(lane: Lane, size: number): void {
    const over = () => this.held() + this.reserved + size > this.limits.bytes;
    const others = this.byPriority(lane);
    for (const other of others) {
      const goalTime = this.goal(other);
      const first = other.buf.at(0);
      const keep = goalTime !== null && first && this.covers(other, first, goalTime) ? 1 : 0;
      while (over() && other.buf.length > keep) {
        other.buf.pop()?.close();
        this.stopReader(other);
      }
      if (!over()) return;
    }
    for (const other of others) {
      if (!over()) return;
      for (const frame of other.buf) frame.close();
      other.buf = [];
      this.stopReader(other);
      other.last?.close();
      other.last = null;
    }
  }
}
