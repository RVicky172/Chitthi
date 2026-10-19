import { useEffect, useState, type KeyboardEvent } from 'react';
import type { VKind } from '../../engine/videoFormats';
import { sizeText } from '../../lib/mediaStore';
import type { ProjectEntry, Studio } from '../../lib/projects';
import { toast } from '../../lib/toast';
import {
  askToKeepStorage,
  deleteProject,
  duplicateProject,
  listProjects,
  newProject,
  openProject,
  projectsUsage,
  renameProject,
  spaceFreed,
  NAME_MAX,
  type ProjectsUsage,
} from '../../state/projects';
import { CopyIcon, EditIcon, PlusIcon, TrashIcon } from '../icons';

/*
 * The Projects panel (408 §9, AC-3, AC-7, AC-9): a studio's saved projects, newest first, with New, Open, Rename (F2),
 * Duplicate and Delete (asks first, showing the space it frees), and the space they take. Arrow keys move between
 * projects, Enter opens one; what happens is announced. Loaded on demand from the Projects button in the top bar.
 */

/** The panel's settings. */
interface ProjectsPanelProps {
  studio: Studio;
  /** A new video's kind (the studio's mode). */
  kind: VKind;
  onClose: () => void;
}

const KIND_LABELS = { reel: 'Reel', vlog: 'YouTube', photo: 'Photo post' } as const;

/**
 * A length for people.
 * @param seconds the length
 * @returns “1:05”
 */
const lengthText = (seconds: number): string => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

/**
 * What a project holds, for its row.
 * @param entry the project
 * @returns “Reel · 0:42” or “Photo post · 4 photos”
 */
function holdsText(entry: ProjectEntry): string {
  const photos = entry.photos === 1 ? '1 photo' : `${entry.photos} photos`;
  const amount = entry.studio === 'photo' ? photos : lengthText(entry.length);
  return `${KIND_LABELS[entry.kind]} · ${amount}`;
}

/**
 * The space line under the list.
 * @param usage what projects use and the browser allows
 * @returns “Projects use 3.2 GB; about 41 GB free for this site”
 */
function usageText(usage: ProjectsUsage): string {
  const used = `Projects use ${sizeText(usage.used)}`;
  return usage.allowed === null ? used : `${used}; about ${sizeText(Math.max(0, usage.allowed - usage.used))} free for this site`;
}

/** One row's actions. */
interface RowProps {
  entry: ProjectEntry;
  renaming: boolean;
  onOpen: () => void;
  onRename: (name: string | null) => void;
  onStartRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

/**
 * One project in the list: open it (the row's main button), rename, duplicate, delete. A project that can't be read
 * can only be deleted.
 * @param props the project, whether it is being renamed, and the actions
 */
function ProjectRow({ entry, renaming, onOpen, onRename, onStartRename, onDuplicate, onDelete }: Readonly<RowProps>) {
  const changed = new Date(entry.changed).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  return (
    <li className={entry.readable ? 'mst-proj' : 'mst-proj mst-proj-bad'}>
      {renaming ? (
        <input
          className="mst-proj-name"
          aria-label={`New name for ${entry.name}`}
          defaultValue={entry.name}
          maxLength={NAME_MAX}
          autoFocus
          onKeyDown={(event) => {
            if (event.key === 'Enter') onRename(event.currentTarget.value);
            if (event.key === 'Escape') {
              event.preventDefault();
              onRename(null);
            }
          }}
          onBlur={(event) => onRename(event.currentTarget.value)}
        />
      ) : (
        <button type="button" className="mst-proj-open" data-id={entry.id} disabled={!entry.readable} onClick={onOpen}>
          {entry.thumb ? <img src={entry.thumb} alt="" /> : <span className="mst-proj-thumb" aria-hidden="true" />}
          <span className="mst-proj-text">
            <strong>{entry.name}</strong>
            <span>{entry.readable ? `${holdsText(entry)} · ${changed} · ${sizeText(entry.bytes)}` : 'Can’t be opened: the saved file is damaged'}</span>
          </span>
        </button>
      )}
      <span className="mst-proj-actions">
        {entry.readable && (
          <>
            <button type="button" className="btn icon ghost" aria-label={`Rename ${entry.name} (F2)`} title="Rename (F2)" onClick={onStartRename}>
              <EditIcon />
            </button>
            <button type="button" className="btn icon ghost" aria-label={`Duplicate ${entry.name}`} title="Duplicate" onClick={onDuplicate}>
              <CopyIcon />
            </button>
          </>
        )}
        <button type="button" className="btn icon ghost" aria-label={`Delete ${entry.name}`} title="Delete" onClick={onDelete}>
          <TrashIcon />
        </button>
      </span>
    </li>
  );
}

/** A delete waiting for its answer. */
interface Asking {
  entry: ProjectEntry;
  bytes: number;
}

/**
 * The delete question: the project's name and the space it frees.
 * @param props the project, its space, and the answers
 * @param props.asking the project and the space it frees
 * @param props.onAnswer called with true to delete
 */
function DeleteQuestion({ asking, onAnswer }: Readonly<{ asking: Asking; onAnswer: (yes: boolean) => void }>) {
  return (
    <div className="mst-proj-ask" role="alertdialog" aria-label="Delete project">
      <p>
        Delete “{asking.entry.name}”? This frees {sizeText(asking.bytes)}. Your own files on this computer are never deleted.
      </p>
      <button type="button" className="btn danger" autoFocus onClick={() => onAnswer(true)}>
        Delete
      </button>
      <button type="button" className="btn ghost" onClick={() => onAnswer(false)}>
        Cancel
      </button>
    </div>
  );
}

/**
 * Moves focus between the projects with the arrow keys; F2 renames the focused one.
 * @param event the key
 * @param onRename starts renaming a project
 */
function onListKey(event: KeyboardEvent<HTMLUListElement>, onRename: (id: string) => void): void {
  const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('.mst-proj-open:not(:disabled)')];
  const at = buttons.findIndex((button) => button === document.activeElement);
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    const next = buttons[Math.min(buttons.length - 1, Math.max(0, at + (event.key === 'ArrowDown' ? 1 : -1)))];
    next?.focus();
  }
  const focused = buttons[at];
  if (event.key === 'F2' && focused?.dataset.id) {
    event.preventDefault();
    onRename(focused.dataset.id);
  }
}

/**
 * The Projects panel (see the file's comment).
 * @param props the studio, a new video's kind, and closing the panel
 */
export function ProjectsPanel({ studio, kind, onClose }: Readonly<ProjectsPanelProps>) {
  const [entries, setEntries] = useState<ProjectEntry[] | null>(null);
  const [usage, setUsage] = useState<ProjectsUsage | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [asking, setAsking] = useState<Asking | null>(null);
  const [said, say] = useState('');
  // Bumped after each change: the list and the space are read again.
  const [version, setVersion] = useState(0);
  const load = (): void => {
    setVersion((current) => current + 1);
  };
  useEffect(() => {
    let live = true;
    void Promise.all([listProjects(studio), projectsUsage()]).then(([listed, used]) => {
      if (!live) return;
      setEntries(listed);
      setUsage(used);
    });
    return () => {
      live = false;
    };
  }, [studio, version]);

  const open = async (entry: ProjectEntry) => {
    const result = await openProject(entry.id);
    if ('error' in result) {
      say(result.error);
      return;
    }
    if (result.dropped.length) toast(result.dropped.join(' '));
    onClose();
  };
  const rename = async (entry: ProjectEntry, name: string | null) => {
    setRenaming(null);
    if (name === null || name.trim() === entry.name) return;
    const why = await renameProject(entry.id, name);
    say(why ?? `Renamed to ${name.trim()}.`);
    load();
  };
  const duplicate = async (entry: ProjectEntry) => {
    const copy = await duplicateProject(entry.id);
    say(typeof copy === 'string' ? `Copied ${entry.name}.` : copy.error);
    load();
  };
  const answer = async (yes: boolean) => {
    const question = asking;
    setAsking(null);
    if (!yes || !question) return;
    const freed = await deleteProject(question.entry.id);
    say(`Deleted ${question.entry.name}; ${sizeText(freed)} freed.`);
    load();
  };

  let listBody = <p className="hint">Loading your projects…</p>;
  if (entries?.length === 0) listBody = <p className="hint">No saved projects yet.</p>;
  else if (entries)
    listBody = (
      <ul className="mst-proj-list" aria-label={`${studio === 'video' ? 'Video' : 'Photo'} projects, newest first`} onKeyDown={(event) => onListKey(event, setRenaming)}>
        {entries.map((entry) => (
          <ProjectRow
            key={entry.id}
            entry={entry}
            renaming={renaming === entry.id}
            onOpen={() => void open(entry)}
            onRename={(name) => void rename(entry, name)}
            onStartRename={() => setRenaming(entry.id)}
            onDuplicate={() => void duplicate(entry)}
            onDelete={() => void spaceFreed(entry.id).then((bytes) => setAsking({ entry, bytes }))}
          />
        ))}
      </ul>
    );

  return (
    <div className="mst-projects">
      <div className="mst-proj-new">
        {studio === 'video' ? (
          <>
            <button type="button" className="btn" onClick={() => void newProject('video', 'reel').then(onClose)}>
              <PlusIcon /> New Reel
            </button>
            <button type="button" className="btn" onClick={() => void newProject('video', 'vlog').then(onClose)}>
              <PlusIcon /> New YouTube video
            </button>
          </>
        ) : (
          <button type="button" className="btn" onClick={() => void newProject('photo').then(onClose)}>
            <PlusIcon /> New photo post
          </button>
        )}
      </div>
      {asking && <DeleteQuestion asking={asking} onAnswer={(yes) => void answer(yes)} />}
      {listBody}
      {usage && (
        <p className="mst-proj-usage">
          {usageText(usage)}
          {usage.persisted === false && (
            <>
              {' '}
              The browser may clear them if the device runs low on space.{' '}
              <button type="button" className="btn ghost" onClick={() => void askToKeepStorage().then(load)}>
                Keep my projects
              </button>
            </>
          )}
        </p>
      )}
      <p className="vh" aria-live="polite">
        {said}
      </p>
    </div>
  );
}
