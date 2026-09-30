import { PhotoCredit } from 'chitthi-postcard-studio';

// The credit comes from the photo's name: Pexels photos and AI pictures carry it; your own photos show nothing.
export const PexelsPhoto = () => <PhotoCredit name="Diya lamps on a rangoli (Pexels / Asha Rao #5717396)" />;

export const AiPicture = () => <PhotoCredit name="Kites over Jaipur at dusk, watercolour (AI / OpenAI gpt-image-1)" />;

export const InAPhotoList = () => (
  <ul style={{ width: 380, display: 'grid', gap: 10, listStyle: 'none', padding: 0, margin: 0 }}>
    <li>
      <strong style={{ display: 'block', fontSize: 13 }}>Diya lamps on a rangoli</strong>
      <PhotoCredit name="Diya lamps on a rangoli (Pexels / Asha Rao #5717396)" />
    </li>
    <li>
      <strong style={{ display: 'block', fontSize: 13 }}>Kites over Jaipur at dusk</strong>
      <PhotoCredit name="Kites over Jaipur at dusk, watercolour (AI / OpenAI gpt-image-1)" />
    </li>
  </ul>
);
