import { MAIN_VIDEO, type Project, type TimedClip } from './timeline';
import { clipLength } from './video';

/*
 * The decoder pool (P2.4, specs/features/204-decoder-pool): the frames of every video visible at a time, for the
 * preview and the export alike. A pool keeps one **lane** per clip that needs pictures (two clips of one file get two
 * lanes), each with a frame source on the clip's file, up to `ahead` frames decoded ahead and the frame last handed
 * out, held until a newer one replaces it. Decoders, frames and bytes are bounded by `PoolLimits` whatever the
 * project's size. The pool knows nothing of Mediabunny: frames come from a `FrameSourceFactory` (frameSource.ts in the
 * app, a fake in decodePool.test.ts). Only the pool closes the frames it hands out.
 */

export interface PoolFrame {
  image: CanvasImageSource;
  width: number;
  height: number;
  /** Source time the frame starts at, and how long it shows, seconds. */
  time: number;
  duration: number;
  close(): void;
}

export interface FrameSource {
  /** Frames in order, starting with the one showing at source time t (the first frame if t is before it). Each
   * reader decodes on its own; `return()` stops it. */
  from(t: number): AsyncIterator<PoolFrame>;
  close(): void;
}

export type FrameSourceFactory = (file: Blob, opts: { maxWidth?: number }) => Promise<FrameSource>;
export interface PoolLimits {
  decoders: number;
  /** Frames decoded ahead of the one shown, per lane. */
  ahead: number;
  /** Decoded frames held at once, at width × height × 4 bytes each (D2). */
  bytes: number;
}
export interface PoolStats {
  decoders: number;
  frames: number;
  bytes: number;
  /** Times `peek` couldn't give the frame asked for. */
  holds: number;
}
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

/** A time on the project's frame grid, as the export encodes it (D3). */
export const frameTime = (t: number, fps: number) => Math.floor(t * fps + EPS) / fps;

/** Q3: the visible clips plus the next to start plus one spare for scrubbing; 4 frames ahead; 256 MB / 1 GB. */
export function poolLimits(videosAtOnce: number, desktop: boolean): PoolLimits {
  return { decoders: videosAtOnce + 2, ahead: 4, bytes: (desktop ? 1024 : 256) * 2 ** 20 };
}

/**
 * The clips a time needs (Q10): the video clip visible at t on every visible picture track (bottom track first; the
 * main track clamps at its ends as `videoAt` does), and each such track's next video clip starting less than `ahead`
 * seconds after t. Photos need no lane.
 */
export function lanePlan<C extends TimedClip>(p: Project<C>, t: number, ahead: number): { visible: C[]; next: C[] } {
  const visible: C[] = [],
    next: C[] = [];
  const end = (c: C) => c.start + clipLength(c);
  for (const tr of p.tracks) {
    if ((tr.kind !== 'video' && tr.kind !== 'overlay') || tr.hidden) continue;
    const on = p.clips.filter((c) => c.track === tr.id);
    if (!on.length) continue;
    let hit = on.find((c) => t >= c.start && t < end(c));
    if (!hit && tr.id === MAIN_VIDEO) {
      const first = on[0],
        last = on[on.length - 1];
      hit = t < 0 && first.start <= 0 ? first : t >= end(last) ? last : undefined;
    }
    if (hit?.kind === 'video') visible.push(hit);
    const n = on.find((c) => c !== hit && c.kind === 'video' && c.start > t && c.start - t < ahead);
    if (n) next.push(n);
  }
  return { visible, next };
}

interface Reader {
  it: AsyncIterator<PoolFrame>;
  /** Start of the last frame read. */
  lastTime: number | null;
  /** Where the next frame starts: the end of the last one read (the start time before any). */
  pos: number;
  read: number;
  ended: boolean;
}

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
  reader: Reader | null;
  /** Decoded, not handed out yet, in time order. */
  buf: PoolFrame[];
  /** The frame handed out last: held until a newer one replaces it. */
  last: PoolFrame | null;
  /** An exact frame asked for (`frame()`); a newer ask replaces it. */
  exact: { t: number; resolve: (f: PoolFrame | null) => void; reject: (e: Error) => void } | null;
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

const bytesOf = (f: PoolFrame) => f.width * f.height * 4;

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

  constructor(
    private open: FrameSourceFactory,
    private limits: PoolLimits,
    private source: { maxWidth?: number } = {},
  ) {}

  /** The frame showing at source time t, exactly (the export, a paused preview). A newer ask on the same clip
   * resolves this one to null (latest wins). Rejects when the clip can't be decoded (see `fallback`). */
  frame(clip: PoolClip, t: number): Promise<PoolFrame | null> {
    if (this.disposed) return Promise.resolve(null);
    const lane = this.lane(clip);
    if (lane.failed) return Promise.reject(new Error(lane.failed));
    lane.playing = false;
    lane.exact?.resolve(null);
    lane.exact = null;
    const ready = this.covering(lane, t);
    if (ready) {
      this.hand(lane, ready);
      return Promise.resolve(ready);
    }
    return new Promise((resolve, reject) => {
      lane.exact = { t, resolve, reject };
      this.kick(lane);
    });
  }

  /** Never waits: the frame for t if decoded, else the clip's last frame (a hold), null before its first. */
  peek(clip: PoolClip, t: number): PoolFrame | null {
    if (this.disposed) return null;
    const lane = this.lane(clip);
    if (lane.failed) return null;
    lane.playing = true;
    lane.prime = false;
    lane.target = t;
    const f = this.covering(lane, t);
    if (f) this.hand(lane, f);
    else {
      this.holds++;
      // Before its first shown frame, any decoded frame of the clip beats nothing.
      if (!lane.last && lane.buf.length) this.hand(lane, lane.buf[0]);
    }
    this.kick(lane);
    return f ?? lane.last;
  }

  /** Look-ahead: opens the clip's lane and decodes its first frame. */
  prepare(clip: PoolClip): void {
    if (this.disposed) return;
    const lane = this.lane(clip);
    if (lane.failed) return;
    if (!lane.last && !lane.buf.length && !lane.exact && !lane.playing) lane.prime = true;
    this.kick(lane);
  }

  /** The clips still needed; the others are closed first when a limit needs room. */
  want(ids: Iterable<string>): void {
    this.wanted = new Set(ids);
  }

  forget(id: string): void {
    const lane = this.lanes.get(id);
    if (lane) this.close(lane);
  }

  /** Why a clip can't be decoded here, or null. */
  fallback(id: string): string | null {
    return this.lanes.get(id)?.failed ?? null;
  }

  stats(): PoolStats {
    let frames = 0;
    for (const l of this.lanes.values()) frames += l.buf.length + (l.last ? 1 : 0);
    return { decoders: this.decoders(), frames, bytes: this.held(), holds: this.holds };
  }

  dispose(): void {
    this.disposed = true;
    for (const l of [...this.lanes.values()]) this.close(l);
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
    let n = this.orphans;
    for (const l of this.lanes.values()) if (l.src || l.opening) n++;
    return n;
  }

  private held(): number {
    let b = 0;
    for (const l of this.lanes.values()) {
      for (const f of l.buf) b += bytesOf(f);
      if (l.last) b += bytesOf(l.last);
    }
    return b;
  }

  /** Lanes in the order they give way: not wanted first, then least recently used. */
  private byPriority(except: Lane): Lane[] {
    return [...this.lanes.values()]
      .filter((l) => l !== except)
      .sort((a, b) => Number(this.wanted.has(a.id)) - Number(this.wanted.has(b.id)) || a.used - b.used);
  }

  /** Frees resources: frames, reader, source. */
  private release(lane: Lane): void {
    lane.exact?.resolve(null);
    lane.exact = null;
    for (const f of lane.buf) f.close();
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

  private fail(lane: Lane, e: unknown): void {
    const reason = e instanceof Error ? e.message : String(e);
    const ask = lane.exact;
    lane.exact = null;
    this.release(lane);
    lane.failed = reason;
    ask?.reject(new Error(reason));
    this.wake();
  }

  /** Lanes waiting for a decoder try again. */
  private wake(): void {
    for (const l of this.lanes.values()) if (l.waiting) this.kick(l);
  }

  private kick(lane: Lane): void {
    void this.run(lane);
  }

  /* ---------- the work of one lane: one worker at a time ---------- */

  private async run(lane: Lane): Promise<void> {
    if (lane.running || lane.closed || lane.failed) return;
    lane.running = true;
    try {
      while (!lane.closed && !lane.failed) {
        if (!lane.src) {
          if (!(await this.openLane(lane))) break;
        } else if (!(await this.step(lane))) break;
      }
    } catch (e) {
      if (!lane.closed) this.fail(lane, e);
    } finally {
      lane.running = false;
    }
  }

  private async openLane(lane: Lane): Promise<boolean> {
    if (this.goal(lane) === null) return false;
    // Closing a lane wakes the waiting ones, which may take its decoder: check again until there is one.
    while (this.decoders() >= this.limits.decoders) {
      // Close an open lane (not one still opening: that frees nothing yet), not wanted first, then oldest.
      const victim = this.byPriority(lane).find((l) => l.src);
      if (!victim) {
        lane.waiting = true;
        return false;
      }
      this.close(victim);
    }
    lane.waiting = false;
    lane.opening = true;
    let src: FrameSource;
    try {
      src = await this.open(lane.file, this.source);
    } catch (e) {
      lane.opening = false;
      if (lane.closed) {
        this.orphans--;
        this.wake();
        return false;
      }
      throw e;
    }
    lane.opening = false;
    if (lane.closed) {
      src.close();
      this.orphans--;
      this.wake();
      return false;
    }
    lane.src = src;
    return true;
  }

  private goal(lane: Lane): number | null {
    if (lane.exact) return lane.exact.t;
    if (lane.playing) return lane.target;
    if (lane.prime) return lane.clip.in;
    return null;
  }

  private covers(lane: Lane, f: PoolFrame, t: number): boolean {
    if (f.time <= t + EPS) return t + EPS < f.time + f.duration || (lane.tail !== null && f.time >= lane.tail - EPS);
    return lane.head !== null && f.time <= lane.head + EPS;
  }

  private covering(lane: Lane, t: number): PoolFrame | null {
    if (lane.last && this.covers(lane, lane.last, t)) return lane.last;
    return lane.buf.find((f) => this.covers(lane, f, t)) ?? null;
  }

  /** Hands a frame out: it replaces the last one, and frames before it are no longer needed. */
  private hand(lane: Lane, f: PoolFrame): void {
    if (lane.last !== f) {
      lane.last?.close();
      lane.last = f;
    }
    const keep: PoolFrame[] = [];
    for (const b of lane.buf) {
      if (b === f) continue;
      if (b.time < f.time) b.close();
      else keep.push(b);
    }
    lane.buf = keep;
  }

  /** One step towards the lane's goal; false when there is nothing to do. */
  private async step(lane: Lane): Promise<boolean> {
    const t = this.goal(lane);
    if (t === null) return false;
    const cov = this.covering(lane, t);
    let ahead = false;
    if (lane.exact) {
      if (cov) {
        const ask = lane.exact;
        lane.exact = null;
        this.hand(lane, cov);
        ask.resolve(cov);
        return true;
      }
    } else if (lane.playing) {
      if (cov) {
        if (lane.buf.length >= this.limits.ahead) return false;
        ahead = true;
      }
    } else if (cov) {
      lane.prime = false;
      return true;
    }

    const src = lane.src;
    if (!src) return false;
    if (ahead && cov) {
      // Decode on after the frame shown, from where the reader is if it's there.
      const after = cov.time + cov.duration;
      const r = lane.reader;
      if (r?.ended) return false;
      if (!r || r.pos + EPS < after || r.pos >= after + REREAD) this.restart(lane, src, after);
    } else {
      const r = lane.reader;
      if (!r || r.ended || t < r.pos - EPS || t >= r.pos + REREAD) this.restart(lane, src, t);
    }
    const reader = lane.reader;
    if (!reader) return false;

    const size = this.sizeOf(lane);
    if (this.held() + this.reserved + size > this.limits.bytes) {
      if (ahead) return false;
      this.makeRoom(lane, size);
    }
    this.reserved += size;
    let res: IteratorResult<PoolFrame>;
    try {
      res = await reader.it.next();
    } finally {
      this.reserved -= size;
    }
    if (lane.closed || lane.reader !== reader) {
      if (!res.done) res.value.close();
      return !lane.closed;
    }
    if (res.done) {
      reader.ended = true;
      if (!reader.read) throw new Error('The video has no frames');
      lane.tail = reader.lastTime;
      return true;
    }
    const f = res.value;
    if (!reader.read && f.time > reader.pos + EPS) lane.head = Math.min(lane.head ?? f.time, f.time);
    reader.read++;
    reader.lastTime = f.time;
    reader.pos = f.time + f.duration;
    this.biggest = Math.max(this.biggest, bytesOf(f));
    lane.buf.push(f);
    this.prune(lane, t);
    if (this.held() > this.limits.bytes) {
      this.makeRoom(lane, 0);
      if (ahead && this.held() > this.limits.bytes) {
        lane.buf.pop()?.close();
        this.stopReader(lane);
        return false;
      }
    }
    return true;
  }

  /** Of the unshown frames at or before t only the newest is kept (it may be the source's last). */
  private prune(lane: Lane, t: number): void {
    let k = -1;
    lane.buf.forEach((f, i) => {
      if (f.time <= t + EPS) k = i;
    });
    if (k <= 0) return;
    for (const f of lane.buf.slice(0, k)) f.close();
    lane.buf = lane.buf.slice(k);
  }

  private restart(lane: Lane, src: FrameSource, t: number): void {
    this.stopReader(lane);
    for (const f of lane.buf) f.close();
    lane.buf = [];
    lane.reader = { it: src.from(t), lastTime: null, pos: t, read: 0, ended: false };
  }

  private stopReader(lane: Lane): void {
    const r = lane.reader;
    lane.reader = null;
    if (r?.it.return) void r.it.return().catch(() => undefined);
  }

  private sizeOf(lane: Lane): number {
    const f = lane.last ?? lane.buf[0];
    return f ? bytesOf(f) : this.biggest;
  }

  /** Room for `size` more bytes: other lanes' frames decoded ahead go first, then their held frames. */
  private makeRoom(lane: Lane, size: number): void {
    const over = () => this.held() + this.reserved + size > this.limits.bytes;
    const others = this.byPriority(lane);
    for (const o of others) {
      const g = this.goal(o);
      const keep = g !== null && o.buf.length && this.covers(o, o.buf[0], g) ? 1 : 0;
      while (over() && o.buf.length > keep) {
        o.buf.pop()?.close();
        this.stopReader(o);
      }
      if (!over()) return;
    }
    for (const o of others) {
      if (!over()) return;
      for (const f of o.buf) f.close();
      o.buf = [];
      this.stopReader(o);
      o.last?.close();
      o.last = null;
    }
  }
}
