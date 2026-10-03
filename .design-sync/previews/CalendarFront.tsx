import { CalendarFront, installFontLinks, productDesign, replaceCard, samplePhoto, setDesign, setPhotos, switchProduct } from 'chitthi-studio';

// Cards share one browser storage: start from a clean, known state before setting this card up.
localStorage.clear();
indexedDB.deleteDatabase('chitthi');
replaceCard(productDesign('postcard'), [], null);
installFontLinks();
switchProduct('calendar');
setPhotos([samplePhoto(0), samplePhoto(1)]);
setDesign({ cal: { ...productDesign('calendar').cal, year: 2027, captions: ['A new year of small joys', 'Kites over the terrace', 'Holi colours'] } });

export const Year2027 = () => (
  <div className="panel" style={{ width: 420 }}>
    <CalendarFront />
  </div>
);
