import { Viewer3D, applyTheme, installFontLinks, open3D, productDesign, replaceCard, samplePhoto, setDesign, setPhotos } from 'chitthi-postcard-studio';

// Cards share one browser storage: start from a clean, known state before setting this card up.
localStorage.clear();
indexedDB.deleteDatabase('chitthi');
replaceCard(productDesign('postcard'), [], null);
installFontLinks();
applyTheme('diwali');
setDesign({ insta: 'meera.clicks' });
setPhotos([samplePhoto(0)]);
// open3D() renders both faces of the current card and opens the viewer.
void open3D();

export const DiwaliCard = () => <Viewer3D />;
