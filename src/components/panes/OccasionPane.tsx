import { TH, themeById } from '../../data/themes';
import { applyTheme, setOccasion } from '../../state/actions';
import { setDesign, setPlain, setUI, useApp } from '../../state/store';
import type { ThemeGroup } from '../../types';
import { ThemeTile } from '../canvases';
import { Check, Pane, Seg } from '../common';
import { FoldSection } from '../panel';

/** The Occasion pane: the occasion themes, or a plain card with its own colours. */
export function OccasionPane() {
  const design = useApp((state) => state.design),
    fontTick = useApp((state) => state.ui.fontTick);
  const theme = themeById(design.themeId);
  return (
    <Pane
      title="Occasion"
      lead="Occasions add colours, artwork and ready-made wishes. Turn it off for a plain card."
      next="front of card"
      onNext={() => setUI({ pane: 'words' })}
    >
      <label className="switch">
        <input type="checkbox" checked={design.useOccasion} onChange={(event) => setOccasion(event.target.checked)} />
        <span className="track" />
        <span>
          <span className="text-label">Add an occasion</span>
          <small>{design.useOccasion ? `Using ${theme.name}` : 'Off: plain card with your own colours'}</small>
        </span>
      </label>
      {design.useOccasion ? (
        <FoldSection id="occasion.themes" title="Occasions" note={theme.name}>
          <div>
            <Seg<ThemeGroup>
              label="Occasion type"
              value={design.group}
              options={[
                ['Festivals', 'Festivals'],
                ['Birthdays', 'Birthdays'],
                ['Seasons', 'Seasons'],
              ]}
              onChange={(group) => setDesign({ group })}
            />
          </div>
          <div className="grid">
            {TH.filter((candidate) => candidate.g === design.group).map((occasion) => (
              <button
                key={occasion.id}
                type="button"
                className="tile theme"
                aria-pressed={occasion.id === design.themeId}
                onClick={() => applyTheme(occasion.id)}
              >
                <ThemeTile theme={occasion} fontTick={fontTick} />
                <span>{occasion.name}</span>
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
            <Check checked={design.artwork} onChange={(artwork) => setDesign({ artwork })}>
              Show occasion artwork on the background
            </Check>
            <Check checked={design.decor} onChange={(decor) => setDesign({ decor })}>
              {theme.name} decorations over full-size photos
            </Check>
          </div>
        </FoldSection>
      ) : (
        <FoldSection id="occasion.plain" title="Plain card colours">
          <div className="inline" style={{ marginTop: 10 }}>
            {(['bg', 'ink', 'accent'] as const).map((role) => (
              <label key={role} className="f">
                {{ bg: 'Background', ink: 'Text', accent: 'Accent' }[role]}
                <input
                  type="color"
                  value={design.plain[role]}
                  onChange={(event) => setPlain({ [role]: event.target.value })}
                />
              </label>
            ))}
          </div>
          <div style={{ marginTop: 8 }}>
            <Check checked={design.plain.gradient} onChange={(gradient) => setPlain({ gradient })}>
              Soft gradient
            </Check>
          </div>
        </FoldSection>
      )}
    </Pane>
  );
}
