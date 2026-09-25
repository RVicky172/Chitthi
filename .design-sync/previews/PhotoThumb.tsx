import { PhotoThumb, samplePhoto } from 'chitthi-postcard-studio';

// PhotoThumb draws a 116px square cover crop into a canvas (116x116 px unless CSS resizes the canvas).
const photos = [samplePhoto(0), samplePhoto(1), samplePhoto(2), samplePhoto(3)];

export const Strip = () => (
  <div style={{ display: 'flex', gap: 10 }}>
    {photos.map((p) => (
      <span key={p.id} style={{ borderRadius: 12, overflow: 'hidden', display: 'block', lineHeight: 0 }}>
        <PhotoThumb photo={p} />
      </span>
    ))}
  </div>
);

export const InPhotoRow = () => (
  <ul className="photos" style={{ width: 380 }}>
    <li className="photo">
      <PhotoThumb photo={photos[1]} />
      <div className="meta">
        <b>IMG_2041.jpg</b>
        <span>
          4032×3024 px, <span className="q good">sharp in print (512 dpi)</span>
        </span>
      </div>
    </li>
  </ul>
);
