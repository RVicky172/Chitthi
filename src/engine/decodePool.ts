import {
  EPS,
  bytesOf,
  covering,
  covers,
  hand,
  keepInChunk,
  newLane,
  prune,
  restart,
  startChunk,
  stopReader,
  type Lane,
  type Reader,
} from './poolLane';
import type { MediaFile } from './mediaFile';
import { REVERSE_NUDGE } from './speed';

/*
 * The decoder pool (P2.4, specs/features/204-decoder-pool): the frames of every video visible at a time, for the
 * preview and the export alike. A pool keeps one **lane** per clip that needs pictures (two clips of one file get two
 * lanes), each with a frame source on the clip's file, up to `ahead` frames decoded ahead and the frame last handed
 * out, held until a newer one replaces it. Decoders, frames and bytes are bounded by `PoolLimits` whatever the
 * project's size. The pool knows nothing of Mediabunny: frames come from a `FrameSourceFactory` (frameSource.ts in the
 * app, a fake in the tests). Only the pool closes the frames it hands out.
 *
 * Speed (207 §3): a reader jumps to the next key frame rather than decode through to a frame past it (D3); a reversed
 * lane decodes backwards in chunks (the key frame before the newest frame wanted up to it, at most `ahead` × 4 frames)
 * and hands them out newest first; a still lane (a freeze frame) decodes its one frame and holds it.
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
  /** Frames in order, starting with the one showing at a source time (the first frame if it is before it), up to the
   * frame showing at `end` when given (a reversed lane's chunk). Each reader decodes on its own; `return()` stops it. */
  from(time: number, end?: number): AsyncIterator<PoolFrame>;
  /** The start of the key frame a reader starting at a time decodes from (207: reverse chunks). Missing: unknown. */
  keyBefore?(time: number): Promise<number>;
  /** The start of the next key frame after a time, or null after the last (207: key-frame skips). Missing: unknown. */
  keyAfter?(time: number): Promise<number | null>;
  close(): void;
}

/** How frames are decoded: full size for the preview, resized canvases for an export lane (D5). */
export interface SourceOptions {
  maxWidth?: number;
  /** A reversed lane's source (207): it holds a chunk of frames at once, so its canvases come from no shared ring. */
  reverse?: boolean;
  /** The width a reversed lane decodes at when `maxWidth` isn't set: the preview's stage size (D4), so a chunk fits. */
  reverseWidth?: number;
}

/** Opens a frame source on a file (frameSource.ts's `mediabunnySource` in the app). */
export type FrameSourceFactory = (file: MediaFile, options: SourceOptions) => Promise<FrameSource>;

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
  file: MediaFile;
  in: number;
  out: number;
  start: number;
  track: string;
  /** Plays from `out` back to `in` (207): the lane decodes backwards in chunks and hands frames out newest first. */
  reverse?: boolean;
  /** A freeze frame (207): one source time throughout, decoded once and held. */
  still?: boolean;
}

/** Without key frames known, a reader keeps going for a move forward under this many seconds, else restarts there. */
const REREAD = 2;
/** A frame's length before any frame of the file was seen (30 fps). */
const FRAME_GUESS = 1 / 30;

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

/** What a step does next: nothing, done for now, decode ahead of the frame shown, or decode towards the goal. */
type NextMove = 'stop' | 'done' | 'ahead' | 'decode';

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
    const ready = covering(lane, time);
    if (ready) {
      hand(lane, ready);
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
    const frame = covering(lane, time);
    if (frame) hand(lane, frame);
    else {
      this.holds++;
      // Before its first shown frame, any decoded frame of the clip beats nothing (a reversed lane's newest).
      const first = lane.clip.reverse ? lane.buf.at(-1) : lane.buf.at(0);
      if (!lane.last && first) hand(lane, first);
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
    // A lane turned around decodes another way (and at another size, D4): it opens again.
    if (lane && (lane.file !== clip.file || Boolean(lane.clip.reverse) !== Boolean(clip.reverse))) {
      this.close(lane);
      lane = undefined;
    }
    if (!lane) {
      lane = newLane(clip);
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
    stopReader(lane);
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
      opened = await this.open(lane.file, this.optionsFor(lane.clip));
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

  /**
   * How a lane's source decodes: a reversed lane's at the stage's size when the pool has no size of its own (D4).
   * @param clip the lane's clip
   * @returns the source's options
   */
  private optionsFor(clip: PoolClip): SourceOptions {
    if (!clip.reverse) return this.source;
    const maxWidth = this.source.maxWidth ?? this.source.reverseWidth;
    return { ...this.source, reverse: true, ...(maxWidth ? { maxWidth } : {}) };
  }

  private goal(lane: Lane): number | null {
    if (lane.exact) return lane.exact.time;
    if (lane.playing) return lane.target;
    if (lane.prime) return lane.clip.reverse ? lane.clip.out - REVERSE_NUDGE : lane.clip.in;
    return null;
  }

  /**
   * One step towards the lane's goal.
   * @param lane the lane
   * @returns false when there is nothing to do
   */
  private async step(lane: Lane): Promise<boolean> {
    const goalTime = this.goal(lane);
    if (goalTime === null) return false;
    const covered = covering(lane, goalTime);
    const move = this.nextMove(lane, covered);
    if (move === 'stop') return false;
    if (move === 'done') return true;
    const source = lane.src;
    if (!source) return false;
    const ahead = move === 'ahead';
    const shown = ahead ? covered : null;
    const reader = await (lane.clip.reverse
      ? this.chunkReader(lane, source, goalTime, shown)
      : this.readerFor(lane, source, goalTime, shown));
    if (!reader || !this.isLive(lane)) return false;
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
      hand(lane, covered);
      // A freeze frame's one frame is all it needs: its reader stops.
      if (lane.clip.still) stopReader(lane);
      ask.resolve(covered);
      return 'done';
    }
    if (lane.playing) {
      if (!covered) return 'decode';
      if (lane.clip.still) {
        stopReader(lane);
        return 'stop';
      }
      return this.decodedAhead(lane, covered) ? 'stop' : 'ahead';
    }
    if (!covered) return 'decode';
    lane.prime = false;
    return 'done';
  }

  /**
   * Whether a playing lane has decoded enough ahead of the frame shown: `ahead` frames; a reversed lane a chunk's
   * worth of older frames (a chunk stopped part-way goes on as they are shown: its missing frames are the newest).
   * @param lane the lane
   * @param shown the frame covering the goal
   * @returns true when it is to stop for now
   */
  private decodedAhead(lane: Lane, shown: PoolFrame): boolean {
    if (!lane.clip.reverse) return lane.buf.length >= this.limits.ahead;
    return lane.buf.filter((frame) => frame.time < shown.time).length >= this.chunkFrames();
  }

  /**
   * Most frames a reversed lane's chunk holds (plan, Techniques).
   * @returns `ahead` × 4
   */
  private chunkFrames(): number {
    return this.limits.ahead * 4;
  }

  /**
   * The reader to decode with: decoding ahead goes on after the frame shown, from where the reader is if it's there;
   * else from the goal. A reader too far off restarts: past its next key frame (D3), or `REREAD` seconds on when its
   * source doesn't tell key frames.
   * @param lane the lane
   * @param source its frame source
   * @param goalTime the source time wanted
   * @param shown the frame shown, when decoding ahead of it
   * @returns the reader, or null when decoding ahead and the source has ended
   */
  private async readerFor(
    lane: Lane,
    source: FrameSource,
    goalTime: number,
    shown: PoolFrame | null,
  ): Promise<Reader | null> {
    const current = lane.reader;
    if (shown) {
      const after = shown.time + shown.duration;
      if (current?.ended) return null;
      if (!current || current.pos + EPS < after || current.pos >= after + REREAD) restart(lane, source, after);
    } else if (
      !current ||
      current.ended ||
      goalTime < current.pos - EPS ||
      (await this.pastNextKey(source, current, goalTime))
    )
      restart(lane, source, goalTime);
    return lane.reader;
  }

  /**
   * Whether a time is past the reader's next key frame, so that restarting there decodes less than reading on (D3).
   * @param source the frame source
   * @param reader the reader
   * @param time the source time wanted
   * @returns true when the reader is to restart at the time
   */
  private async pastNextKey(source: FrameSource, reader: Reader, time: number): Promise<boolean> {
    if (!source.keyAfter) return time >= reader.pos + REREAD;
    if (reader.nextKey === undefined || (reader.nextKey !== null && reader.pos >= reader.nextKey - EPS))
      reader.nextKey = await source.keyAfter(reader.pos);
    return reader.nextKey !== null && time >= reader.nextKey - EPS;
  }

  /**
   * A reversed lane's reader (207 §3c): the chunk being read when it reaches what is wanted, else a new chunk up to
   * the goal or, decoding ahead, up to the frame before the oldest one held. A chunk starts at the key frame before
   * its newest frame, at most a chunk's frames earlier and not before the clip's in point.
   * @param lane the lane
   * @param source its frame source
   * @param goalTime the source time wanted
   * @param shown the frame shown, when decoding ahead of it
   * @returns the reader, or null when decoding ahead and the clip's first frame is held
   */
  private async chunkReader(
    lane: Lane,
    source: FrameSource,
    goalTime: number,
    shown: PoolFrame | null,
  ): Promise<Reader | null> {
    const current = lane.reader;
    const chunk = current && !current.ended ? current.chunk : undefined;
    if (
      chunk &&
      current &&
      (shown ? chunk.upTo < shown.time : current.pos <= goalTime + EPS && goalTime <= chunk.upTo + EPS)
    )
      return current;
    let upTo = goalTime;
    if (shown) {
      const oldest = lane.buf.at(0) ?? shown;
      if (oldest.time <= Math.max(lane.clip.in, lane.head ?? 0) + EPS) return null;
      upTo = oldest.time - oldest.duration / 2;
    }
    const duration = (lane.last ?? lane.buf.at(0))?.duration ?? FRAME_GUESS;
    let from = upTo - (this.chunkFrames() - 0.5) * duration;
    if (upTo >= lane.clip.in) from = Math.max(from, lane.clip.in);
    if (source.keyBefore) from = Math.max(from, await source.keyBefore(upTo));
    if (!this.isLive(lane)) return null;
    startChunk(lane, source, from, upTo);
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
    if (reader.chunk) this.slide(lane, reader.chunk.below, size);
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
    const { chunk } = reader;
    // A first frame after where the reader started (after a chunk's newest, reversed) is the file's first.
    const first = frame.time > reader.pos + EPS || (chunk !== undefined && frame.time > chunk.upTo + EPS);
    if (!reader.read && first) lane.head = Math.min(lane.head ?? frame.time, frame.time);
    reader.read++;
    reader.lastTime = frame.time;
    reader.pos = frame.time + frame.duration;
    this.biggest = Math.max(this.biggest, bytesOf(frame));
    if (chunk) {
      if (!keepInChunk(lane, chunk, frame)) return true;
    } else {
      lane.buf.push(frame);
      prune(lane, goalTime);
    }
    if (this.held() <= this.limits.bytes) return true;
    this.makeRoom(lane, 0);
    if (ahead && this.held() > this.limits.bytes) {
      lane.buf = lane.buf.filter((buffered) => buffered !== frame);
      frame.close();
      stopReader(lane);
      return false;
    }
    return true;
  }

  /**
   * Room in a reversed lane for its chunk's next frame: the chunk's oldest frames go first (they show last), so it
   * holds at most a chunk's frames and stays within the byte budget.
   * @param lane the lane
   * @param below the chunk's frames are the ones before this time
   * @param size the bytes of the next frame
   */
  private slide(lane: Lane, below: number, size: number): void {
    const own = () => lane.buf.filter((frame) => frame.time < below - EPS).length;
    const over = () => this.held() + this.reserved + size > this.limits.bytes;
    while (own() > 0 && (own() >= this.chunkFrames() || over())) lane.buf.shift()?.close();
  }

  private sizeOf(lane: Lane): number {
    const frame = lane.last ?? lane.buf.at(0);
    return frame ? bytesOf(frame) : this.biggest;
  }

  /**
   * Closes a lane's frames decoded ahead while the pool is over its budget: newest first (oldest first, reversed: they
   * show last); the one covering its goal stays.
   * @param lane the lane giving way
   * @param over whether the pool is still over its budget
   */
  private dropAhead(lane: Lane, over: () => boolean): void {
    const goalTime = this.goal(lane);
    const reverse = Boolean(lane.clip.reverse);
    const shown = reverse ? lane.buf.at(-1) : lane.buf.at(0);
    const keep = goalTime !== null && shown && covers(lane, shown, goalTime) ? 1 : 0;
    while (over() && lane.buf.length > keep) {
      (reverse ? lane.buf.shift() : lane.buf.pop())?.close();
      stopReader(lane);
    }
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
      this.dropAhead(other, over);
      if (!over()) return;
    }
    for (const other of others) {
      if (!over()) return;
      for (const frame of other.buf) frame.close();
      other.buf = [];
      stopReader(other);
      other.last?.close();
      other.last = null;
    }
  }
}
