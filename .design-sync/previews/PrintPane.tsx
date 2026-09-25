import { PrintPane, installFontLinks, samplePhoto, setExp, setPhotos, productDesign, replaceCard } from 'chitthi-postcard-studio';

// Cards share one browser storage: start from a clean, known state before setting this card up.
localStorage.clear();
indexedDB.deleteDatabase('chitthi');
replaceCard(productDesign('postcard'), [], null);
installFontLinks();
setPhotos([samplePhoto(0)]);
setExp({ bleed: '3', dpi: '300', format: 'pdf', marks: true, back: true });

export const PrintPack = () => (
  <div className="panel" style={{ width: 420 }}>
    <PrintPane />
  </div>
);
