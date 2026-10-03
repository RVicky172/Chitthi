import { SizeGuide, installFontLinks, productDesign, replaceCard } from 'chitthi-studio';

// Cards share one browser storage: start from a clean, known state before setting this card up.
localStorage.clear();
indexedDB.deleteDatabase('chitthi');
replaceCard(productDesign('postcard'), [], null);
installFontLinks();

export const SizesAndLayouts = () => (
  <div style={{ height: 1500, overflow: 'hidden' }}>
    <SizeGuide />
  </div>
);
