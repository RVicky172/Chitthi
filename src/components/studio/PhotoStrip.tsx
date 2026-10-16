import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { toast } from '../../lib/toast';
import { movePhotoTo, removePhoto, selectPhoto, useIg, type IgItem } from '../../state/instagram';
import { addPhotos } from '../../state/instagramMedia';
import { AddPhotoIcon, TrashIcon } from '../icons';
import { PHOTO_ACCEPT, photosOf } from './PhotoPanels';
import { usePhotoRender } from './photoRender';

/* The photo strip along the bottom of the photo editor: select, drag to reorder (Alt + arrows), remove, add. */

/**
 * Adds photos and shows the first message, if any.
 * @param files the files chosen or dropped
 * @returns resolves once they are added
 */
async function addAndTell(files: Iterable<File>): Promise<void> {
  const messages = await addPhotos(photosOf(files));
  if (messages[0]) toast(messages[0]);
}

/** One thumbnail in the strip. */
interface StripThumbProps {
  item: IgItem;
  index: number;
  isActive: boolean;
  /** Whether a dragged photo would land here. */
  isDropTarget: boolean;
  onDown: (event: ReactPointerEvent) => void;
  onMove: (event: ReactPointerEvent) => void;
  onUp: (event: ReactPointerEvent) => void;
}

/**
 * One photo's thumbnail: press and drag to reorder, Alt + ← / → to move it, Enter or Space to select it, and its
 * remove button.
 * @param props the photo, its place, selection, drop marker and the drag handlers
 */
function StripThumb({ item, index, isActive, isDropTarget, onDown, onMove, onUp }: Readonly<StripThumbProps>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const formatId = useIg((state) => state.format);
  usePhotoRender(canvasRef, item, formatId, 64);
  return (
    <li className={`mst-thumb${isActive ? ' on' : ''}${isDropTarget ? ' drop' : ''}`}>
      <button
        type="button"
        aria-pressed={isActive}
        aria-label={`Photo ${index + 1}: ${item.name}${index === 0 ? ' (cover)' : ''}`}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          onDown(event);
        }}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onKeyDown={(event) => {
          // Keyboard reordering: Alt + arrow keys.
          if (event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
            event.preventDefault();
            movePhotoTo(item.id, index + (event.key === 'ArrowLeft' ? -1 : 1));
          } else if (event.key === 'Enter' || event.key === ' ') selectPhoto(item.id);
        }}
      >
        <canvas ref={canvasRef} />
        <span className="ig-n">{index + 1}</span>
      </button>
      <button type="button" className="mst-thumb-x" aria-label={`Remove photo ${index + 1}`} onClick={() => removePhoto(item.id)}>
        <TrashIcon />
      </button>
    </li>
  );
}

/** The photo strip along the bottom: select, drag to reorder, remove, add. */
export function PhotoStrip() {
  const items = useIg((state) => state.items);
  const selected = useIg((state) => state.selected);
  const limit = useIg((state) => state.limit);
  const listRef = useRef<HTMLOListElement>(null);
  const drag = useRef<{ id: string; x: number; moved: boolean } | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [isDropping, setDropping] = useState(false);
  // Where a photo dragged to clientX would go: before the first thumbnail whose middle is right of it.
  const targetIndex = (clientX: number) => {
    const thumbs = [...(listRef.current?.querySelectorAll<HTMLElement>('.mst-thumb') ?? [])];
    const before = thumbs.findIndex((thumb) => {
      const rect = thumb.getBoundingClientRect();
      return clientX < rect.left + rect.width / 2;
    });
    return before < 0 ? thumbs.length - 1 : before;
  };
  const activeId = selected ?? items.at(0)?.id;
  return (
    <div
      className={`mst-strip${isDropping ? ' over' : ''}`}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('Files')) {
          event.preventDefault();
          setDropping(true);
        }
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDropping(false);
        void addAndTell(event.dataTransfer.files);
      }}
    >
      <span className="mst-strip-count">
        {items.length}/{limit}
      </span>
      <ol className="mst-thumbs" ref={listRef} aria-label="Photos in this post, in order">
        {items.map((item, index) => (
          <StripThumb
            key={item.id}
            item={item}
            index={index}
            isActive={item.id === activeId}
            isDropTarget={dropIndex === index}
            onDown={(event) => {
              drag.current = { id: item.id, x: event.clientX, moved: false };
            }}
            onMove={(event) => {
              const pressed = drag.current;
              if (!pressed) return;
              if (!pressed.moved && Math.abs(event.clientX - pressed.x) < 6) return;
              pressed.moved = true;
              setDropIndex(targetIndex(event.clientX));
            }}
            onUp={(event) => {
              const pressed = drag.current;
              drag.current = null;
              setDropIndex(null);
              if (pressed?.moved) movePhotoTo(pressed.id, targetIndex(event.clientX));
              else selectPhoto(item.id);
            }}
          />
        ))}
        {items.length < limit && (
          <li className="mst-add">
            <label title="Add photos">
              <AddPhotoIcon />
              <span className="vh">Add photos</span>
              <input
                type="file"
                accept={PHOTO_ACCEPT}
                multiple
                onChange={(event) => {
                  const input = event.target;
                  void addPhotos(photosOf(input.files ?? [])).then((messages) => {
                    input.value = '';
                    if (messages[0]) toast(messages[0]);
                  });
                }}
              />
            </label>
          </li>
        )}
      </ol>
      <span className="hint mst-strip-hint">Drag to reorder · the first photo is the cover</span>
    </div>
  );
}
