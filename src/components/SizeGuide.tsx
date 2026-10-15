import { useMemo, useState } from 'react';
import { layoutsFor } from '../data/layouts';
import { PRODUCTS, productOf, sizesFor } from '../data/products';
import { SIZE_GROUPS } from '../data/sizes';
import { productDesign } from '../engine/design';
import { nup } from '../engine/printPages';
import { computeLayout } from '../engine/layout';
import { samplePhoto } from '../engine/sample';
import { downloadQuote, selectSize, switchProduct } from '../state/actions';
import { getState, setDesign, setUI, useApp } from '../state/store';
import type { Design, LayoutId, Orient, ProductId, SizeDef } from '../types';
import { LayoutThumb } from './canvases';
import { Seg } from './common';
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

/** A design of this product at this size, keeping the user's occasion so thumbnails look like their work. */
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
function SizeDiagram({ s, o }: { s: SizeDef; o: Orient }) {
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

/** Pixels each photo slot needs for a sharp print, grouped when several slots share a size. */
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

export function SizeGuide() {
  const current = useApp((state) => state.design.product),
    fontTick = useApp((state) => state.ui.fontTick),
    photos = useApp((state) => state.photos);
  const fromHash = /^#\/sizes\/(postcard|calendar|frame|magnet)\b/.exec(location.hash)?.[1] as ProductId | undefined;
  const [product, setProduct] = useState<ProductId>(fromHash ?? current);
  const all = sizesFor(product).filter((candidate) => candidate.id !== 'custom');
  const [shapeF, setShapeF] = useState<ShapeFilter>('all'),
    [scaleF, setScaleF] = useState<ScaleFilter>('all'),
    [query, setQuery] = useState(''),
    [photosF, setPhotosF] = useState<PhotosFilter>('any'),
    [wordsF, setWordsF] = useState<'any' | 'words' | 'photo'>('any');
  const sizes = all.filter(
    (candidate) =>
      SHAPE_TEST[shapeF](candidate) &&
      SCALE_TEST[scaleF](candidate) &&
      (!query.trim() ||
        `${candidate.name} ${candidate.inch ?? ''} ${candidate.tag ?? ''} ${Math.round(candidate.S)}×${Math.round(candidate.L)}`
          .toLowerCase()
          .includes(query.trim().toLowerCase())),
  );
  const [sizeId, setSizeId] = useState<string | null>(null);
  const size =
    all.find((candidate) => candidate.id === sizeId) ??
    sizes.find((candidate) => candidate.tag === 'Most popular') ??
    sizes[0] ??
    all[0];
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
  const layouts = layoutsAll.filter(([id]) => {
    const computed = computeLayout(id, { x: 0, y: 0, w, h, e: 0 }, { ...design, layout: id }),
      slots = computed.slots.length;
    if (photosF !== 'any' && (photosF === '3' ? slots < 3 : slots !== +photosF)) return false;
    const words = !!computed.text || !!computed.arc || !!computed.calGrid || !!computed.calYear;
    return wordsF === 'any' || (wordsF === 'words' ? words : !words);
  });
  const prod = productOf(product);

  const use = (layout: LayoutId) => {
    switchProduct(product);
    selectSize(size);
    if (!size.instax) setDesign({ orient, layout });
    setUI({ screen: 'studio', pane: 'layout', side: 'front', slot: 0, calPage: 0 });
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
              <dd>
                Extra picture around the edge that is cut off, so no white slivers show if the cut is slightly off.
              </dd>
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
            onChange={(next) => {
              setProduct(next);
              setSizeId(null);
              setOrient(null);
              setShapeF('all');
              setScaleF('all');
              setPhotosF('any');
            }}
          />
        </div>
        <div className="sg-filters" role="group" aria-label="Filter sizes">
          <div className="chips">
            {(
              [
                ['all', 'Any shape'],
                ['square-corner', 'Square corners'],
                ['rounded', 'Rounded corners'],
                ['round', 'Round'],
                ['square', 'Square format'],
              ] as [ShapeFilter, string][]
            )
              .filter(([shape]) => shape === 'all' || all.some(SHAPE_TEST[shape]))
              .map(([shape, label]) => (
                <button
                  key={shape}
                  type="button"
                  className="chip"
                  aria-pressed={shapeF === shape}
                  onClick={() => setShapeF(shape)}
                >
                  {label}
                </button>
              ))}
          </div>
          <div className="chips">
            {(
              [
                ['all', 'Any size'],
                ['small', 'Small (up to 10 cm)'],
                ['medium', 'Medium (10–25 cm)'],
                ['large', 'Large (over 25 cm)'],
              ] as [ScaleFilter, string][]
            )
              .filter(([scale]) => scale === 'all' || all.some(SCALE_TEST[scale]))
              .map(([scale, label]) => (
                <button
                  key={scale}
                  type="button"
                  className="chip"
                  aria-pressed={scaleF === scale}
                  onClick={() => setScaleF(scale)}
                >
                  {label}
                </button>
              ))}
          </div>
          <input
            type="search"
            aria-label="Search sizes"
            placeholder="Search, e.g. A4 or 5×7"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <p className="hint sg-paper">
          <b>{prod.name}:</b> {prod.blurb} Paper: {prod.paper}
        </p>

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
                      sd = guideDesign(product, sizeDef, sizeOrient);
                    return (
                      <tr
                        key={sizeDef.id}
                        aria-selected={sizeDef.id === size.id}
                        onClick={() => (setSizeId(sizeDef.id), setOrient(null))}
                      >
                        <th scope="row">
                          <button
                            type="button"
                            className="linkbtn"
                            onClick={() => (setSizeId(sizeDef.id), setOrient(null))}
                          >
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
                          {perSheet(sd, 'a4') || '–'} / {perSheet(sd, 'a3') || '–'}
                        </td>
                        <td>
                          {sizeDef.shape === 'circle'
                            ? 'Round'
                            : sizeDef.corner || sizeDef.instax
                              ? `${sizeDef.corner ?? 3} mm corners`
                              : 'Square corners'}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            ))}
          </table>
        </div>
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
                onChange={setOrient}
              />
            )}
          </div>
          <div>
            <h2 id="sgSize">
              {size.name} <small>{prod.name}</small>
            </h2>
            <ul className="sg-facts">
              <li>
                <b>Trim</b> {r1(w)} × {r1(h)} mm ({inch(w)} × {inch(h)} in)
              </li>
              <li>
                <b>File with bleed</b> {r1(w + 2 * BLEED)} × {r1(h + 2 * BLEED)} mm,{' '}
                {px(w + 2 * BLEED).toLocaleString()} × {px(h + 2 * BLEED).toLocaleString()} px
              </li>
              <li>
                <b>Safe area</b> {r1(w - 2 * SAFE)} × {r1(h - 2 * SAFE)} mm
              </li>
              <li>
                <b>Full-bleed photo</b> at least {px(w + 2 * BLEED).toLocaleString()} ×{' '}
                {px(h + 2 * BLEED).toLocaleString()} px for a sharp print
              </li>
              <li>
                <b>On a sheet</b>{' '}
                {(
                  [
                    ['a4', 'A4'],
                    ['a3', 'A3'],
                    ['1319', '13×19 in'],
                  ] as const
                )
                  .map(([id, name]) => {
                    const count = perSheet(design, id);
                    return count ? `${count} per ${name}` : `doesn’t fit on ${name}`;
                  })
                  .join(', ')}
              </li>
              {size.instax && (
                <li>Instax-style: the photo window is fixed, so this size uses the Instax frame layout.</li>
              )}
              {size.shape === 'circle' && <li>Round: the bleed wraps around the edge of a button badge.</li>}
            </ul>
          </div>
        </section>

        <h2 className="sg-h2">
          {layouts.length} of {layoutsAll.length} layout{layoutsAll.length > 1 ? 's' : ''} at {size.name},{' '}
          {square ? 'square' : orient === 'landscape' ? 'horizontal' : 'vertical'}
        </h2>
        <div className="sg-filters" role="group" aria-label="Filter layouts">
          <div className="chips">
            {(
              [
                ['any', 'Any number of photos'],
                ['0', 'No photo'],
                ['1', '1 photo'],
                ['2', '2 photos'],
                ['3', '3 or more'],
              ] as [PhotosFilter, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className="chip"
                aria-pressed={photosF === key}
                onClick={() => setPhotosF(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="chips">
            {(
              [
                ['any', 'With or without words'],
                ['words', 'With words'],
                ['photo', 'Photos only'],
              ] as ['any' | 'words' | 'photo', string][]
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className="chip"
                aria-pressed={wordsF === key}
                onClick={() => setWordsF(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {!layouts.length && <p className="hint">No layout at this size matches these filters.</p>}
        <ul className="sg-layouts">
          {layouts.map(([id, name]) => {
            const ld = { ...design, layout: id };
            const count = computeLayout(id, { x: 0, y: 0, w, h, e: 0 }, ld).slots.length;
            return (
              <li key={id} className="sg-layout">
                <div className="cv">
                  <LayoutThumb layout={id} design={ld} photos={thumbPhotos} fontTick={fontTick} />
                </div>
                <b>{name}</b>
                <small className="count">
                  {count === 0 ? 'No photo' : count === 1 ? '1 photo' : `${count} photos`}
                </small>
                <small className="need">{slotNeeds(ld, id, w, h)}</small>
                <button type="button" className="sbtn accent" onClick={() => use(id)}>
                  Use this
                </button>
              </li>
            );
          })}
        </ul>
      </main>
    </div>
  );
}
