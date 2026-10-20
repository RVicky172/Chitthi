import type { TakeBackend, TakeHeader } from '@/lib/takeStore';

/**
 * The take store's backend in memory (209 D3): IndexedDB's two stores as maps. Each call waits a turn (or the given
 * delay), as IndexedDB answers later, so callers can't rely on finishing in the order they started.
 */
export class MemoryTakeBackend implements TakeBackend {
  readonly headers = new Map<string, unknown>();
  readonly chunkStore = new Map<string, { index: number; blob: Blob }[]>();
  /** Milliseconds each chunk write waits, by call order (to shuffle when they land). */
  chunkDelays: number[] = [];
  /** Set to make the next chunk write fail, like a full disk. */
  failNext: Error | null = null;
  private writes = 0;

  /**
   * @param ms how long to wait (0: one turn, which fake timers don't hold up)
   * @returns a promise settled after it
   */
  private readonly later = (ms = 0) => (ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve());

  /** @param take the header to store */
  async putTake(take: TakeHeader): Promise<void> {
    await this.later();
    this.headers.set(take.id, structuredClone(take));
  }

  /**
   * @param id the take
   * @param index the chunk's place
   * @param blob the chunk
   */
  async addChunk(id: string, index: number, blob: Blob): Promise<void> {
    await this.later(this.chunkDelays[this.writes++] ?? 0);
    if (this.failNext) {
      const error = this.failNext;
      this.failNext = null;
      throw error;
    }
    this.chunkStore.set(id, [...(this.chunkStore.get(id) ?? []), { index, blob }]);
  }

  /** @returns every header, as stored */
  async takes(): Promise<unknown[]> {
    await this.later();
    return [...this.headers.values()];
  }

  /**
   * @param id the take
   * @returns its chunks in index order
   */
  async chunks(id: string): Promise<Blob[]> {
    await this.later();
    return (this.chunkStore.get(id) ?? []).toSorted((first, second) => first.index - second.index).map((chunk) => chunk.blob);
  }

  /** @param id the take to delete with its chunks */
  async remove(id: string): Promise<void> {
    await this.later();
    this.headers.delete(id);
    this.chunkStore.delete(id);
  }
}
