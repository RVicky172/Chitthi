import { useRef, useState, type KeyboardEvent } from 'react';
import { layoutsFor } from '../data/layouts';
import { PRODUCTS, productOf, sizesFor } from '../data/products';
import type { ShowcaseImage } from '../data/showcase';
import { SIZES } from '../data/sizes';
import type { ProductId, SizeDef } from '../types';
import { ProductIcon } from './icons';

/*
 * The landing page's two hands-on sections. Both read the app's own data (products, sizes, layouts, the showcase
 * renders), so what the page shows is what the studio makes.
 */

const mm = (value: number) => `${+value.toFixed(2)}`;
const px = (millimetres: number) => Math.round((millimetres / 25.4) * 300);

/** Arrow keys between the product tabs. */
const TAB_STEPS: Partial<Record<string, number>> = { ArrowRight: 1, ArrowLeft: -1 };

/**
 * Four products as tabs: pick one to see its real examples, sizes and layouts. Arrow keys move between tabs.
 * @param props the showcase renders and opening a product in the studio
 */
export function ProductExplorer({ shots, open }: Readonly<{ shots: ShowcaseImage[]; open: (p: ProductId) => void }>) {
  const [id, setId] = useState<ProductId>('postcard');
  const [pick, setPick] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const product = productOf(id);
  const examples = shots.filter((shot) => shot.render === 'front' && shot.product === id);
  const big = examples.at(Math.min(pick, examples.length - 1));
  const sizes = sizesFor(id).filter((size) => size.id !== 'custom');
  const layouts = layoutsFor(id).length;

  const choose = (next: ProductId) => {
    setId(next);
    setPick(0);
  };
  const onKey = (event: KeyboardEvent, index: number) => {
    const step = TAB_STEPS[event.key] ?? 0;
    if (!step) return;
    event.preventDefault();
    const next = (index + step + PRODUCTS.length) % PRODUCTS.length,
      nextProduct = PRODUCTS.at(next);
    if (nextProduct) choose(nextProduct.id);
    tabs.current.at(next)?.focus();
  };

  return (
    <div className="ld-explore">
      <div className="ld-tabs" role="tablist" aria-label="Products">
        {PRODUCTS.map((tab, index) => (
          <button
            key={tab.id}
            ref={(el) => {
              tabs.current[index] = el;
            }}
            type="button"
            role="tab"
            id={`ld-tab-${tab.id}`}
            aria-selected={tab.id === id}
            aria-controls="ld-tabpanel"
            tabIndex={tab.id === id ? 0 : -1}
            onClick={() => choose(tab.id)}
            onKeyDown={(event) => onKey(event, index)}
          >
            <ProductIcon id={tab.id} />
            {tab.name}
          </button>
        ))}
      </div>
      <div className="ld-panel" role="tabpanel" id="ld-tabpanel" aria-labelledby={`ld-tab-${id}`}>
        <div className="ld-panel-art">
          {big && (
            <span className="trim" key={big.id}>
              <img
                src={big.src}
                width={big.w}
                height={big.h}
                alt={`${big.title}: a ${product.name.toLowerCase()} made with Chitthi`}
                loading="lazy"
                decoding="async"
              />
            </span>
          )}
          {examples.length > 1 && (
            <div className="ld-thumbs" role="group" aria-label={`${product.name} examples`}>
              {examples.map((shot, index) => (
                <button
                  key={shot.id}
                  type="button"
                  aria-pressed={shot === big}
                  aria-label={shot.title}
                  onClick={() => setPick(index)}
                >
                  <img src={shot.src} alt="" loading="lazy" decoding="async" />
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
            {sizes.slice(0, 5).map((size) => (
              <li key={size.id}>
                <span>{size.name}</span>
                <span>
                  {mm(size.L)} × {mm(size.S)} mm
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

const POSTCARDS = SIZES.filter((size) => size.grp === 'Postcards');
const BLEEDS = [
  { label: '3 mm', mm: 3 },
  { label: '⅛ in', mm: 3.175 },
  { label: '5 mm', mm: 5 },
];
/** The safe area sits 4 mm inside the trim (see the sizes guide). */
const SAFE = 4;
/** One scale for every size: the drawing area fits the largest postcard with the largest bleed, plus crop marks. */
const VW = Math.max(...POSTCARDS.map((size) => size.L)) + 2 * 5 + 24,
  VH = Math.max(...POSTCARDS.map((size) => size.S)) + 2 * 5 + 24;

/**
 * A postcard size by id, else the first.
 * @param id the size's id
 * @returns the size
 */
function postcardSize(id: string): SizeDef {
  const size = POSTCARDS.find((candidate) => candidate.id === id) ?? POSTCARDS.at(0);
  if (!size) throw new Error('There are no postcard sizes.');
  return size;
}

/**
 * A postcard size drawn to scale: bleed, trim and safe area, the pixels needed at 300 dpi, and the print pack those
 * choices produce. The numbers are worked out here exactly as the export does.
 */
export function PrintReady() {
  const [sizeId, setSizeId] = useState('4x6');
  const [bleed, setBleed] = useState(3);
  const size = postcardSize(sizeId);
  const width = size.L,
    height = size.S,
    dw = width + 2 * bleed,
    dh = height + 2 * bleed;
  const slug = `chitthi-diwali-${size.id}`;
  const spec = [
    ['Trim (final) size', `${mm(width)} × ${mm(height)} mm`],
    ['Bleed', `${BLEEDS.find((option) => option.mm === bleed)?.label} on every edge`],
    ['Document size', `${mm(dw)} × ${mm(dh)} mm`],
    ['Safe area', `${mm(width - 2 * SAFE)} × ${mm(height - 2 * SAFE)} mm`],
    ['Resolution', `300 dpi → ${px(dw)} × ${px(dh)} px`],
  ];

  return (
    <div className="ld-ready">
      <div className="ld-ready-controls">
        <div className="ld-ctl">
          <span id="ld-size-l">Postcard size</span>
          <div className="ld-size-chips" role="group" aria-labelledby="ld-size-l">
            {POSTCARDS.map((postcard) => (
              <button
                key={postcard.id}
                type="button"
                className="chip"
                aria-pressed={postcard.id === sizeId}
                onClick={() => setSizeId(postcard.id)}
              >
                {postcard.name}
              </button>
            ))}
          </div>
        </div>
        <div className="ld-ctl">
          <span id="ld-bleed-l">Bleed</span>
          <div className="seg" role="group" aria-labelledby="ld-bleed-l">
            {BLEEDS.map((option) => (
              <button
                key={option.label}
                type="button"
                aria-pressed={option.mm === bleed}
                onClick={() => setBleed(option.mm)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <figure className="ld-sheet">
        <svg
          viewBox={`0 0 ${VW} ${VH}`}
          role="img"
          aria-label={`${size.name}, drawn to scale: ${spec.map((row) => row.join(' ')).join(', ')}`}
        >
          <g transform={`translate(${(VW - dw) / 2} ${(VH - dh) / 2})`}>
            <rect className="s-bleed" x="0" y="0" width={dw} height={dh} />
            <rect className="s-trim" x={bleed} y={bleed} width={width} height={height} />
            <rect className="s-photo" x={bleed} y={bleed} width={width * 0.56} height={height} />
            <rect
              className="s-safe"
              x={bleed + SAFE}
              y={bleed + SAFE}
              width={width - 2 * SAFE}
              height={height - 2 * SAFE}
            />
            {[0.3, 0.42, 0.54].map((share, index) => (
              <rect
                key={share}
                className="s-line"
                x={bleed + width * 0.62}
                y={bleed + height * share}
                width={width * (index === 0 ? 0.3 : 0.24)}
                height={height * 0.035}
              />
            ))}
            {/* crop marks at the trim corners, outside the bleed */}
            {(
              [
                [bleed, bleed],
                [bleed + width, bleed],
                [bleed, bleed + height],
                [bleed + width, bleed + height],
              ] satisfies [number, number][]
            ).map(([x, y]) => (
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
          {spec.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
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
