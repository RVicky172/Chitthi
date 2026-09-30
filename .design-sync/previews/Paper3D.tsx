import { Paper3D, installFontLinks, productDesign, replaceCard } from 'chitthi-postcard-studio';

// Cards share one browser storage: start from a clean, known state before setting this card up.
localStorage.clear();
indexedDB.deleteDatabase('chitthi');
replaceCard(productDesign('postcard'), [], null);
installFontLinks();

export const PaperSizesIn3D = () => (
  <div style={{ height: 900, display: 'flex', flexDirection: 'column' }}>
    <Paper3D />
  </div>
);
