import { useEffect, useState } from 'react';
import { keyOfStored, putOnCard, removeStored, useLibrary } from '../state/library';
import { usePhotoSlots } from '../state/photoSlots';
import { dimsOf, fitsSlot, rememberDims, slotInfo, useDimsTick } from '../state/photoFit';
import { photoKey } from '../lib/photoKey';
import { setUI, useApp } from '../state/store';
import { Check } from './common';
import { isDesktop } from '../platform/desktop';

/** Every photo ever uploaded in this browser. Tap one to use it on the card straight away. */
export function PhotoStore() {
  const { list, error } = useLibrary();
  const photos = useApp((state) => state.photos),
    design = useApp((state) => state.design);
  const [fitOnly, setFitOnly] = useState(false);
  useDimsTick();
  const { count, active } = usePhotoSlots();
  const [sure, setSure] = useState<string | null>(null);
  useEffect(() => {
    if (!sure) return;
    const timer = setTimeout(() => setSure(null), 3000);
    return () => clearTimeout(timer);
  }, [sure]);

  if (error)
    return <p className="hint">The photo store isn’t available {isDesktop ? 'right now' : 'in this browser'}.</p>;
  if (!list)
    return (
      <ul className="store" aria-busy="true" aria-label="Loading your photo store">
        {[0, 1, 2, 3].map((slotIndex) => (
          <li key={slotIndex}>
            <span className="skel store-skel" />
          </li>
        ))}
      </ul>
    );
  if (!list.length) return <p className="hint">Photos you upload are kept here, ready to use on any card.</p>;

  const slotOf = new Map(photos.map((photo, index) => [photoKey(photo.url), index < count ? index : -1]));
  list.forEach((stored) => stored.w && stored.h && rememberDims(keyOfStored(stored), stored.w, stored.h));
  const slot = slotInfo(design, active);
  const shown =
    fitOnly && slot
      ? list.filter((stored) => {
          const dims = dimsOf(keyOfStored(stored));
          return !dims || fitsSlot(dims.w, dims.h, slot.aspect);
        })
      : list;
  return (
    <>
      <p className="hint">
        Tap a photo to use it{count > 1 ? ` in slot ${active + 1}` : ''}. Photos stay here for your next designs.{' '}
        <button type="button" className="linkbtn" onClick={() => setUI({ library: true })}>
          Open the photo library
        </button>
      </p>
      {slot && (
        <Check checked={fitOnly} onChange={setFitOnly}>
          Only photos that suit {count > 1 ? `slot ${active + 1}` : 'the slot'} ({shown.length} of {list.length})
        </Check>
      )}
      <ul className="store">
        {shown.map((stored) => {
          const at = slotOf.get(keyOfStored(stored)) ?? -2;
          return (
            <li key={stored.id}>
              <button
                type="button"
                className="store-ph"
                aria-pressed={at >= 0}
                title={stored.name}
                onClick={() => void putOnCard(stored)}
              >
                <img src={stored.thumb ?? stored.url} alt={stored.name} loading="lazy" decoding="async" />
                {at >= 0 && <span className="text-label">{count > 1 ? `Slot ${at + 1}` : 'On card'}</span>}
              </button>
              <button
                type="button"
                className={`store-del${sure === stored.id ? ' sure' : ''}`}
                aria-label={
                  sure === stored.id ? `Tap again to delete ${stored.name}` : `Delete ${stored.name} from the store`
                }
                title={sure === stored.id ? 'Tap again to delete' : 'Delete from store'}
                onClick={() => {
                  if (sure !== stored.id) setSure(stored.id);
                  else {
                    setSure(null);
                    void removeStored(stored.id);
                  }
                }}
              >
                {sure === stored.id ? 'Delete?' : '×'}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
