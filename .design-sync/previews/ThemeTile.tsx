import { ThemeTile, installFontLinks, themeById } from 'chitthi-postcard-studio';

installFontLinks();

const pick = (ids: string[], selected: string) => (
  <div className="grid" style={{ width: 400 }}>
    {ids.map((id) => {
      const t = themeById(id);
      return (
        <button key={id} type="button" className="tile theme" aria-pressed={id === selected}>
          <ThemeTile theme={t} fontTick={0} />
          <span>{t.name}</span>
        </button>
      );
    })}
  </div>
);

export const Festivals = () => pick(['diwali', 'holi', 'rakhi', 'eid', 'navratri', 'christmas'], 'diwali');
export const Seasons = () => pick(['spring', 'summer', 'monsoon', 'winter'], 'monsoon');
