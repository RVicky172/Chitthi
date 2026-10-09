import { useEffect, useState } from 'react';
import { onToast } from '../lib/toast';

export function Toast() {
  // `n` counts toasts: the same message again is drawn (and announced) again.
  const [msg, setMsg] = useState({ text: '', n: 0 }),
    [show, setShow] = useState(false);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const off = onToast((m) => {
      setMsg((p) => ({ text: m, n: p.n + 1 }));
      setShow(true);
      clearTimeout(t);
      t = setTimeout(() => setShow(false), 3400);
    });
    return () => {
      off();
      clearTimeout(t);
    };
  }, []);
  return (
    <div id="toast" className={show ? 'show' : ''} role="status" aria-live="polite">
      <span key={msg.n}>{msg.text}</span>
    </div>
  );
}
