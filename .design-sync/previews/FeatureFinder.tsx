import { FeatureFinder, installFontLinks, productDesign, replaceCard, setUI } from 'chitthi-postcard-studio';

// Cards share one browser storage: start from a clean, known state before setting this card up.
localStorage.clear();
indexedDB.deleteDatabase('chitthi');
replaceCard(productDesign('postcard'), [], null);
installFontLinks();
setUI({ finder: true });

export const FindAFeature = () => <FeatureFinder />;
