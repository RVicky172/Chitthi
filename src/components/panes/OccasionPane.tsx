import { TH, themeById } from '../../data/themes';
import { applyTheme, setOccasion } from '../../state/actions';
import { setDesign, setPlain, setUI, useApp } from '../../state/store';
import type { ThemeGroup } from '../../types';
import { ThemeTile } from '../canvases';
import { Check, Pane, Section, Seg } from '../common';

export function OccasionPane() {
  const d = useApp((s) => s.design),
    fontTick = useApp((s) => s.ui.fontTick);
  const theme = themeById(d.themeId);
  return (
    <Pane
      title="Occasion"
      lead="Occasions add colours, artwork and ready-made wishes. Turn it off for a plain card."
      next="front of card"
      onNext={() => setUI({ pane: 'words' })}
    >
      <label className="switch">
        <input type="checkbox" checked={d.useOccasion} onChange={(e) => setOccasion(e.target.checked)} />
        <span className="track" />
        <span>
          <b>Add an occasion</b>
          <small>{d.useOccasion ? `Using ${theme.name}` : 'Off: plain card with your own colours'}</small>
        </span>
      </label>
      {d.useOccasion ? (
        <Section id="occasion.themes" title="Occasions" note={theme.name}>
          <div>
            <Seg<ThemeGroup>
              label="Occasion type"
              value={d.group}
              options={[
                ['Festivals', 'Festivals'],
                ['Birthdays', 'Birthdays'],
                ['Seasons', 'Seasons'],
              ]}
              onChange={(group) => setDesign({ group })}
            />
          </div>
          <div className="grid">
            {TH.filter((t) => t.g === d.group).map((t) => (
              <button
                key={t.id}
                type="button"
                className="tile theme"
                aria-pressed={t.id === d.themeId}
                onClick={() => applyTheme(t.id)}
              >
                <ThemeTile theme={t} fontTick={fontTick} />
                <span>{t.name}</span>
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
            <Check checked={d.artwork} onChange={(artwork) => setDesign({ artwork })}>
              Show occasion artwork on the background
            </Check>
            <Check checked={d.decor} onChange={(decor) => setDesign({ decor })}>
              {theme.name} decorations over full-size photos
            </Check>
          </div>
        </Section>
      ) : (
        <Section id="occasion.plain" title="Plain card colours">
          <div className="inline" style={{ marginTop: 10 }}>
            {(['bg', 'ink', 'accent'] as const).map((k) => (
              <label key={k} className="f">
                {{ bg: 'Background', ink: 'Text', accent: 'Accent' }[k]}
                <input type="color" value={d.plain[k]} onChange={(e) => setPlain({ [k]: e.target.value })} />
              </label>
            ))}
          </div>
          <div style={{ marginTop: 8 }}>
            <Check checked={d.plain.gradient} onChange={(gradient) => setPlain({ gradient })}>
              Soft gradient
            </Check>
          </div>
        </Section>
      )}
    </Pane>
  );
}
