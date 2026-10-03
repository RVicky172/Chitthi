import { useRef, useState, type KeyboardEvent } from 'react';
import { layoutsFor } from '../data/layouts';
import { PRODUCTS, sizesFor } from '../data/products';
import type { ShowcaseImage } from '../data/showcase';
import { SIZES } from '../data/sizes';
import type { ProductId } from '../types';
import { ProductIcon } from './icons';

/*
 * The landing page's two hands-on sections. Both read the app's own data (products, sizes, layouts, the showcase
 * renders), so what the page shows is what the studio makes.
 */

const mm = (n: number) => `${+n.toFixed(2)}`;
const px = (n: number) => Math.round((n / 25.4) * 300);

/** Four products as tabs: pick one to see its real examples, sizes and layouts. Arrow keys move between tabs. */
export function ProductExplorer({ shots, open }: { shots: ShowcaseImage[]; open: (p: ProductId) => void }) {
  const [id, setId] = useState<ProductId>('postcard');
  const [pick, setPick] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const product = PRODUCTS.find((p) => p.id === id)!;
  const examples = shots.filter((s) => s.render === 'front' && s.product === id);
  const big = examples[Math.min(pick, examples.length - 1)];
  const sizes = sizesFor(id).filter((s) => s.id !== 'custom');
  const layouts = layoutsFor(id).length;

  const choose = (next: ProductId) => {
    setId(next);
    setPick(0);
  };
  const onKey = (e: KeyboardEvent, i: number) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const n = (i + step + PRODUCTS.length) % PRODUCTS.length;
    choose(PRODUCTS[n].id);
    tabs.current[n]?.focus();
  };

  return (
    <div className="ld-explore">
      <div className="ld-tabs" role="tablist" aria-label="Products">
        {PRODUCTS.map((p, i) => (
          <button
            key={p.id}
            ref={(el) => {
              tabs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`ld-tab-${p.id}`}
            aria-selected={p.id === id}
            aria-controls="ld-tabpanel"
            tabIndex={p.id === id ? 0 : -1}
            onClick={() => choose(p.id)}
            onKeyDown={(e) => onKey(e, i)}
          >
            <ProductIcon id={p.id} />
            {p.name}
          </button>
        ))}
      </div>
      <div className="ld-panel" role="tabpanel" id="ld-tabpanel" aria-labelledby={`ld-tab-${id}`}>
        <div className="ld-panel-art">
          {big && (
            <span className="trim" key={big.id}>
              <img src={big.src} width={big.w} height={big.h} alt={`${big.title}: a ${product.name.toLowerCase()} made with Chitthi`} loading="lazy" decoding="async" />
            </span>
          )}
          {examples.length > 1 && (
            <div className="ld-thumbs" role="group" aria-label={`${product.name} examples`}>
              {examples.map((s, i) => (
                <button key={s.id} type="button" aria-pressed={s === big} aria-label={s.title} onClick={() => setPick(i)}>
                  <img src={s.src} alt="" loading="lazy" decoding="async" />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="ld-panel-info">
          <h3>{product.name}</h3>
          <p>{product.blurb}</p>
          <dl className="ld-specs">
            <div>
              <dt>{sizes.length}</dt>
              <dd>print sizes</dd>
            </div>
            <div>
              <dt>{layouts}</dt>
              <dd>layouts</dd>
            </div>
            <div>
              <dt>{big ? big.title : '—'}</dt>
              <dd>example shown</dd>
            </div>
          </dl>
          <ul className="ld-size-list" aria-label={`Some ${product.name.toLowerCase()} sizes`}>
            {sizes.slice(0, 5).map((s) => (
              <li key={s.id}>
                <span>{s.name}</span>
                <span>
                  {mm(s.L)} × {mm(s.S)} mm
                </span>
              </li>
            ))}
          </ul>
          <div className="ld-panel-acts">
            <button type="button" className="btn primary big" onClick={() => open(id)}>
              Design a {product.name.toLowerCase()}
            </button>
            <a className="ld-link" href={`#/sizes/${id}`}>
              Compare all {sizes.length} sizes
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

const POSTCARDS = SIZES.filter((s) => s.grp === 'Postcards');
const BLEEDS = [
  { label: '3 mm', mm: 3 },
  { label: '⅛ in', mm: 3.175 },
  { label: '5 mm', mm: 5 },
];
/** The safe area sits 4 mm inside the trim (see the sizes guide). */
const SAFE = 4;
/** One scale for every size: the drawing area fits the largest postcard with the largest bleed, plus crop marks. */
const VW = Math.max(...POSTCARDS.map((s) => s.L)) + 2 * 5 + 24,
  VH = Math.max(...POSTCARDS.map((s) => s.S)) + 2 * 5 + 24;

/**
 * A postcard size drawn to scale: bleed, trim and safe area, the pixels needed at 300 dpi, and the print pack those
 * choices produce. The numbers are worked out here exactly as the export does.
 */
export function PrintReady() {
  const [sizeId, setSizeId] = useState('4x6');
  const [bleed, setBleed] = useState(3);
  const size = POSTCARDS.find((s) => s.id === sizeId) ?? POSTCARDS[0];
  const W = size.L,
    H = size.S,
    dw = W + 2 * bleed,
    dh = H + 2 * bleed;
  const slug = `chitthi-diwali-${size.id}`;
  const spec = [
    ['Trim (final) size', `${mm(W)} × ${mm(H)} mm`],
    ['Bleed', `${BLEEDS.find((b) => b.mm === bleed)?.label} on every edge`],
    ['Document size', `${mm(dw)} × ${mm(dh)} mm`],
    ['Safe area', `${mm(W - 2 * SAFE)} × ${mm(H - 2 * SAFE)} mm`],
    ['Resolution', `300 dpi → ${px(dw)} × ${px(dh)} px`],
  ];

  return (
    <div className="ld-ready">
      <div className="ld-ready-controls">
        <div className="ld-ctl">
          <span id="ld-size-l">Postcard size</span>
          <div className="ld-size-chips" role="group" aria-labelledby="ld-size-l">
            {POSTCARDS.map((s) => (
              <button key={s.id} type="button" className="chip" aria-pressed={s.id === sizeId} onClick={() => setSizeId(s.id)}>
                {s.name}
              </button>
            ))}
          </div>
        </div>
        <div className="ld-ctl">
          <span id="ld-bleed-l">Bleed</span>
          <div className="seg" role="group" aria-labelledby="ld-bleed-l">
            {BLEEDS.map((b) => (
              <button key={b.label} type="button" aria-pressed={b.mm === bleed} onClick={() => setBleed(b.mm)}>
                {b.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <figure className="ld-sheet">
        <svg viewBox={`0 0 ${VW} ${VH}`} role="img" aria-label={`${size.name}, drawn to scale: ${spec.map((r) => r.join(' ')).join(', ')}`}>
          <g transform={`translate(${(VW - dw) / 2} ${(VH - dh) / 2})`}>
          <rect className="s-bleed" x="0" y="0" width={dw} height={dh} />
          <rect className="s-trim" x={bleed} y={bleed} width={W} height={H} />
          <rect className="s-photo" x={bleed} y={bleed} width={W * 0.56} height={H} />
          <rect className="s-safe" x={bleed + SAFE} y={bleed + SAFE} width={W - 2 * SAFE} height={H - 2 * SAFE} />
          {[0.3, 0.42, 0.54].map((f) => (
            <rect key={f} className="s-line" x={bleed + W * 0.62} y={bleed + H * f} width={W * (f === 0.3 ? 0.3 : 0.24)} height={H * 0.035} />
          ))}
          {/* crop marks at the trim corners, outside the bleed */}
          {[
            [bleed, bleed],
            [bleed + W, bleed],
            [bleed, bleed + H],
            [bleed + W, bleed + H],
          ].map(([x, y]) => (
            <g key={`${x}-${y}`} className="s-crop">
              <line x1={x} x2={x} y1={y < dh / 2 ? -10 : dh + 2} y2={y < dh / 2 ? -2 : dh + 10} />
              <line y1={y} y2={y} x1={x < dw / 2 ? -10 : dw + 2} x2={x < dw / 2 ? -2 : dw + 10} />
            </g>
          ))}
          </g>
        </svg>
        <figcaption>
          <span>
            <i className="k-bleed" /> Bleed, cut away
          </span>
          <span>
            <i className="k-trim" /> Trim, the finished card
          </span>
          <span>
            <i className="k-safe" /> Safe area for words and faces
          </span>
          <span>Every size on this page is drawn at the same scale.</span>
        </figcaption>
      </figure>

      <div className="ld-ready-out">
        <dl className="ld-spec">
          {spec.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <div className="files" aria-label="The print pack for this size">
          <p className="files-name">{slug}-print-pack.zip</p>
          <ul>
            <li className="dir">front/</li>
            <li>{slug}-front.png</li>
            <li className="dir">back/</li>
            <li>{slug}-back.png</li>
            <li>{slug}-print.pdf</li>
            <li className="dir">envelope/</li>
            <li>{slug}-envelope-print.pdf</li>
            <li>{slug}-envelope-template-a4.pdf</li>
            <li className="spec">{slug}-PRINT-SPEC.txt</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
