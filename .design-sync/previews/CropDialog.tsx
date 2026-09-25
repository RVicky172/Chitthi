import { CropDialog, productDesign, replaceCard, samplePhoto, setPhotos, setUI } from 'chitthi-postcard-studio';

// Cards share one browser storage: start from a clean, known state before setting this card up.
localStorage.clear();
indexedDB.deleteDatabase('chitthi');
replaceCard(productDesign('postcard'), [], null);

// The cropper edits a photo's original image, so give it a photo with one.
const photo = samplePhoto(0, 1200, 860);
setPhotos([photo]);
setUI({ cropId: photo.id });

export const Cropping = () => <CropDialog />;
