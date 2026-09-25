import { LayoutThumb, installFontLinks, productDesign, samplePhoto, themeById } from 'chitthi-postcard-studio';

installFontLinks();
const photos = [samplePhoto(0), samplePhoto(1), samplePhoto(2), samplePhoto(3)];
const t = themeById('diwali');
const postcard = { ...productDesign('postcard'), heading: t.heads[0], quote: t.quotes[0], headFont: t.hf, quoteFont: t.qf };
const frame = { ...productDesign('frame'), frame: 'cream' as const };
const calendar = productDesign('calendar');

const grid = (d: typeof postcard, items: [string, string][], selected: string) => (
  <div className="grid" style={{ width: 400 }}>
    {items.map(([id, name]) => (
      <button key={id} type="button" className="tile layout" aria-pressed={id === selected}>
        <div className="cv">
          <LayoutThumb layout={id as never} design={d} photos={photos} fontTick={0} />
        </div>
        <span>{name}</span>
      </button>
    ))}
  </div>
);

export const Postcards = () =>
  grid(postcard, [['full', 'Full photo'], ['arch', 'Jharokha arch'], ['polaroid', 'Polaroid'], ['stamp', 'Postage stamp'], ['collage3', 'Three photos'], ['collage4', 'Four photos']], 'arch');
export const PhotoFrames = () =>
  grid(frame, [['frame-single', 'Single photo'], ['frame-duo', 'Pair'], ['frame-grid', 'Grid of four']], 'frame-single');
export const Calendars = () =>
  grid(calendar, [['cal-top', 'Photo above'], ['cal-full', 'Full photo'], ['cal-plain', 'Dates only']], 'cal-top');
