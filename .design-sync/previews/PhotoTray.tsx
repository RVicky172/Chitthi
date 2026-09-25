import { PhotoTray, productDesign, replaceCard, samplePhoto, setDesign, setPhotos, setUI } from 'chitthi-postcard-studio';

// Cards share one browser storage: start from a clean, known state before setting this card up.
localStorage.clear();
indexedDB.deleteDatabase('chitthi');
replaceCard(productDesign('postcard'), [], null);
// A three-photo layout: slot buttons on the left, the card's photos after them; slot 2 is selected.
setDesign({ layout: 'collage3' });
setPhotos([samplePhoto(0), samplePhoto(1), samplePhoto(2), samplePhoto(3)]);
setUI({ slot: 1 });

export const ThreeSlots = () => (
  <div style={{ background: 'var(--stage)', padding: 16, borderRadius: 18, width: 520 }}>
    <PhotoTray />
  </div>
);
