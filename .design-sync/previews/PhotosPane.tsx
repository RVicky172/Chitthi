import { PhotosPane, applyTheme, installFontLinks, samplePhoto, setDesign, setPhotos, storePhotos, productDesign, replaceCard } from 'chitthi-postcard-studio';

// Cards share one browser storage: start from a clean, known state before setting this card up.
localStorage.clear();
indexedDB.deleteDatabase('chitthi');
replaceCard(productDesign('postcard'), [], null);
installFontLinks();
applyTheme('monsoon');
setDesign({ layout: 'collage2' });
const shots = [1, 2, 0].map((m, i) => {
  const p = samplePhoto(m);
  return { ...p, id: `ph-${i}`, name: ['IMG_2041.jpg', 'Munnar-tea-garden.jpg', 'Beach-sunset.jpg'][i], url: (p.src as HTMLCanvasElement).toDataURL('image/jpeg', 0.8) };
});
void storePhotos(shots.map(({ name, url }) => ({ name, url })));
setPhotos(shots.slice(0, 2));

export const TwoPhotoLayout = () => (
  <div className="panel" style={{ width: 420 }}>
    <PhotosPane />
  </div>
);
