import { OccasionPane, applyTheme, installFontLinks, productDesign, replaceCard } from 'chitthi-postcard-studio';

// Cards share one browser storage: start from a clean, known state before setting this card up.
localStorage.clear();
indexedDB.deleteDatabase('chitthi');
replaceCard(productDesign('postcard'), [], null);
installFontLinks();
applyTheme('diwali');

export const Festivals = () => (
  <div className="panel" style={{ width: 420 }}>
    <OccasionPane />
  </div>
);
