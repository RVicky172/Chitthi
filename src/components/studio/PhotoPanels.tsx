import { useState } from 'react';
import { IG_BATCH_PRESETS, IG_MAX_BATCH, igFormat } from '../../data/instagram';
import { MAX_MB } from '../../engine/photo';
import { RAW_EXTS } from '../../engine/raw';
import { logError } from '../../lib/errors';
import { toast } from '../../lib/toast';
import { isDesktop } from '../../platform/desktop';
import { clearBatch, setLimit, useIg } from '../../state/instagram';
import { addPhotos } from '../../state/instagramMedia';
import { fullUrl, useLibrary } from '../../state/library';
import type { StoredPhoto } from '../../types';
import { AddPhotoIcon, InstagramIcon, PhotosIcon, TrashIcon } from '../icons';
import { EmptyState, FoldSection } from '../panel';
import { dataUrlToBlob } from './photoRender';

/* The photo editor's empty stage, its Photos panel (add photos, the batch size, the photo library). */

/** Photos the file pickers offer: the web image types, and camera RAW files (developed in the desktop app, P1.9). */
export const PHOTO_ACCEPT = ['image/jpeg', 'image/png', 'image/webp', ...RAW_EXTS.map((extension) => `.${extension}`)].join(',');

/**
 * Files as photos to add.
 * @param files the files chosen or dropped
 * @returns their names, contents and types
 */
export const photosOf = (files: Iterable<File>) => [...files].map((file) => ({ name: file.name, blob: file, type: file.type }));

/** The empty stage. */
interface EmptyStageProps {
  /** Opens the Photos panel once photos are added. */
  onAdd: () => void;
}

/**
 * The stage before any photo: what this editor makes, and a button to add photos.
 * @param props what to do once photos are added
 */
export function EmptyPhotoStage({ onAdd }: Readonly<EmptyStageProps>) {
  const [messages, setMessages] = useState<string[]>([]);
  return (
    <EmptyState
      icon={<InstagramIcon />}
      title="Make Instagram posts"
      action={
        <>
          <label className="btn primary mst-file">
            <AddPhotoIcon />
            Add photos
            <input
              type="file"
              accept={PHOTO_ACCEPT}
              multiple
              onChange={(event) => {
                void addPhotos(photosOf(event.target.files ?? [])).then((added) => {
                  setMessages(added);
                  onAdd();
                });
              }}
            />
          </label>
          {messages.length > 0 && <p className="hint bad">{messages[0]}</p>}
        </>
      }
    >
      Add up to {IG_MAX_BATCH} photos. Each one is shaped to the post format; add text, stickers and drawings, then export or share.
    </EmptyState>
  );
}

/** The library picker. */
interface LibraryPickerProps {
  /** Shows messages about the photos added. */
  onMessages: (messages: string[]) => void;
}

/**
 * The photo library's thumbnails: a click adds that photo to the batch (while there is room).
 * @param props where to show messages
 */
function LibraryPicker({ onMessages }: Readonly<LibraryPickerProps>) {
  const { list, error } = useLibrary();
  const room = useIg((state) => state.limit - state.items.length);
  const [adding, setAdding] = useState<string | null>(null);
  const pick = async (stored: StoredPhoto) => {
    setAdding(stored.id);
    try {
      const url = await fullUrl(stored);
      const blob = url.startsWith('data:') ? dataUrlToBlob(url) : await (await fetch(url)).blob();
      onMessages(await addPhotos([{ name: stored.name, blob }]));
    } catch (thrown) {
      logError('handled', thrown);
      onMessages([`${stored.name} couldn’t be opened.`]);
    } finally {
      setAdding(null);
    }
  };
  if (error) return <p className="hint">The photo library isn’t available {isDesktop ? 'right now' : 'in this browser'}.</p>;
  if (!list) return <p className="hint">Loading your photo library…</p>;
  if (!list.length) return <p className="hint">Empty. Photos you add in the print studio appear here.</p>;
  return (
    <ul className="ig-lib" aria-label="Your photo library">
      {list.map((stored) => (
        <li key={stored.id}>
          <button type="button" disabled={room <= 0 || adding === stored.id} title={stored.name} aria-label={`Add ${stored.name}`} onClick={() => void pick(stored)}>
            {stored.thumb ? <img src={stored.thumb} alt="" /> : <span>{stored.name}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * The batch size: the ready-made sizes and a typed one (never below the photos already in the batch).
 */
function BatchSize() {
  const itemCount = useIg((state) => state.items.length);
  const limit = useIg((state) => state.limit);
  const format = igFormat(useIg((state) => state.format));
  const [typed, setTyped] = useState(String(limit));
  const [limitShown, setLimitShown] = useState(limit);
  if (limit !== limitShown) {
    setLimitShown(limit);
    setTyped(String(limit));
  }
  const chooseLimit = (size: number) => {
    const kept = setLimit(size);
    if (kept > size) toast(`The batch already has ${kept} photos. Remove some to go lower.`);
  };
  return (
    <FoldSection id="photos.batch" title="Batch size" note={`${itemCount} of ${limit}`} defaultOpen={false}>
      <div className="ig-limit" role="group" aria-label="Batch size">
        {IG_BATCH_PRESETS.map((size) => (
          <button key={size} type="button" className="chip" aria-pressed={limit === size} disabled={size < itemCount} onClick={() => chooseLimit(size)}>
            {size}
          </button>
        ))}
        <label className="ig-limit-own">
          <span className="vh">Custom batch size, 1 to {IG_MAX_BATCH}</span>
          <input
            type="number"
            min={Math.max(1, itemCount)}
            max={IG_MAX_BATCH}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            onBlur={() => chooseLimit(Number(typed))}
            onKeyDown={(event) => {
              if (event.key === 'Enter') chooseLimit(Number(typed));
            }}
          />
        </label>
        <span className="hint">up to {IG_MAX_BATCH}</span>
      </div>
      <p className="hint">
        {format.ratio} {format.label.toLowerCase()}: {format.use} Instagram crops every photo of a carousel to the first photo’s shape, so one post uses one format.
      </p>
    </FoldSection>
  );
}

/** The Photos panel: add photos (picked, dropped or from the library), the batch size, clearing the batch. */
export function PhotoMediaPanel() {
  const itemCount = useIg((state) => state.items.length);
  const [messages, setMessages] = useState<string[]>([]);
  const add = async (files: FileList | null) => {
    if (files?.length) setMessages(await addPhotos(photosOf(files)));
  };
  return (
    <>
      <div className="ig-group">
        <label className="mst-drop">
          <AddPhotoIcon />
          <span>
            <span className="text-label">Choose photos</span> or drop them here
          </span>
          <small>
            JPG, PNG or WebP up to {MAX_MB} MB; camera RAW {isDesktop ? 'in 16 bits' : '(its built-in preview)'}
          </small>
          <input
            type="file"
            accept={PHOTO_ACCEPT}
            multiple
            onChange={(event) => {
              const input = event.target;
              void add(input.files).then(() => {
                input.value = '';
              });
            }}
          />
        </label>
        {messages.length > 0 && (
          <ul className="msgs" role="alert">
            {messages.map((message, index) => (
              // Messages can repeat; their order is fixed for the batch.
              <li key={`${index}:${message}`} className="err">
                {message}
              </li>
            ))}
          </ul>
        )}
      </div>
      <BatchSize />
      <FoldSection
        id="photos.library"
        title={
          <>
            <PhotosIcon /> From your photo library
          </>
        }
      >
        <LibraryPicker onMessages={setMessages} />
      </FoldSection>
      {itemCount > 0 && (
        <button
          type="button"
          className="sbtn"
          onClick={() => {
            if (confirm('Remove every photo from this batch? Your photo library keeps its copies.')) clearBatch();
          }}
        >
          <TrashIcon />
          Clear batch
        </button>
      )}
    </>
  );
}
