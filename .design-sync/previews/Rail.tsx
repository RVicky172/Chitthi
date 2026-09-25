import { Rail, productDesign, replaceCard, setUI } from 'chitthi-postcard-studio';

// Cards share one browser storage: start from a clean, known state before setting this card up.
localStorage.clear();
indexedDB.deleteDatabase('chitthi');
replaceCard(productDesign('postcard'), [], null);
// Steps before ui.pane show as done (check marks), the current one is filled.
setUI({ pane: 'words' });

// Rail is the studio's 88px left column; below 860px wide it turns into a horizontal strip.
export const OnFrontStep = () => (
  <div style={{ width: 88, height: 600, display: 'flex' }}>
    <Rail />
  </div>
);
