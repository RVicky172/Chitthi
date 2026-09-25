import {
  GalleryDialog,
  applyTheme,
  ensureFonts,
  installFontLinks,
  productDesign,
  replaceCard,
  samplePhoto,
  saveDesign,
  setDesign,
  setPhotos,
  setUI,
  switchProduct,
} from 'chitthi-postcard-studio';

// Cards share one browser storage: start from a clean, known state before setting this card up.
localStorage.clear();
indexedDB.deleteDatabase('chitthi');
replaceCard(productDesign('postcard'), [], null);
installFontLinks();

// Save a few real designs (rendered by the card engine) so the gallery has something to group by layout.
(async () => {
  await ensureFonts(['Rozha One', 'Kalam', 'Baloo 2', 'Hind']);
  applyTheme('diwali');
  setPhotos([samplePhoto(0)]);
  setDesign({ layout: 'arch', designName: 'Diwali card for Nani' });
  await saveDesign(true);
  applyTheme('holi');
  setPhotos([samplePhoto(1)]);
  setDesign({ layout: 'full', designName: 'Holi with the cousins' });
  await saveDesign(true);
  applyTheme('bday');
  setPhotos([samplePhoto(2), samplePhoto(3)]);
  setDesign({ layout: 'arch', designName: 'Aarav turns 7' });
  await saveDesign(true);
  switchProduct('frame');
  setPhotos([samplePhoto(2)]);
  setDesign({ designName: 'Maa & Papa, 1998', frame: 'cream' });
  await saveDesign(true);
  setUI({ gallery: true });
})();

export const SavedDesigns = () => <GalleryDialog />;
