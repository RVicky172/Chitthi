import { describe, expect, it } from 'vitest';
import { projectLock, type LockChannel } from '@/lib/projectLock';
import { lockHub as hub } from '../../support/lockHub';

/*
 * 408 T064 (AC-8): one project, one editor at a time. Opening a project posts it on a channel every tab and window of
 * the app hears; one holding it is told (and stops saving). A fake BroadcastChannel hub: like the real one, a message
 * reaches every other channel, never its sender.
 */

/**
 * A lock on the hub, with what it was told.
 * @param channel the hub's channel maker
 * @returns the lock and the projects taken from it
 */
function windowOn(channel: () => LockChannel) {
  const lock = projectLock(channel());
  const taken: string[] = [];
  lock.onTaken((studio, id) => taken.push(`${studio}:${id}`));
  return { lock, taken };
}

describe('lib/projectLock (408 T064, AC-8)', () => {
  it('opening a project another window holds tells that window, and only it', () => {
    const channel = hub();
    const first = windowOn(channel);
    const second = windowOn(channel);
    const third = windowOn(channel);
    first.lock.hold('video', 'p1');
    third.lock.hold('video', 'p2');
    second.lock.hold('video', 'p1');
    expect(first.taken).toEqual(['video:p1']);
    expect(second.taken).toEqual([]);
    expect(third.taken).toEqual([]);
    expect(first.lock.holds('video')).toBeNull();
    expect(second.lock.holds('video')).toBe('p1');
  });

  it('Open here again takes it back: the other window is told in turn', () => {
    const channel = hub();
    const first = windowOn(channel);
    const second = windowOn(channel);
    first.lock.hold('photo', 'q1');
    second.lock.hold('photo', 'q1');
    first.lock.hold('photo', 'q1');
    expect(second.taken).toEqual(['photo:q1']);
    expect(first.lock.holds('photo')).toBe('q1');
  });

  it('a window holds a project per studio; letting go means it isn’t told any more', () => {
    const channel = hub();
    const first = windowOn(channel);
    const second = windowOn(channel);
    first.lock.hold('video', 'p1');
    first.lock.hold('photo', 'q1');
    first.lock.release('video');
    second.lock.hold('video', 'p1');
    second.lock.hold('photo', 'q1');
    expect(first.taken).toEqual(['photo:q1']);
  });

  it('ignores messages that aren’t its own kind, and works with no channel at all', () => {
    const channel = hub();
    const first = windowOn(channel);
    const stranger = channel();
    first.lock.hold('video', 'p1');
    for (const message of [null, 'p1', { open: 'p1' }, { open: 7, by: 'x' }, { open: 'p1', by: 3 }]) stranger.post(message);
    expect(first.taken).toEqual([]);
    const alone = projectLock(null);
    alone.hold('video', 'p1');
    expect(alone.holds('video')).toBe('p1');
  });

  it('close stops listening', () => {
    const channel = hub();
    const first = windowOn(channel);
    const second = windowOn(channel);
    first.lock.hold('video', 'p1');
    first.lock.close();
    second.lock.hold('video', 'p1');
    expect(first.taken).toEqual([]);
  });
});
