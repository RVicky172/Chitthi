import { toast } from '../lib/toast';
import { addFiles } from '../state/actions';
import { putOnCard, useLibrary } from '../state/library';
import { placePhoto, selectSlot, usePhotoSlots } from '../state/photoSlots';
import { PhotoThumb } from './canvases';
import { PlusIcon } from './icons';

/**
 * Filmstrip under the preview: pick a slot, then tap a photo to put it there instantly.
 * Shows the card's photos first, then everything else in the photo store.
 */
export function PhotoTray() {
  const { count, active, filled, slotOf, photos } = usePhotoSlots();
  const { list } = useLibrary();
  if (!count) return null;

  const onCard = new Set(photos.map((p) => p.url));
  const more = (list ?? []).filter((s) => !onCard.has(s.url));
  const target = count > 1 ? active : 0;

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    const msgs = await addFiles([...files]);
    if (msgs.length) toast(msgs[0][1]);
  };

  return (
    <div className="tray" role="group" aria-label="Photos on the card">
      {count > 1 && (
        <div className="tray-slots" role="radiogroup" aria-label="Photo slot to fill">
          {filled.map((p, i) => (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={i === active}
              aria-label={`Slot ${i + 1}`}
              className="tray-slot"
              onClick={() => selectSlot(i)}
            >
              {p ? <PhotoThumb photo={p} /> : <span className="tray-empty" />}
              <b>{i + 1}</b>
            </button>
          ))}
        </div>
      )}
      <ul className="tray-lib" aria-label={count > 1 ? `Tap a photo to put it in slot ${active + 1}` : 'Tap a photo to use it'}>
        {photos.map((p) => {
          const at = slotOf(p.id);
          return (
            <li key={p.id}>
              <button type="button" className="tray-ph" aria-pressed={at >= 0} title={p.name} onClick={() => placePhoto(p.id, target)}>
                <PhotoThumb photo={p} />
                {at >= 0 && count > 1 && <b>{at + 1}</b>}
              </button>
            </li>
          );
        })}
        {more.length > 0 && <li className="tray-sep" aria-hidden="true" />}
        {more.map((s) => (
          <li key={s.id}>
            <button type="button" className="tray-ph" aria-pressed={false} title={`${s.name} (photo store)`} onClick={() => void putOnCard(s)}>
              <img src={s.url} alt="" loading="lazy" decoding="async" />
            </button>
          </li>
        ))}
        <li>
          <label className="tray-add" title="Add photos">
            <input
              type="file"
              multiple
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              onChange={(e) => {
                void add(e.target.files);
                e.target.value = '';
              }}
            />
            <PlusIcon />
            <span className="vh">Add photos</span>
          </label>
        </li>
      </ul>
    </div>
  );
}
