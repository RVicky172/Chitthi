import { BackPane, installFontLinks, setBack, productDesign, replaceCard } from 'chitthi-postcard-studio';

// Cards share one browser storage: start from a clean, known state before setting this card up.
localStorage.clear();
indexedDB.deleteDatabase('chitthi');
replaceCard(productDesign('postcard'), [], null);
installFontLinks();
setBack({
  message: 'Dear Nani,\nHappy Diwali from all of us in Pune! The house smells of your besan laddoo recipe.',
  from: 'Meera',
  to: 'Mrs. Kamala Iyer',
  address: '14, Temple Street\nMylapore, Chennai\nTamil Nadu',
  pin: '600004',
});

export const PostcardBack = () => (
  <div className="panel" style={{ width: 420 }}>
    <BackPane />
  </div>
);
