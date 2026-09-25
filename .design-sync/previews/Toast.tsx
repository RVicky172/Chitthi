import { Toast, toast } from 'chitthi-postcard-studio';

// Toast listens for toast(msg) calls once mounted; fire one shortly after the first render.
setTimeout(() => toast('Downloading chitthi-diwali-4x6-print-pack.zip'), 200);

// The toast is position:fixed to the viewport bottom; a transformed box becomes its containing block here.
export const Downloading = () => (
  <div style={{ position: 'relative', height: 110, width: 560, transform: 'translateZ(0)' }}>
    <Toast />
  </div>
);
