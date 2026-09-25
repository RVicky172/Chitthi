import { PhotoStore, samplePhoto, setPhotos, storePhotos, productDesign, replaceCard } from 'chitthi-postcard-studio';

// Cards share one browser storage: start from a clean, known state before setting this card up.
localStorage.clear();
indexedDB.deleteDatabase('chitthi');
replaceCard(productDesign('postcard'), [], null);
// The store lives in IndexedDB: seed it with a few photos, and put one on the card so it shows its badge.
const shots = [0, 1, 2, 3, 2, 0].map((m, i) => {
  const p = samplePhoto(m, 600 + i * 40, 420);
  return { ...p, id: `seed-${i}`, name: `IMG_20${41 + i}.jpg`, url: (p.src as HTMLCanvasElement).toDataURL('image/jpeg', 0.8) };
});
void storePhotos(shots.map(({ name, url }) => ({ name, url })));
setPhotos([shots[1]]);

export const WithPhotoOnCard = () => (
  <div className="pane" style={{ width: 420 }}>
    <h3>Photo store</h3>
    <PhotoStore />
  </div>
);
