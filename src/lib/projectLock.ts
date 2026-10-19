import type { Studio } from './projects';

/*
 * One project, one editor at a time (408 §8, AC-8): opening a project posts `{ open: id, by }` on a BroadcastChannel
 * every tab and window of the app hears (the desktop app's windows share the app:// origin). A window holding that
 * project is told, and its autosave stops saving it at once; opening it there again takes it back the same way. The
 * latest one opened wins (Q15): edits are never merged, and never overwritten silently.
 */

/** A channel to the app's other tabs and windows (a BroadcastChannel; a fake one in tests). */
export interface LockChannel {
  post(message: unknown): void;
  /** Listens to the other tabs' messages; returns a function that stops (and closes the channel). */
  listen(handle: (message: unknown) => void): () => void;
}

/** This window's hold on the projects it has open. */
export interface ProjectLock {
  /** Opens a project here: other windows holding it are told. */
  hold(studio: Studio, id: string): void;
  /** No project open in the studio here any more (another one is being loaded). */
  release(studio: Studio): void;
  /** The project this window holds in the studio, or null. */
  holds(studio: Studio): string | null;
  /** Listens for a project of this window opened elsewhere (this window no longer holds it); returns an unsubscribe. */
  onTaken(listener: (studio: Studio, id: string) => void): () => void;
  /** Stops listening (the autosave stopped). */
  close(): void;
}

/** The channel's name. */
export const LOCK_CHANNEL = 'chitthi-projects';

/**
 * The browser's channel to the app's other tabs and windows.
 * @returns the channel, or null where there is none
 */
export function broadcastLock(): LockChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  const channel = new BroadcastChannel(LOCK_CHANNEL);
  return {
    post: (message) => {
      channel.postMessage(message);
    },
    listen(handle) {
      const onMessage = (event: MessageEvent<unknown>): void => {
        handle(event.data);
      };
      channel.addEventListener('message', onMessage);
      return () => {
        channel.removeEventListener('message', onMessage);
        channel.close();
      };
    },
  };
}

/**
 * Reads a message of the lock's kind.
 * @param message what arrived
 * @returns the project opened and by whom, or null for anything else
 */
function openedBy(message: unknown): { open: string; by: string } | null {
  if (!message || typeof message !== 'object') return null;
  const { open, by } = message as Record<string, unknown>;
  return typeof open === 'string' && typeof by === 'string' ? { open, by } : null;
}

/**
 * This window's lock over a channel.
 * @param channel the channel to the other windows (null: none, the lock only remembers)
 * @returns the lock
 */
export function projectLock(channel: LockChannel | null): ProjectLock {
  const me = crypto.randomUUID();
  const held = new Map<Studio, string>();
  const listeners = new Set<(studio: Studio, id: string) => void>();
  let closed = false;
  const stop = channel?.listen((message) => {
    const opened = openedBy(message);
    if (!opened || opened.by === me) return;
    for (const [studio, id] of [...held]) {
      if (id !== opened.open) continue;
      held.delete(studio);
      for (const listener of listeners) listener(studio, id);
    }
  });
  return {
    hold(studio, id) {
      held.set(studio, id);
      if (!closed) channel?.post({ open: id, by: me });
    },
    release(studio) {
      held.delete(studio);
    },
    holds: (studio) => held.get(studio) ?? null,
    onTaken(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close() {
      closed = true;
      stop?.();
      held.clear();
    },
  };
}
