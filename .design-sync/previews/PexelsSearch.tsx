import { PexelsSearch, applyTheme, installFontLinks, productDesign, replaceCard } from 'chitthi-studio';

// Cards share one browser storage: start from a clean, known state before setting this card up.
localStorage.clear();
indexedDB.deleteDatabase('chitthi');
replaceCard(productDesign('postcard'), [], null);
installFontLinks();
applyTheme('diwali');

// Without the user's Pexels key it explains where to add it (searching needs the key and the network).
export const NoKeyYet = () => (
  <div className="panel" style={{ width: 420 }}>
    <PexelsSearch />
  </div>
);
