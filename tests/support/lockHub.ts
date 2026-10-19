import type { LockChannel } from '@/lib/projectLock';

/*
 * A fake BroadcastChannel hub for the project lock (408 T064): like the real channel, a message reaches every other
 * channel on the hub, never its sender, and is cloned on the way.
 */

/**
 * A hub of channels that hear each other.
 * @returns a function making a channel on the hub (one per tab or window)
 */
export function lockHub(): () => LockChannel {
  const handlers = new Set<{ owner: object; handle: (message: unknown) => void }>();
  return () => {
    const owner = {};
    return {
      post(message) {
        for (const entry of handlers) if (entry.owner !== owner) entry.handle(structuredClone(message));
      },
      listen(handle) {
        const entry = { owner, handle };
        handlers.add(entry);
        return () => handlers.delete(entry);
      },
    };
  };
}
