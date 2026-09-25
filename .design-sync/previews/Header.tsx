import { Header, productDesign, replaceCard, switchProduct } from 'chitthi-postcard-studio';

// Cards share one browser storage: start from a clean, known state before setting this card up.
localStorage.clear();
indexedDB.deleteDatabase('chitthi');
replaceCard(productDesign('postcard'), [], null);
// The product switcher reflects design.product.
switchProduct('calendar');

export const CalendarStudio = () => (
  <div style={{ width: 1180 }}>
    <Header />
  </div>
);
