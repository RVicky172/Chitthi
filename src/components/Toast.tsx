import { useEffect, useState } from 'react';
import { onToast } from '../lib/toast';

export function Toast() {
  const [msg, setMsg] = useState(''),
    [show, setShow] = useState(false);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const off = onToast((m) => {
      setMsg(m);
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
      {msg}
    </div>
  );
}
