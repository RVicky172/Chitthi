import { Stage, applyTheme, installFontLinks, samplePhoto, setDesign, setPhotos, productDesign, replaceCard } from 'chitthi-postcard-studio';

// Cards share one browser storage: start from a clean, known state before setting this card up.
localStorage.clear();
indexedDB.deleteDatabase('chitthi');
replaceCard(productDesign('postcard'), [], null);
// Stage renders whatever card is in the shared store: set it up once, before render.
installFontLinks();
applyTheme('holi');
setDesign({ layout: 'full', vAlign: 'bottom', insta: 'meera.clicks' });
setPhotos([samplePhoto(1), samplePhoto(0), samplePhoto(2)]);

export const HoliPostcard = () => (
  <div style={{ height: 640, display: 'flex' }}>
    <Stage />
  </div>
);
