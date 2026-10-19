/*
 * The Origin Private File System in memory (408 T041), as much of it as lib/mediaWeb.ts uses: directories, file
 * handles, getFile() (disk files come back with an empty type, as OPFS gives them) and createWritable() (written
 * data lands on close; abort or an error leaves the file as it was). A capacity makes writes fail with
 * QuotaExceededError, as a browser's do when its estimate was out of date.
 */

/** A fake directory with its files' bytes. */
export interface FakeDirectory {
  handle: FileSystemDirectoryHandle;
  /** File name → its bytes. */
  files: Map<string, Uint8Array>;
  /** Sub-directories by name. */
  dirs: Map<string, FakeDirectory>;
}

/** What the tests can change about the fake. */
export interface FakeOpfsOptions {
  /** The most all files together may take, bytes. */
  capacity?: number;
  /** File handles have no createWritable (Safari): only the worker's sync access handle can write. */
  noWritable?: boolean;
}

/**
 * A DOMException as a browser throws it.
 * @param name its name
 * @returns the error
 */
const domError = (name: string): DOMException => new DOMException(name, name);

/**
 * A written chunk's bytes.
 * @param chunk what was written
 * @returns its bytes
 */
async function bytesOf(chunk: BufferSource | Blob | string): Promise<Uint8Array> {
  if (chunk instanceof Blob) return new Uint8Array(await chunk.arrayBuffer());
  if (typeof chunk === 'string') return new TextEncoder().encode(chunk);
  return new Uint8Array(chunk instanceof ArrayBuffer ? chunk : chunk.buffer);
}

/**
 * A fake OPFS root.
 * @param options capacity and features
 * @returns the root directory
 */
export function fakeOpfs(options: FakeOpfsOptions = {}): FakeDirectory {
  const total = (dir: FakeDirectory): number =>
    [...dir.files.values()].reduce((sum, bytes) => sum + bytes.length, 0) + [...dir.dirs.values()].reduce((sum, sub) => sum + total(sub), 0);
  const root = makeDirectory(() => total(root), options);
  return root;
}

/**
 * A fake directory.
 * @param used the bytes every file takes now
 * @param options capacity and features
 * @returns the directory
 */
function makeDirectory(used: () => number, options: FakeOpfsOptions): FakeDirectory {
  const files = new Map<string, Uint8Array>();
  const dirs = new Map<string, FakeDirectory>();
  const fileHandle = (name: string): FileSystemFileHandle => {
    const handle = {
      kind: 'file',
      name,
      getFile: () => {
        const bytes = files.get(name);
        return bytes ? Promise.resolve(new File([bytes.slice()], name)) : Promise.reject(domError('NotFoundError'));
      },
      createWritable: () => {
        const chunks: Uint8Array[] = [];
        return Promise.resolve(
          new WritableStream<BufferSource | Blob | string>({
            async write(chunk) {
              const bytes = await bytesOf(chunk);
              const pending = chunks.reduce((sum, part) => sum + part.length, 0) + bytes.length;
              if (options.capacity !== undefined && used() - (files.get(name)?.length ?? 0) + pending > options.capacity) throw domError('QuotaExceededError');
              chunks.push(bytes);
            },
            close() {
              const size = chunks.reduce((sum, part) => sum + part.length, 0);
              const whole = new Uint8Array(size);
              let at = 0;
              for (const part of chunks) {
                whole.set(part, at);
                at += part.length;
              }
              files.set(name, whole);
            },
          }),
        );
      },
    };
    if (options.noWritable) Reflect.deleteProperty(handle, 'createWritable');
    return handle as unknown as FileSystemFileHandle;
  };
  const handle = {
    kind: 'directory',
    getDirectoryHandle(name: string, flags: { create?: boolean } = {}) {
      let dir = dirs.get(name);
      if (!dir) {
        if (!flags.create) return Promise.reject(domError('NotFoundError'));
        dir = makeDirectory(used, options);
        dirs.set(name, dir);
      }
      return Promise.resolve(dir.handle);
    },
    getFileHandle(name: string, flags: { create?: boolean } = {}) {
      if (!files.has(name)) {
        if (!flags.create) return Promise.reject(domError('NotFoundError'));
        files.set(name, new Uint8Array());
      }
      return Promise.resolve(fileHandle(name));
    },
    removeEntry(name: string) {
      if (!files.delete(name) && !dirs.delete(name)) return Promise.reject(domError('NotFoundError'));
      return Promise.resolve();
    },
    async *keys() {
      await Promise.resolve();
      yield* [...files.keys(), ...dirs.keys()];
    },
  };
  return { handle: handle as unknown as FileSystemDirectoryHandle, files, dirs };
}
