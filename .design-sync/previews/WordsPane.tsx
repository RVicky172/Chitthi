import { WordsPane, applyTheme, installFontLinks, setDesign, productDesign, replaceCard } from 'chitthi-postcard-studio';

// Cards share one browser storage: start from a clean, known state before setting this card up.
localStorage.clear();
indexedDB.deleteDatabase('chitthi');
replaceCard(productDesign('postcard'), [], null);
installFontLinks();
applyTheme('diwali');
setDesign({ insta: 'meera.clicks', sig: 'With love, Meera' });

export const DiwaliFront = () => (
  <div className="panel" style={{ width: 420 }}>
    <WordsPane />
  </div>
);
