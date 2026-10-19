import { useSyncExternalStore } from 'react';
import { toast } from '../../lib/toast';
import { isDesktop } from '../../platform/desktop';
import { saveStatus, saveStatusText, subscribeSaveStatus } from '../../state/projectSave';
import { findMissing, openProject } from '../../state/projects';
import { useVideo } from '../../state/videoStore';

/*
 * Saved projects in the studio (408 §9, AC-1, AC-5, AC-8, AC-9): the top bar's save status (Saved / Saving… / Not
 * saved: reason, or open in another window with Open here again), and Find file… for files that aren't where they
 * were (desktop: the browser keeps its own copies).
 */

/** The save status in the top bar; a polite live region speaks only when saving stops working. */
export function SaveStatusLine() {
  const status = useSyncExternalStore(subscribeSaveStatus, saveStatus, saveStatus);
  const text = saveStatusText(status);
  const trouble = status.state === 'failed' || status.state === 'elsewhere';
  return (
    <span className={`mst-save mst-save-${status.state}`}>
      <span aria-hidden={trouble}>{text}</span>
      {status.state === 'elsewhere' && (
        <button
          type="button"
          className="btn ghost"
          onClick={() => {
            void openProject(status.id).then((result) => {
              if ('error' in result) toast(result.error);
            });
          }}
        >
          Open here again
        </button>
      )}
      <span className="vh" aria-live="polite">
        {trouble ? text : ''}
      </span>
    </span>
  );
}

/** A missing file, as Find file… needs it. */
interface Missing {
  id: string;
  name: string;
}

/**
 * Asks where a missing file is now and says what was found.
 * @param file the missing file
 */
async function find(file: Missing): Promise<void> {
  const found = await findMissing(file.id);
  if (found === null) return;
  const others = found.length - 1;
  const more = others === 1 ? '1 more missing file' : `${others} more missing files`;
  toast(others > 0 ? `Found ${file.name} and ${more} in the same folder.` : `Found ${file.name}.`);
}

/**
 * Find file… for one missing file (desktop only: the browser keeps its own copies, so it has nothing to look for).
 * @param props the missing file
 * @param props.file the missing file
 */
export function FindFileButton({ file }: Readonly<{ file: Missing }>) {
  if (!isDesktop) return null;
  return (
    <button type="button" className="btn" onClick={() => void find(file)}>
      Find file…
    </button>
  );
}

/**
 * The missing files of the video, once each, in timeline order. The selector returns text (the same for the same
 * state): a new array on every read would re-render for ever.
 * @returns the missing files
 */
function useMissing(): Missing[] {
  const listed = useVideo((state) => {
    const missing = new Map<string, string>();
    for (const file of [...state.clips.map((clip) => clip.file), ...state.sounds.map((sound) => sound.file)]) {
      if (!(file instanceof Blob) && file.missing) missing.set(file.id, file.name);
    }
    return JSON.stringify([...missing]);
  });
  return (JSON.parse(listed) as [string, string][]).map(([id, name]) => ({ id, name }));
}

/** The bar over the timeline while files are missing: what they are, and Find file… for the first (desktop). */
export function MissingBar() {
  const missing = useMissing();
  const first = missing.at(0);
  if (!first) return null;
  const names = missing.map((file) => file.name).join(', ');
  return (
    <div className="mst-missing" role="status">
      <span>
        {missing.length === 1 ? 'A file is missing' : `${missing.length} files are missing`}: {names}.{' '}
        {isDesktop ? 'It may have moved or changed.' : 'This browser no longer has its copy: add the file again.'}
      </span>
      <FindFileButton file={first} />
    </div>
  );
}
