// A recording 2D canvas for tests (Node has no canvas): every property set and method called on its context is logged
// as text, by canvas name, so a test can check the steps a drawing takes without pixels. Moved out of the transitions
// test (407 T012) so other drawing tests can use it.

/**
 * A fake canvas whose context records what is set and called on it.
 * @param name the canvas's name in the log (and the value logged when it is drawn onto another canvas)
 * @param logs where each canvas's log is kept, by name
 * @returns the canvas and its recording 2D context
 */
export function recordingCanvas(name: string, logs: Map<string, string[]>) {
  const log: string[] = [];
  logs.set(name, log);
  const canvas = { name, width: 0, height: 0, getContext: () => context };
  const show = (value: unknown) => (value && typeof value === 'object' ? ((value as { name?: string }).name ?? 'object') : String(value));
  const context: CanvasRenderingContext2D = new Proxy({ canvas } as Record<string | symbol, unknown>, {
    get: (target, prop) => (prop in target ? target[prop] : (...args: unknown[]) => void log.push(`${String(prop)}(${args.map(show).join(',')})`)),
    set: (target, prop, value) => {
      log.push(`${String(prop)}=${show(value)}`);
      target[prop] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { canvas, context };
}
