/** Shows a toast's message. */
type Listener = (message: string) => void;
const listeners = new Set<Listener>();

/**
 * Shows a short message.
 * @param message the message
 */
export function toast(message: string): void {
  listeners.forEach((listener) => listener(message));
}

/**
 * Listens for toasts.
 * @param listener called with each message
 * @returns a function that stops listening
 */
export function onToast(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
