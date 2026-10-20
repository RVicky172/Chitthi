import { useMemo, useState } from 'react';
import { layoutsFor } from '../data/layouts';
import { PRODUCTS, productOf, sizesFor } from '../data/products';
import { SIZE_GROUPS } from '../data/sizes';
import { productDesign } from '../engine/design';
import { nup } from '../engine/printPages';
import { isOneOf } from '../engine/guards';
import { computeLayout } from '../engine/layout';
import { samplePhoto } from '../engine/sample';
import { downloadQuote, selectSize, switchProduct } from '../state/actions';
import { getState, setDesign, setUI, useApp } from '../state/store';
import type { Design, LayoutId, Orient, Photo, ProductId, SizeDef } from '../types';
import { LayoutThumb } from './canvases';
import { photoCount, Seg } from './common';
import { ProductIcon } from './icons';
import { SiteNav } from './SiteNav';

/*
 * The sizes guide (#/sizes): every size of every product with its trim, bleed, safe area, pixel sizes and how many
 * fit on a sheet, and every layout drawn at that size with the pixels each photo slot needs.
 */

const DPI = 300,
  BLEED = 3,
  SAFE = 4;
const px = (mm: number) => Math.round((mm / 25.4) * DPI);
const r1 = (value: number) => Math.round(value * 10) / 10;
const inch = (mm: number) => r1(mm / 25.4);

/**
 * A design of this product at this size, keeping the user's occasion so thumbnails look like their work.
 * @param product the product
 * @param size the size
 * @param orient the orientation
 * @param layout the layout, else the size's own
 * @returns the design
 */
function guideDesign(product: ProductId, size: SizeDef, orient: Orient, layout?: LayoutId): Design {
  const cur = getState().design,
    design = productDesign(product, cur);
  return {
    ...design,
    sizeId: size.id,
    orient,
    layout: layout ?? (size.instax ? 'instax' : design.layout),
    exp: { ...design.exp, bleed: String(BLEED), marks: true },
    cal: { ...design.cal, months: 12 },
  };
}

type ShapeFilter = 'all' | 'square-corner' | 'rounded' | 'round' | 'square';
type ScaleFilter = 'all' | 'small' | 'medium' | 'large';
type PhotosFilter = 'any' | '0' | '1' | '2' | '3';
type WordsFilter = 'any' | 'words' | 'photo';
const SHAPE_TEST: Record<ShapeFilter, (s: SizeDef) => boolean> = {
  all: () => true,
  'square-corner': (size) => !size.corner && !size.instax && size.shape !== 'circle',
  rounded: (size) => !!size.corner || !!size.instax,
  round: (size) => size.shape === 'circle',
  square: (size) => size.L === size.S,
};
/** By the long side: up to 100 mm, up to 250 mm, bigger. */
const SCALE_TEST: Record<ScaleFilter, (s: SizeDef) => boolean> = {
  all: () => true,
  small: (size) => size.L <= 100,
  medium: (size) => size.L > 100 && size.L <= 250,
  large: (size) => size.L > 250,
};

const trim = (size: SizeDef, orient: Orient) =>
  orient === 'landscape' ? { w: size.L, h: size.S } : { w: size.S, h: size.L };
const defaultOrient = (size: SizeDef, product: ProductId): Orient =>
  size.native ?? (product === 'calendar' || product === 'frame' ? 'portrait' : 'landscape');
const perSheet = (design: Design, sheet: Design['exp']['sheet']) => {
  const layout = nup({ ...design, exp: { ...design.exp, sheet } });
  return layout.cols * layout.rows;
};

/** The piece drawn to scale: bleed (red), trim (the card), safe area (blue), with its measurements. */
function SizeDiagram({ s, o }: Readonly<{ s: SizeDef; o: Orient }>) {
  const { w, h } = trim(s, o),
    bledWidth = w + 2 * BLEED,
    bledHeight = h + 2 * BLEED,
    scale = 200 / Math.max(bledWidth, bledHeight),
    round = s.shape === 'circle',
    rx = (s.corner ?? (s.instax ? 3 : 0)) * scale;
  const box = (inset: number) => ({
    x: 30 + (BLEED + inset) * scale,
    y: 18 + (BLEED + inset) * scale,
    width: (w - 2 * inset) * scale,
    height: (h - 2 * inset) * scale,
  });
  const trimBox = box(0),
    sf = box(SAFE);
  return (
    <svg
      className="sg-diagram"
      viewBox={`0 0 ${bledWidth * scale + 60} ${bledHeight * scale + 50}`}
      role="img"
      aria-label={`${r1(w)} by ${r1(h)} mm, drawn with bleed and safe area`}
    >
      <rect
        x={30}
        y={18}
        width={bledWidth * scale}
        height={bledHeight * scale}
        className="bleed"
        rx={round ? (bledWidth * scale) / 2 : 0}
      />
      {round ? (
        <>
          <circle
            cx={trimBox.x + trimBox.width / 2}
            cy={trimBox.y + trimBox.height / 2}
            r={trimBox.width / 2}
            className="trim"
          />
          <circle
            cx={trimBox.x + trimBox.width / 2}
            cy={trimBox.y + trimBox.height / 2}
            r={sf.width / 2}
            className="safe"
          />
        </>
      ) : (
        <>
          <rect {...trimBox} rx={rx} className="trim" />
          <rect {...sf} className="safe" />
        </>
      )}
      <text x={30 + (bledWidth * scale) / 2} y={bledHeight * scale + 38} textAnchor="middle">
        {r1(w)} mm
      </text>
      <text
        x={16}
        y={18 + (bledHeight * scale) / 2}
        textAnchor="middle"
        transform={`rotate(-90 16 ${18 + (bledHeight * scale) / 2})`}
      >
        {r1(h)} mm
      </text>
    </svg>
  );
}

/**
 * Pixels each photo slot needs for a sharp print, grouped when several slots share a size.
 * @param design the design
 * @param id the layout
 * @param width the trim width, mm
 * @param height the trim height, mm
 * @returns the needs as text
 */
function slotNeeds(design: Design, id: LayoutId, width: number, height: number): string {
  const computed = computeLayout(id, { x: 0, y: 0, w: width, h: height, e: 0 }, { ...design, layout: id });
  if (!computed.slots.length) return 'No photo: words and artwork only';
  const groups = new Map<string, number>();
  for (const sl of computed.slots) {
    const key = `${px(sl.w).toLocaleString()} × ${px(sl.h).toLocaleString()} px`;
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  return [...groups].map(([need, count]) => (count > 1 ? `${count} × ${need}` : need)).join(', ');
}

const PRODUCT_IDS: ProductId[] = PRODUCTS.map((productDef) => productDef.id);

/**
 * The size shown: the one picked, else the most popular among those filtered, else the first.
 * @param all every size of the product
 * @param sizes the sizes the filters leave
 * @param sizeId the size picked, if any
 * @returns the size
 */
function pickSize(all: SizeDef[], sizes: SizeDef[], sizeId: string | null): SizeDef {
  const size =
    all.find((candidate) => candidate.id === sizeId) ??
    sizes.find((candidate) => candidate.tag === 'Most popular') ??
    sizes.at(0) ??
    all.at(0);
  if (!size) throw new Error('A product has no sizes.');
  return size;
}

/**
 * A size's shape in the table: round, its corners, or square corners.
 * @param size the size
 * @returns the text
 */
function shapeText(size: SizeDef): string {
  if (size.shape === 'circle') return 'Round';
  return size.corner || size.instax ? `${size.corner ?? 3} mm corners` : 'Square corners';
}

/**
 * Whether a size matches the search.
 * @param size the size
 * @param query what was typed
 * @returns true when nothing was typed or the size's name, inches, tag or millimetres contain it
 */
function matchesQuery(size: SizeDef, query: string): boolean {
  const wanted = query.trim().toLowerCase();
  if (!wanted) return true;
  return `${size.name} ${size.inch ?? ''} ${size.tag ?? ''} ${Math.round(size.S)}×${Math.round(size.L)}`
    .toLowerCase()
    .includes(wanted);
}

/** The terms the guide uses: trim, bleed, safe area and dpi. */
function GuideTerms() {
  return (
    <dl className="sg-terms">
      <div>
        <dt>
          <i className="k-trim" /> Trim
        </dt>
        <dd>The finished size after cutting. This is the size you order.</dd>
      </div>
      <div>
        <dt>
          <i className="k-bleed" /> Bleed ({BLEED} mm)
        </dt>
        <dd>Extra picture around the edge that is cut off, so no white slivers show if the cut is slightly off.</dd>
      </div>
      <div>
        <dt>
          <i className="k-safe" /> Safe area ({SAFE} mm in)
        </dt>
        <dd>Keep faces and words inside it: anything outside may be trimmed.</dd>
      </div>
      <div>
        <dt>{DPI} dpi</dt>
        <dd>Print resolution. Pixels = millimetres ÷ 25.4 × {DPI}. Photos with fewer pixels print softer.</dd>
      </div>
    </dl>
  );
}

/** A row of filter chips. */
interface ChipsProps<Value extends string> {
  options: [Value, string][];
  value: Value;
  onChange: (value: Value) => void;
}

/**
 * Filter chips: one pressed among the options.
 * @param props the options, the value and its change handler
 */
function Chips<Value extends string>({ options, value, onChange }: Readonly<ChipsProps<Value>>) {
  return (
    <div className="chips">
      {options.map(([key, label]) => (
        <button key={key} type="button" className="chip" aria-pressed={value === key} onClick={() => onChange(key)}>
          {label}
        </button>
      ))}
    </div>
  );
}

const SHAPE_OPTIONS: [ShapeFilter, string][] = [
  ['all', 'Any shape'],
  ['square-corner', 'Square corners'],
  ['rounded', 'Rounded corners'],
  ['round', 'Round'],
  ['square', 'Square format'],
];
const SCALE_OPTIONS: [ScaleFilter, string][] = [
  ['all', 'Any size'],
  ['small', 'Small (up to 10 cm)'],
  ['medium', 'Medium (10–25 cm)'],
  ['large', 'Large (over 25 cm)'],
];
const PHOTOS_OPTIONS: [PhotosFilter, string][] = [
  ['any', 'Any number of photos'],
  ['0', 'No photo'],
  ['1', '1 photo'],
  ['2', '2 photos'],
  ['3', '3 or more'],
];
const WORDS_OPTIONS: [WordsFilter, string][] = [
  ['any', 'With or without words'],
  ['words', 'With words'],
  ['photo', 'Photos only'],
];

/** The size table's rows and what picking one does. */
interface SizeTableProps {
  product: ProductId;
  sizes: SizeDef[];
  selectedId: string;
  onPick: (id: string) => void;
}

/**
 * The sizes in a table by group: trim, bleed, pixels, per sheet and shape.
 * @param props the product, the sizes, the selected size and picking one
 */
function SizeTable({ product, sizes, selectedId, onPick }: Readonly<SizeTableProps>) {
  const prod = productOf(product);
  return (
    <div className="sg-tablewrap">
      <table className="sg-table">
        <caption className="vh">{prod.name} sizes</caption>
        <thead>
          <tr>
            <th scope="col">Size</th>
            <th scope="col">Trim</th>
            <th scope="col">With bleed</th>
            <th scope="col">Pixels at {DPI} dpi</th>
            <th scope="col">Per A4 / A3 sheet</th>
            <th scope="col">Shape</th>
          </tr>
        </thead>
        {SIZE_GROUPS.filter((group) => sizes.some((candidate) => candidate.grp === group)).map((group) => (
          <tbody key={group}>
            <tr className="sg-grp">
              <th colSpan={6} scope="rowgroup">
                {group}
              </th>
            </tr>
            {sizes
              .filter((candidate) => candidate.grp === group)
              .map((sizeDef) => {
                const sizeOrient = defaultOrient(sizeDef, product),
                  trimmed = trim(sizeDef, sizeOrient),
                  sizeDesign = guideDesign(product, sizeDef, sizeOrient);
                return (
                  <tr key={sizeDef.id} aria-selected={sizeDef.id === selectedId} onClick={() => onPick(sizeDef.id)}>
                    <th scope="row">
                      <button type="button" className="linkbtn" onClick={() => onPick(sizeDef.id)}>
                        {sizeDef.name}
                      </button>
                      {sizeDef.tag && <em>{sizeDef.tag}</em>}
                    </th>
                    <td>
                      {r1(trimmed.w)} × {r1(trimmed.h)} mm
                      <small>{sizeDef.inch ?? `${inch(trimmed.w)} × ${inch(trimmed.h)} in`}</small>
                    </td>
                    <td>
                      {r1(trimmed.w + 2 * BLEED)} × {r1(trimmed.h + 2 * BLEED)} mm
                    </td>
                    <td>
                      {px(trimmed.w + 2 * BLEED).toLocaleString()} × {px(trimmed.h + 2 * BLEED).toLocaleString()}
                    </td>
                    <td>
                      {perSheet(sizeDesign, 'a4') || '–'} / {perSheet(sizeDesign, 'a3') || '–'}
                    </td>
                    <td>{shapeText(sizeDef)}</td>
                  </tr>
                );
              })}
          </tbody>
        ))}
      </table>
    </div>
  );
}

const SHEET_NAMES = [
  ['a4', 'A4'],
  ['a3', 'A3'],
  ['1319', '13×19 in'],
] as const;

/** The selected size and how it is drawn. */
interface SizeDetailProps {
  product: ProductId;
  size: SizeDef;
  orient: Orient;
  square: boolean;
  design: Design;
  onOrient: (orient: Orient) => void;
}

/**
 * The selected size: its diagram (with the orientation switch) and its numbers.
 * @param props the product, the size, its orientation and design, and changing the orientation
 */
function SizeDetail({ product, size, orient, square, design, onOrient }: Readonly<SizeDetailProps>) {
  const { w, h } = trim(size, orient);
  return (
    <section className="sg-detail" aria-labelledby="sgSize">
      <div className="sg-fig">
        <SizeDiagram s={size} o={orient} />
        {!square && (
          <Seg<Orient>
            label="Orientation"
            value={orient}
            options={[
              ['landscape', 'Horizontal'],
              ['portrait', 'Vertical'],
            ]}
            onChange={onOrient}
          />
        )}
      </div>
      <div>
        <h2 id="sgSize">
          {size.name} <small>{productOf(product).name}</small>
        </h2>
        <ul className="sg-facts">
          <li>
            <span className="text-label">Trim</span> {r1(w)} × {r1(h)} mm ({inch(w)} × {inch(h)} in)
          </li>
          <li>
            <span className="text-label">File with bleed</span> {r1(w + 2 * BLEED)} × {r1(h + 2 * BLEED)} mm, {px(w + 2 * BLEED).toLocaleString()} ×{' '}
            {px(h + 2 * BLEED).toLocaleString()} px
          </li>
          <li>
            <span className="text-label">Safe area</span> {r1(w - 2 * SAFE)} × {r1(h - 2 * SAFE)} mm
          </li>
          <li>
            <span className="text-label">Full-bleed photo</span> at least {px(w + 2 * BLEED).toLocaleString()} × {px(h + 2 * BLEED).toLocaleString()}{' '}
            px for a sharp print
          </li>
          <li>
            <span className="text-label">On a sheet</span>{' '}
            {SHEET_NAMES.map(([id, name]) => {
              const count = perSheet(design, id);
              return count ? `${count} per ${name}` : `doesn’t fit on ${name}`;
            }).join(', ')}
          </li>
          {size.instax && <li>Instax-style: the photo window is fixed, so this size uses the Instax frame layout.</li>}
          {size.shape === 'circle' && <li>Round: the bleed wraps around the edge of a button badge.</li>}
        </ul>
      </div>
    </section>
  );
}

/** The layouts to draw and what is needed to draw them. */
interface LayoutGridProps {
  layouts: readonly (readonly [LayoutId, string, ...unknown[]])[];
  design: Design;
  width: number;
  height: number;
  thumbPhotos: Photo[];
  fontTick: number;
  onUse: (layout: LayoutId) => void;
}

/**
 * Every layout drawn at the size, with its photo count and the pixels each slot needs.
 * @param props the layouts, the design, the trim size, the photos to draw, the font tick and using one
 */
function LayoutGrid({ layouts, design, width, height, thumbPhotos, fontTick, onUse }: Readonly<LayoutGridProps>) {
  return (
    <ul className="sg-layouts">
      {layouts.map(([id, name]) => {
        const layoutDesign = { ...design, layout: id };
        const count = computeLayout(id, { x: 0, y: 0, w: width, h: height, e: 0 }, layoutDesign).slots.length;
        return (
          <li key={id} className="sg-layout">
            <div className="cv">
              <LayoutThumb layout={id} design={layoutDesign} photos={thumbPhotos} fontTick={fontTick} />
            </div>
            <span className="text-label">{name}</span>
            <small className="count">{photoCount(count)}</small>
            <small className="need">{slotNeeds(layoutDesign, id, width, height)}</small>
            <button type="button" className="sbtn accent" onClick={() => onUse(id)}>
              Use this
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Whether a layout passes the photo-count and words filters.
 * @param layout the layout
 * @param design the design at this size
 * @param width the trim width
 * @param height the trim height
 * @param photos the photo-count filter
 * @param words the words filter
 * @returns true when it passes both
 */
function layoutMatches(
  layout: LayoutId,
  design: Design,
  width: number,
  height: number,
  photos: PhotosFilter,
  words: WordsFilter,
): boolean {
  const computed = computeLayout(layout, { x: 0, y: 0, w: width, h: height, e: 0 }, { ...design, layout }),
    slots = computed.slots.length;
  if (photos !== 'any' && (photos === '3' ? slots < 3 : slots !== +photos)) return false;
  const hasWords = !!computed.text || !!computed.arc || !!computed.calGrid || !!computed.calYear;
  if (words === 'any') return true;
  return words === 'words' ? hasWords : !hasWords;
}

/** The sizes guide page: products, size filters and table, the selected size, and its layouts. */
export function SizeGuide() {
  const current = useApp((state) => state.design.product),
    fontTick = useApp((state) => state.ui.fontTick),
    photos = useApp((state) => state.photos);
  const fromHash = /^#\/sizes\/(postcard|calendar|frame|magnet)\b/.exec(location.hash)?.[1];
  const [product, setProduct] = useState<ProductId>(isOneOf(PRODUCT_IDS, fromHash) ? fromHash : current);
  const all = useMemo(() => sizesFor(product).filter((candidate) => candidate.id !== 'custom'), [product]);
  const [shapeF, setShapeF] = useState<ShapeFilter>('all'),
    [scaleF, setScaleF] = useState<ScaleFilter>('all'),
    [query, setQuery] = useState(''),
    [photosF, setPhotosF] = useState<PhotosFilter>('any'),
    [wordsF, setWordsF] = useState<WordsFilter>('any');
  const sizes = useMemo(
    () =>
      all.filter(
        (candidate) => SHAPE_TEST[shapeF](candidate) && SCALE_TEST[scaleF](candidate) && matchesQuery(candidate, query),
      ),
    [all, shapeF, scaleF, query],
  );
  const [sizeId, setSizeId] = useState<string | null>(null);
  // Memoised (not for speed) so the compiler treats the size as fixed for the design below.
  const size = useMemo(() => pickSize(all, sizes, sizeId), [all, sizes, sizeId]);
  const [orientPick, setOrient] = useState<Orient | null>(null);
  const square = size.L === size.S;
  const orient = square ? 'portrait' : (orientPick ?? defaultOrient(size, product));
  const design = useMemo(() => guideDesign(product, size, orient), [product, size, orient]);
  // Your own photos when you have some, painted stand-ins otherwise.
  const thumbPhotos = useMemo(
    () => (photos.length ? photos : [0, 1, 2, 3].map((index) => samplePhoto(index))),
    [photos],
  );
  const { w, h } = trim(size, orient);
  const layoutsAll = size.instax ? layoutsFor(product).filter(([id]) => id === 'instax') : layoutsFor(product);
  const layouts = layoutsAll.filter(([id]) => layoutMatches(id, design, w, h, photosF, wordsF));
  const prod = productOf(product);
  const orientWord = orient === 'landscape' ? 'horizontal' : 'vertical';

  const use = (layout: LayoutId) => {
    switchProduct(product);
    selectSize(size);
    if (!size.instax) setDesign({ orient, layout });
    setUI({ screen: 'studio', pane: 'layout', side: 'front', slot: 0, calPage: 0 });
  };
  const chooseProduct = (next: ProductId) => {
    setProduct(next);
    setSizeId(null);
    setOrient(null);
    setShapeF('all');
    setScaleF('all');
    setPhotosF('any');
  };

  return (
    <div className="landing sg">
      <SiteNav
        current="sizes"
        actions={[
          { key: 'spec', label: 'Specification PDF for printers', onSelect: () => void downloadQuote('catalog') },
        ]}
      />
      <main>
        <header className="sg-head">
          <h1>Sizes and layouts</h1>
          <p className="lsec-sub">
            Every size Chitthi prints, what the numbers mean, and how each layout sits on it. Pick a product, then a
            size, to see its layouts drawn at that size.
          </p>
          <GuideTerms />
        </header>

        <div className="sg-products">
          <Seg<ProductId>
            label="Product"
            value={product}
            options={PRODUCTS.map((productDef) => [
              productDef.id,
              productDef.name,
              <ProductIcon key={productDef.id} id={productDef.id} />,
            ])}
            onChange={chooseProduct}
          />
        </div>
        <div className="sg-filters" role="group" aria-label="Filter sizes">
          <Chips
            options={SHAPE_OPTIONS.filter(([shape]) => shape === 'all' || all.some(SHAPE_TEST[shape]))}
            value={shapeF}
            onChange={setShapeF}
          />
          <Chips
            options={SCALE_OPTIONS.filter(([scale]) => scale === 'all' || all.some(SCALE_TEST[scale]))}
            value={scaleF}
            onChange={setScaleF}
          />
          <input
            type="search"
            aria-label="Search sizes"
            placeholder="Search, e.g. A4 or 5×7"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <p className="hint sg-paper">
          <span className="text-label">{prod.name}:</span> {prod.blurb} Paper: {prod.paper}
        </p>

        <SizeTable
          product={product}
          sizes={sizes}
          selectedId={size.id}
          onPick={(id) => {
            setSizeId(id);
            setOrient(null);
          }}
        />
        {!sizes.length && (
          <p className="hint">
            No {prod.name.toLowerCase()} size matches these filters.{' '}
            <button
              type="button"
              className="linkbtn"
              onClick={() => {
                setShapeF('all');
                setScaleF('all');
                setQuery('');
              }}
            >
              Clear filters
            </button>
          </p>
        )}
        <p className="hint">
          Custom sizes from 40 to 420 mm are available in the studio. Sheet counts include {BLEED} mm bleed and room for
          crop marks.
        </p>

        <SizeDetail
          product={product}
          size={size}
          orient={orient}
          square={square}
          design={design}
          onOrient={setOrient}
        />

        <h2 className="sg-h2">
          {layouts.length} of {layoutsAll.length} layout{layoutsAll.length > 1 ? 's' : ''} at {size.name},{' '}
          {square ? 'square' : orientWord}
        </h2>
        <div className="sg-filters" role="group" aria-label="Filter layouts">
          <Chips options={PHOTOS_OPTIONS} value={photosF} onChange={setPhotosF} />
          <Chips options={WORDS_OPTIONS} value={wordsF} onChange={setWordsF} />
        </div>
        {!layouts.length && <p className="hint">No layout at this size matches these filters.</p>}
        <LayoutGrid
          layouts={layouts}
          design={design}
          width={w}
          height={h}
          thumbPhotos={thumbPhotos}
          fontTick={fontTick}
          onUse={use}
        />
      </main>
    </div>
  );
}
