import { useEffect, useState } from 'react';
import { onToast } from '../lib/toast';

/** The toast: one short message at a time, announced politely, hidden after a few seconds. */
export function Toast() {
  // `n` counts toasts: the same message again is drawn (and announced) again.
  const [msg, setMsg] = useState({ text: '', n: 0 }),
    [show, setShow] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const off = onToast((message) => {
      setMsg((previous) => ({ text: message, n: previous.n + 1 }));
      setShow(true);
      clearTimeout(timer);
      timer = setTimeout(() => setShow(false), 3400);
    });
    return () => {
      off();
      clearTimeout(timer);
    };
  }, []);
  return (
    <div id="toast" className={show ? 'show' : ''} role="status" aria-live="polite">
      <span key={msg.n}>{msg.text}</span>
    </div>
  );
}
