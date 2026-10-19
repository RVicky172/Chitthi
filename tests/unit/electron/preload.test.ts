import Module from 'node:module';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

/*
 * 408 T052 (AC-5, Constitution IX): the preload is the only way the page reaches projects and media. It turns a picked
 * File into its path itself (webUtils.getPathForFile), so the page never sends a path; it answers the main process's
 * flush request when the window closes, at once when nothing is registered to save.
 */

interface Invoked {
  channel: string;
  args: unknown[];
}

type Listener = (event: unknown, ...args: unknown[]) => void;

/** The fake `electron` the preload is loaded with, and what it saw. */
interface FakeElectron {
  invoked: Invoked[];
  sent: Invoked[];
  listeners: Map<string, Listener>;
  exposed: Record<string, unknown>;
}

type Load = (request: string, parent: unknown, isMain: boolean) => unknown;
const moduleWithLoad = Module as unknown as { _load: Load };
const originalLoad = moduleWithLoad._load;
afterEach(() => {
  moduleWithLoad._load = originalLoad;
});

/**
 * Loads electron/preload.cjs afresh with a fake `electron`.
 * @returns what the preload exposed and called
 */
function loadPreload(): FakeElectron {
  const fake: FakeElectron = { invoked: [], sent: [], listeners: new Map(), exposed: {} };
  const electron = {
    contextBridge: {
      exposeInMainWorld: (key: string, api: unknown) => {
        fake.exposed[key] = api;
      },
    },
    ipcRenderer: {
      invoke: (channel: string, ...args: unknown[]) => {
        fake.invoked.push({ channel, args });
        return Promise.resolve(true);
      },
      send: (channel: string, ...args: unknown[]) => fake.sent.push({ channel, args }),
      sendSync: () => ({ version: 'test', platform: 'win32', localFonts: false }),
      on: (channel: string, listener: Listener) => fake.listeners.set(channel, listener),
      removeListener: (channel: string) => fake.listeners.delete(channel),
    },
    webUtils: {
      getPathForFile: (file: { name: string }) => `C:\\Users\\me\\Videos\\${file.name}`,
    },
  };
  moduleWithLoad._load = (request, parent, isMain) => (request === 'electron' ? electron : originalLoad(request, parent, isMain));
  const preload = path.resolve('electron/preload.cjs');
  const requireHere = Module.createRequire(preload);
  Reflect.deleteProperty(requireHere.cache, preload);
  requireHere(preload);
  return fake;
}

/**
 * The exposed bridge's group of calls.
 * @param fake the loaded preload
 * @param group projects or media
 * @returns its calls
 */
const groupOf = (fake: FakeElectron, group: string) => (fake.exposed.chitthiDesktop as Record<string, Record<string, (...args: unknown[]) => unknown>>)[group];

describe('electron/preload.cjs (408 T052)', () => {
  it('exposes the projects and media calls the page’s bridge types name', () => {
    const fake = loadPreload();
    expect(Object.keys(groupOf(fake, 'projects')).sort((first, second) => first.localeCompare(second))).toEqual(
      ['list', 'onFlush', 'read', 'readCache', 'remove', 'usage', 'write', 'writeCache'],
    );
    expect(Object.keys(groupOf(fake, 'media')).sort((first, second) => first.localeCompare(second))).toEqual(
      ['findFile', 'finishOwned', 'freeSpace', 'register', 'status', 'sweep', 'writeOwned'],
    );
  });

  it('media.register sends the picked file’s path from webUtils, never anything the page gave', async () => {
    const fake = loadPreload();
    const file = { name: 'hills.mp4', path: 'C:\\Windows\\System32\\evil.dll' };
    await groupOf(fake, 'media').register('m1', file, 'D:\\also-ignored.mp4');
    expect(fake.invoked).toEqual([{ channel: 'media:register', args: ['m1', 'C:\\Users\\me\\Videos\\hills.mp4'] }]);
  });

  it('the other calls go to their channels with the page’s arguments', async () => {
    const fake = loadPreload();
    await groupOf(fake, 'projects').write('p1', '{}', '{"name":"x"}');
    await groupOf(fake, 'media').status(['m1']);
    await groupOf(fake, 'media').sweep(['m1']);
    expect(fake.invoked).toEqual([
      { channel: 'projects:write', args: ['p1', '{}', '{"name":"x"}'] },
      { channel: 'media:status', args: [['m1']] },
      { channel: 'media:sweep', args: [['m1']] },
    ]);
  });

  it('answers a flush request at once when nothing is registered, else after the page’s save', async () => {
    const fake = loadPreload();
    const flush = fake.listeners.get('projects:flush');
    expect(flush).toBeDefined();
    flush?.({}, 7);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fake.sent).toEqual([{ channel: 'projects:flushed', args: [7] }]);

    let finish: () => void = () => undefined;
    const stop = groupOf(fake, 'projects').onFlush(() => new Promise<void>((resolve) => (finish = resolve))) as () => void;
    flush?.({}, 8);
    await Promise.resolve();
    expect(fake.sent).toHaveLength(1);
    finish();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fake.sent.at(-1)).toEqual({ channel: 'projects:flushed', args: [8] });

    // A failing save still answers, so the window still closes.
    groupOf(fake, 'projects').onFlush(() => Promise.reject(new Error('disk full')));
    flush?.({}, 9);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fake.sent.at(-1)).toEqual({ channel: 'projects:flushed', args: [9] });

    stop();
  });
});
