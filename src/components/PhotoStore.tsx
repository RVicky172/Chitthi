import { useEffect, useState } from 'react';
import { putOnCard, removeStored, useLibrary } from '../state/library';
import { usePhotoSlots } from '../state/photoSlots';
import { useApp } from '../state/store';

/** Every photo ever uploaded in this browser. Tap one to use it on the card straight away. */
export function PhotoStore() {
  const { list, error } = useLibrary();
  const photos = useApp((s) => s.photos);
  const { count, active } = usePhotoSlots();
  const [sure, setSure] = useState<string | null>(null);
  useEffect(() => {
    if (!sure) return;
    const t = setTimeout(() => setSure(null), 3000);
    return () => clearTimeout(t);
  }, [sure]);

  if (error) return <p className="hint">The photo store isn’t available in this browser.</p>;
  if (!list)
    return (
      <ul className="store" aria-busy="true" aria-label="Loading your photo store">
        {[0, 1, 2, 3].map((i) => (
          <li key={i}>
            <span className="skel store-skel" />
          </li>
        ))}
      </ul>
    );
  if (!list.length) return <p className="hint">Photos you upload are kept here, ready to use on any card.</p>;

  const slotOf = new Map(photos.map((p, i) => [p.url, i < count ? i : -1]));
  return (
    <>
      <p className="hint">
        Tap a photo to use it{count > 1 ? ` in slot ${active + 1}` : ''}. Photos stay here for your next cards.
      </p>
      <ul className="store">
        {list.map((s) => {
          const at = slotOf.get(s.url) ?? -2;
          return (
            <li key={s.id}>
              <button
                type="button"
                className="store-ph"
                aria-pressed={at >= 0}
                title={s.name}
                onClick={() => void putOnCard(s)}
              >
                <img src={s.url} alt={s.name} loading="lazy" decoding="async" />
                {at >= 0 && <b>{count > 1 ? `Slot ${at + 1}` : 'On card'}</b>}
              </button>
              <button
                type="button"
                className={`store-del${sure === s.id ? ' sure' : ''}`}
                aria-label={sure === s.id ? `Tap again to delete ${s.name}` : `Delete ${s.name} from the store`}
                title={sure === s.id ? 'Tap again to delete' : 'Delete from store'}
                onClick={() => {
                  if (sure !== s.id) setSure(s.id);
                  else {
                    setSure(null);
                    void removeStored(s.id);
                  }
                }}
              >
                {sure === s.id ? 'Delete?' : '×'}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
