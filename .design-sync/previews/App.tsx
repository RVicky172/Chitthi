import { App, applyTheme, installFontLinks, productDesign, replaceCard, samplePhoto, setPhotos, setUI } from 'chitthi-postcard-studio';

// Cards share one browser storage: start from a clean, known state before setting this card up.
localStorage.clear();
indexedDB.deleteDatabase('chitthi');
replaceCard(productDesign('postcard'), [], null);
// App mirrors the URL hash: #/studio opens the design studio instead of the landing page.
location.hash = '#/studio';
installFontLinks();
applyTheme('diwali');
setPhotos([samplePhoto(0), samplePhoto(2)]);
setUI({ screen: 'studio', pane: 'layout' });

// The studio fills a full-height flex column (the app's #root is height:100%, flex column).
export const Studio = () => (
  <div style={{ height: 860, display: 'flex', flexDirection: 'column' }}>
    <App />
  </div>
);
