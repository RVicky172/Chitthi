import { PhotoLibrary, applyTheme, installFontLinks, productDesign, replaceCard, samplePhoto, setPhotos, setUI, storePhotos } from 'chitthi-studio';

// Cards share one browser storage: start from a clean, known state before setting this card up.
localStorage.clear();
indexedDB.deleteDatabase('chitthi');
replaceCard(productDesign('postcard'), [], null);
installFontLinks();
applyTheme('diwali');
// The library lives in IndexedDB: seed it with photos of different shapes, and put one on the card.
const seeds: [number, number, number, string][] = [
  [0, 900, 640, 'Marine Drive at sunset.jpg'],
  [1, 640, 900, 'Rangoli at the door.jpg'],
  [2, 800, 800, 'Diyas on the balcony.jpg'],
  [3, 1200, 600, 'Monsoon over the ghats.jpg'],
  [0, 700, 980, 'Temple lamps.jpg'],
  [2, 1000, 700, 'Kites on Makar Sankranti.jpg'],
];
const shots = seeds.map(([m, w, h, name], i) => {
  const p = samplePhoto(m, w, h);
  return { ...p, id: `seed-${i}`, name, url: (p.src as HTMLCanvasElement).toDataURL('image/jpeg', 0.8) };
});
void storePhotos(shots.map(({ name, url }) => ({ name, url }))).then(() => {
  setPhotos([shots[0]]);
  setUI({ library: true, libraryTab: 'mine' });
});

export const YourPhotos = () => <PhotoLibrary />;
