import { PaneIcon } from 'chitthi-postcard-studio';

const STEPS = [
  ['photos', 'Photos'],
  ['layout', 'Layout'],
  ['occasion', 'Occasion'],
  ['words', 'Front'],
  ['back', 'Back'],
  ['print', 'Print'],
] as const;

// One line icon per studio step; 24x24, currentColor.
export const AllSteps = () => (
  <div style={{ display: 'flex', gap: 18, color: 'var(--text)', flexWrap: 'wrap' }}>
    {STEPS.map(([id, label]) => (
      <div key={id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--muted)' }}>
        <span style={{ width: 28, height: 28, display: 'inline-flex', color: 'var(--text)' }}>
          <PaneIcon id={id} />
        </span>
        {label}
      </div>
    ))}
  </div>
);

export const Accent = () => (
  <span style={{ width: 40, height: 40, display: 'inline-flex', color: 'var(--accent)' }}>
    <PaneIcon id="photos" />
  </span>
);
