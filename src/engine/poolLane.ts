import type { FrameSource, PoolClip, PoolFrame } from './decodePool';

/*
 * One lane of the decoder pool (decodePool.ts): what it holds and the bookkeeping of its frames, which frame covers a
 * time, handing one out, pruning, and its reader (a reversed lane's chunks, 207). Moved out of decodePool.ts (207
 * T022) so the pool keeps the scheduling and the limits; nothing here waits or decodes.
 */

/** Tolerance on times, as `frameTime`. */
export const EPS = 1e-6;

/**
 * A frame's bytes as the pool counts them (D2).
 * @param frame the frame
 * @returns width × height × 4
 */
export const bytesOf = (frame: PoolFrame) => frame.width * frame.height * 4;

/** One Mediabunny iterator reading a lane's frames in order. */
export interface Reader {
  iterator: AsyncIterator<PoolFrame>;
  /** Start of the last frame read. */
  lastTime: number | null;
  /** Where the next frame starts: the end of the last one read (the start time before any). */
  pos: number;
  read: number;
  ended: boolean;
  /** The next key frame after `pos` (null: none), once asked; it stays right while `pos` is before it. */
  nextKey?: number | null;
  /** A reversed lane's chunk, from `from` up to the frame showing at `upTo` (the reader stops after it); frames at or
   * after `below` were held before it started, so the frames before `below` are the chunk's. */
  chunk?: { from: number; upTo: number; below: number };
}

/** An exact frame asked for (`frame()`). */
export interface ExactAsk {
  time: number;
  resolve: (frame: PoolFrame | null) => void;
  reject: (error: Error) => void;
}

/** One clip's decoding: its source, its reader and the frames it holds. */
export interface Lane {
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

/**
 * A new lane for a clip, holding nothing yet.
 * @param clip the clip
 * @returns the lane
 */
export const newLane = (clip: PoolClip): Lane => ({
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
});

/**
 * Whether a frame shows at a source time: it starts at or before it and lasts past it, or it is the file's last frame
 * and the time is later, or its first and the time is earlier.
 * @param lane the lane (its file's first and last frame times, once seen)
 * @param frame the frame
 * @param time source seconds
 * @returns true when the frame is the one to show
 */
export function covers(lane: Lane, frame: PoolFrame, time: number): boolean {
  if (frame.time <= time + EPS)
    return time + EPS < frame.time + frame.duration || (lane.tail !== null && frame.time >= lane.tail - EPS);
  return lane.head !== null && frame.time <= lane.head + EPS;
}

/**
 * The frame a lane holds for a source time: the one handed out last, else one decoded.
 * @param lane the lane
 * @param time source seconds
 * @returns the frame, or null when none is decoded yet
 */
export function covering(lane: Lane, time: number): PoolFrame | null {
  if (lane.last && covers(lane, lane.last, time)) return lane.last;
  return lane.buf.find((frame) => covers(lane, frame, time)) ?? null;
}

/**
 * Hands a frame out: it replaces the last one, and frames before it (after it, reversed) are no longer needed.
 * @param lane the lane
 * @param frame the frame
 */
export function hand(lane: Lane, frame: PoolFrame): void {
  if (lane.last !== frame) {
    lane.last?.close();
    lane.last = frame;
  }
  const reverse = Boolean(lane.clip.reverse);
  const keep: PoolFrame[] = [];
  for (const buffered of lane.buf) {
    if (buffered === frame) continue;
    if (reverse ? buffered.time > frame.time : buffered.time < frame.time) buffered.close();
    else keep.push(buffered);
  }
  lane.buf = keep;
}

/**
 * Puts a reversed lane's chunk frame in time order before the frames held from older chunks; the chunk's reader
 * stops after its newest frame.
 * @param lane the lane
 * @param chunk the reader's chunk
 * @param frame the frame
 * @returns false when the frame was already held (it is closed and the chunk is done)
 */
export function keepInChunk(lane: Lane, chunk: NonNullable<Reader['chunk']>, frame: PoolFrame): boolean {
  if (frame.time >= chunk.below - EPS) {
    frame.close();
    stopReader(lane);
    return false;
  }
  const after = lane.buf.findIndex((buffered) => buffered.time > frame.time);
  lane.buf.splice(after < 0 ? lane.buf.length : after, 0, frame);
  if (frame.time + frame.duration > chunk.upTo + EPS) stopReader(lane);
  return true;
}

/**
 * Of the unshown frames at or before a time only the newest is kept (it may be the source's last).
 * @param lane the lane
 * @param time the source time wanted
 */
export function prune(lane: Lane, time: number): void {
  let newest = -1;
  for (const [index, frame] of lane.buf.entries()) if (frame.time <= time + EPS) newest = index;
  if (newest <= 0) return;
  for (const frame of lane.buf.slice(0, newest)) frame.close();
  lane.buf = lane.buf.slice(newest);
}

/**
 * Starts the lane's reader again at a time; the frames decoded ahead go.
 * @param lane the lane
 * @param source its frame source
 * @param time source seconds
 */
export function restart(lane: Lane, source: FrameSource, time: number): void {
  stopReader(lane);
  for (const frame of lane.buf) frame.close();
  lane.buf = [];
  lane.reader = { iterator: source.from(time), lastTime: null, pos: time, read: 0, ended: false };
}

/**
 * Stops the lane's reader, if any (its decoder is freed).
 * @param lane the lane
 */
export function stopReader(lane: Lane): void {
  const reader = lane.reader;
  lane.reader = null;
  if (reader?.iterator.return) void reader.iterator.return().catch(() => undefined);
}

/**
 * Starts a reversed lane's chunk: frames held at or before `upTo` (left by a chunk stopped part-way) go, the ones
 * after it stay.
 * @param lane the lane
 * @param source its frame source
 * @param from where the chunk starts
 * @param upTo the source time of its newest frame
 */
export function startChunk(lane: Lane, source: FrameSource, from: number, upTo: number): void {
  stopReader(lane);
  const keep: PoolFrame[] = [];
  for (const frame of lane.buf) {
    if (frame.time <= upTo + EPS) frame.close();
    else keep.push(frame);
  }
  lane.buf = keep;
  lane.reader = {
    iterator: source.from(Math.max(0, from), upTo + EPS),
    lastTime: null,
    pos: from,
    read: 0,
    ended: false,
    chunk: { from, upTo, below: keep.at(0)?.time ?? Infinity },
  };
}
