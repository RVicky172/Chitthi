import { ProductIcon } from 'chitthi-postcard-studio';

const PRODUCTS = [
  ['postcard', 'Postcard'],
  ['calendar', 'Calendar'],
  ['frame', 'Photo frame'],
] as const;

// One icon per product (the header switcher and landing cards use them); Lucide, currentColor.
export const AllProducts = () => (
  <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
    {PRODUCTS.map(([id, label]) => (
      <div key={id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--muted)' }}>
        <span style={{ width: 28, height: 28, display: 'inline-flex', color: 'var(--text)' }}>
          <ProductIcon id={id} />
        </span>
        {label}
      </div>
    ))}
  </div>
);

export const InSwitcherBadge = () => (
  <span style={{ display: 'inline-grid', placeItems: 'center', width: 40, height: 40, borderRadius: 12, background: 'var(--accent-soft)', color: 'var(--accent)' }}>
    <span style={{ width: 20, height: 20, display: 'inline-flex' }}>
      <ProductIcon id="calendar" />
    </span>
  </span>
);
