import { desktop } from '../platform/desktop';
import { toast } from './toast';

/**
 * Hands a generated file to the user and says so. In the browser that's a download; in the desktop app it's a
 * native save dialog. Resolves false if the user cancelled the dialog.
 */
export async function saveFile(name: string, blob: Blob): Promise<boolean> {
  if (desktop) {
    const path = await desktop.saveFile(name, await blob.arrayBuffer());
    if (path) toast(`Saved ${path.split(/[\\/]/).pop()}`);
    return !!path;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  toast(`Downloading ${name}`);
  return true;
}
