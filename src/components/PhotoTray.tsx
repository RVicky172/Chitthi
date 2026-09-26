import { toast } from '../lib/toast';
import { addFiles } from '../state/actions';
import { putOnCard, useLibrary } from '../state/library';
import { dimsOf, fitsSlot, rememberDims, slotInfo, useDimsTick } from '../state/photoFit';
import { autoArrange, useRankedLibrary } from '../state/traits';
import { placePhoto, selectSlot, usePhotoSlots } from '../state/photoSlots';
import { setPhotos, setUI, useApp } from '../state/store';
import { PhotoThumb } from './canvases';
import { ArrangeIcon, CloseIcon, CropIcon, PhotosIcon, PlusIcon } from './icons';

/**
 * Filmstrip under the preview: pick a slot, then tap a photo to put it there instantly.
 * The card's photos come first (each can be taken off), then the photo store, best fit for the slot first;
 * photos whose shape doesn't suit the slot are dimmed. Crop and the full library are one tap away.
 */
const MAX_CARD = 8,
  MAX_LIB = 8;

export function PhotoTray() {
  const { count, active, filled, slotOf, photos } = usePhotoSlots();
  const design = useApp((s) => s.design);
  const { list } = useLibrary();
  const ranked = useRankedLibrary(list);
  useDimsTick();
  if (!count) return null;

  const slot = slotInfo(design, active);
  // Keep the strip short: the design's photos (those in the current slots first), then the library photos most
  // relevant for the selected slot. Everything else is one tap away in the photo library.
  const inSlots = new Set(filled.map((p) => p?.id));
  const cardShown = [...photos.filter((p) => inSlots.has(p.id)), ...photos.filter((p) => !inSlots.has(p.id))].slice(0, MAX_CARD);
  const more = ranked.slice(0, MAX_LIB).map((r) => r.photo);
  const hidden = photos.length - cardShown.length + Math.max(0, ranked.length - MAX_LIB);
  const target = count > 1 ? active : 0;
  const current = filled[target];

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    const msgs = await addFiles([...files]);
    if (msgs.length) toast(msgs[0][1]);
  };

  return (
    <div className="tray" role="group" aria-label="Photos on the design">
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
        {cardShown.map((p) => {
          const at = slotOf(p.id);
          return (
            <li key={p.id} className="tray-item">
              <button type="button" className="tray-ph" aria-pressed={at >= 0} title={p.name} onClick={() => placePhoto(p.id, target)}>
                <PhotoThumb photo={p} />
                {at >= 0 && count > 1 && <b>{at + 1}</b>}
              </button>
              <button
                type="button"
                className="tray-x"
                aria-label={`Take ${p.name} off the design`}
                title="Take off the design (stays in your library)"
                onClick={() => setPhotos(photos.filter((x) => x.id !== p.id))}
              >
                <CloseIcon />
              </button>
            </li>
          );
        })}
        {more.length > 0 && <li className="tray-sep" aria-hidden="true" />}
        {more.map((s) => {
          const d = dimsOf(s.url),
            fits = !d || !slot || fitsSlot(d.w, d.h, slot.aspect);
          return (
            <li key={s.id}>
              <button
                type="button"
                className={`tray-ph${fits ? '' : ' nofit'}`}
                aria-pressed={false}
                title={`${s.name} (library)${fits ? '' : ': shape doesn’t suit this slot, it will be cropped'}`}
                onClick={() => void putOnCard(s)}
              >
                <img src={s.url} alt="" loading="lazy" decoding="async" onLoad={(e) => rememberDims(s.url, e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)} />
              </button>
            </li>
          );
        })}
        {hidden > 0 && (
          <li>
            <button
              type="button"
              className="tray-more"
              title="See and choose from all your photos"
              onClick={() => setUI({ library: true, libraryTab: 'mine' })}
            >
              +{hidden}
              <small>more</small>
            </button>
          </li>
        )}
        <li className="tray-tools">
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
          <button
            type="button"
            className="tray-tool"
            disabled={!current}
            title={current ? `Crop the photo in ${count > 1 ? `slot ${target + 1}` : 'the slot'}` : 'Add a photo to crop it'}
            aria-label="Crop the selected photo"
            onClick={() => current && setUI({ cropId: current.id })}
          >
            <CropIcon />
          </button>
          <button
            type="button"
            className="tray-tool"
            disabled={!photos.length}
            title="Auto-arrange: best photo for each slot, cropped around its subject"
            aria-label="Auto-arrange photos"
            onClick={autoArrange}
          >
            <ArrangeIcon />
          </button>
          <button type="button" className="tray-tool" title="Open the photo library" aria-label="Open the photo library" onClick={() => setUI({ library: true })}>
            <PhotosIcon />
          </button>
        </li>
      </ul>
    </div>
  );
}
