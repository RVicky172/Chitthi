import { LayoutPane, installFontLinks, samplePhoto, setPhotos, switchProduct, productDesign, replaceCard } from 'chitthi-postcard-studio';

// Cards share one browser storage: start from a clean, known state before setting this card up.
localStorage.clear();
indexedDB.deleteDatabase('chitthi');
replaceCard(productDesign('postcard'), [], null);
// LayoutPane follows design.product: this card shows the calendar options (year, start month, pages, week start).
installFontLinks();
switchProduct('calendar');
setPhotos([samplePhoto(2), samplePhoto(1)]);

export const Calendar = () => (
  <div className="panel" style={{ width: 420 }}>
    <LayoutPane />
  </div>
);
