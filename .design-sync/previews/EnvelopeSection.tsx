import { EnvelopeSection, applyTheme, installFontLinks, productDesign, replaceCard, samplePhoto, setBack, setPhotos } from 'chitthi-postcard-studio';

// Cards share one browser storage: start from a clean, known state before setting this card up.
localStorage.clear();
indexedDB.deleteDatabase('chitthi');
replaceCard(productDesign('postcard'), [], null);
installFontLinks();
applyTheme('diwali');
setPhotos([samplePhoto(2)]);
setBack({ to: 'Nani', address: '12 Gandhi Road\nJaipur', pin: '302001', from: 'Meera' });

export const DiwaliEnvelope = () => (
  <div className="panel" style={{ width: 420 }}>
    <EnvelopeSection />
  </div>
);
