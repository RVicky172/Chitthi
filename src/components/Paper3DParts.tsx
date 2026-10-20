// Parts of the paper sizes page (Paper3D): a piece on the mat, the camera buttons, the list of pieces and the
// selected piece's numbers.
import type { CSSProperties } from 'react';
import { PRINT_SPECS } from '../data/printSpecs';
import { envelopeSpec } from '../engine/envelope';
import { nup } from '../engine/printPages';
import {
  area,
  BLEED,
  GAP,
  groupOf,
  GROUPS,
  r1,
  reduced,
  type GroupId,
  type Mode,
  type Piece,
  type Placed,
  type SheetId,
} from './paper3dScene';
import { clampZoom, VIEWS, type Camera } from './useMatCamera';

/**
 * Millimetres in inches, to one decimal.
 * @param mm the length
 * @returns inches
 */
const inch = (mm: number) => r1(mm / 25.4);

/**
 * Millimetres in pixels at 300 dpi.
 * @param mm the length
 * @returns pixels
 */
const px300 = (mm: number) => Math.round((mm / 25.4) * 300);

/**
 * A piece's size as text: "120 mm across" for a circle, else "148 × 105 mm".
 * @param piece the piece
 * @returns the size
 */
const sizeText = (piece: Piece) => (piece.circle ? `${r1(piece.w)} mm across` : `${r1(piece.w)} × ${r1(piece.h)} mm`);

/** A placed piece and how it is drawn. */
interface PieceViewProps {
  placed: Placed;
  /** Pixels per millimetre. */
  pxPerMM: number;
  mode: Mode;
  /** Its face (a drawn design), if shown and drawn. */
  face: string | undefined;
  showFaces: boolean;
  selected: boolean;
  hovered: boolean;
  onHover: (id: string | null) => void;
}

/**
 * A piece on the mat: its shadow, edge, face (or name) and, side by side, its label; lifted when selected or hovered.
 * @param props the placed piece, the scale, the mode, its face and its state
 */
export function PieceView({
  placed,
  pxPerMM,
  mode,
  face,
  showFaces,
  selected,
  hovered,
  onHover,
}: Readonly<PieceViewProps>) {
  const piece = placed.pc;
  const raised = selected || hovered ? 6 : 0;
  const radius = piece.circle ? '50%' : `${piece.corner * pxPerMM}px`;
  const turnedFace: CSSProperties | undefined = placed.rot
    ? {
        width: placed.h * pxPerMM,
        height: placed.w * pxPerMM,
        transform: `translate(-50%,-50%) rotate(90deg)`,
        left: '50%',
        top: '50%',
        position: 'absolute',
      }
    : undefined;
  const namedPlain = piece.group === 'sheet' || piece.group === 'ref' || !showFaces;
  return (
    <div
      data-pid={piece.id}
      className={`p3-piece g-${piece.group}${selected ? ' on' : ''}${hovered ? ' hov' : ''}`}
      style={{
        width: placed.w * pxPerMM,
        height: placed.h * pxPerMM,
        left: (placed.x - placed.w / 2) * pxPerMM,
        top: (placed.y - placed.h / 2) * pxPerMM,
        transform: `translateZ(${placed.z + raised}px)`,
        borderRadius: radius,
        ['--c' as string]: groupOf(piece.group).colour,
        transition: reduced() ? 'none' : undefined,
      }}
      onPointerEnter={() => onHover(piece.id)}
      onPointerLeave={() => onHover(null)}
    >
      <div
        className="p3-shadow"
        style={{ borderRadius: radius, transform: `translateZ(${-placed.z - raised + 0.5}px)` }}
      />
      <div className="p3-edge" style={{ borderRadius: radius }} />
      <div className="p3-face" style={{ borderRadius: radius }}>
        {face ? (
          <img src={face} alt="" draggable={false} style={turnedFace} />
        ) : (
          <span className="p3-plain" style={{ fontSize: Math.max(6, Math.min(placed.w, placed.h) * pxPerMM * 0.12) }}>
            {namedPlain ? piece.name : ''}
          </span>
        )}
      </div>
      {mode === 'side' && (
        <span
          className="p3-label"
          style={{
            top: placed.h * pxPerMM + 2 * pxPerMM,
            width: (placed.w + GAP * 0.8) * pxPerMM,
            fontSize: Math.max(7, 3.6 * pxPerMM),
          }}
        >
          {piece.name}
          <small>{sizeText(piece)}</small>
        </span>
      )}
    </div>
  );
}

/** The camera and what the buttons do. */
interface CameraBarProps {
  cam: Camera;
  tilt: number;
  spin: number;
  actual: boolean;
  setCamAnim: (change: Partial<Camera>) => void;
  onActual: () => void;
  onReset: () => void;
}

/**
 * The camera buttons: top, angled and low views, zoom out and in, actual size and reset.
 * @param props the camera, its state and the actions
 */
export function CameraBar({ cam, tilt, spin, actual, setCamAnim, onActual, onReset }: Readonly<CameraBarProps>) {
  return (
    <div className="p3-cam" role="group" aria-label="Camera">
      <button
        type="button"
        className="btn ghost"
        aria-pressed={!actual && tilt === VIEWS.top.tilt && spin === 0}
        onClick={() => setCamAnim(VIEWS.top)}
      >
        Top
      </button>
      <button type="button" className="btn ghost" onClick={() => setCamAnim(VIEWS.angled)}>
        Angled
      </button>
      <button type="button" className="btn ghost" onClick={() => setCamAnim(VIEWS.low)}>
        Low
      </button>
      <button
        type="button"
        className="btn ghost"
        onClick={() => setCamAnim({ zoom: Math.max(0.3, cam.zoom / 1.25) })}
        aria-label="Zoom out"
      >
        −
      </button>
      <button
        type="button"
        className="btn ghost"
        onClick={() => setCamAnim({ zoom: clampZoom(cam.zoom * 1.25) })}
        aria-label="Zoom in"
      >
        +
      </button>
      <button
        type="button"
        className="btn ghost"
        aria-pressed={actual}
        title="Top view at 1 mm = 1 mm on a typical screen: hold a card up to check"
        onClick={onActual}
      >
        Actual size
      </button>
      <button type="button" className="btn ghost" onClick={onReset}>
        Reset
      </button>
    </div>
  );
}

/** The pieces and which of them show. */
interface PieceListProps {
  pieces: Piece[];
  shownCount: number;
  groups: Set<GroupId>;
  hidden: Set<string>;
  selected: string | null;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}

/**
 * The pieces in view, by group: a box to show or hide each, and its name to select it.
 * @param props the pieces, the groups shown, the hidden pieces, the selection and the actions
 */
export function PieceList({
  pieces,
  shownCount,
  groups,
  hidden,
  selected,
  onToggle,
  onSelect,
  onHover,
}: Readonly<PieceListProps>) {
  return (
    <details className="p3-list" open>
      <summary>
        In view <small>{shownCount}</small>
      </summary>
      {GROUPS.filter(([group]) => groups.has(group)).map(([group, name, colour]) => (
        <div key={group} className="p3-lgrp">
          <h3>
            <i className="p3-dot" style={{ background: colour }} />
            {name}
          </h3>
          <ul>
            {pieces
              .filter((piece) => piece.group === group)
              .map((piece) => (
                <li
                  key={piece.id}
                  className={piece.id === selected ? 'on' : undefined}
                  onPointerEnter={() => onHover(piece.id)}
                  onPointerLeave={() => onHover(null)}
                >
                  <input
                    type="checkbox"
                    aria-label={`Show ${piece.name}`}
                    checked={!hidden.has(piece.id)}
                    onChange={() => onToggle(piece.id)}
                  />
                  <button type="button" className="linkbtn" onClick={() => onSelect(piece.id)}>
                    {piece.name}
                  </button>
                  <small>{piece.circle ? `${r1(piece.w)} mm` : `${r1(piece.w)} × ${r1(piece.h)}`}</small>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </details>
  );
}

/**
 * The paper a piece is printed on: its product's, or the envelope stock.
 * @param piece the piece
 * @returns the stock and weight, or null
 */
function specFor(piece: Piece) {
  if (piece.design && piece.group !== 'envelope') return PRINT_SPECS[piece.design.product];
  return piece.group === 'envelope' ? PRINT_SPECS.envelope : null;
}

/** The selected piece and its actions. */
interface DetailsProps {
  pc: Piece;
  onDesign: (piece: Piece) => void;
  onSheet: () => void;
}

/**
 * The selected piece's numbers: size, bleed, pixels, paper, sheets and envelope.
 * @param props the piece and its actions
 */
export function Details({ pc, onDesign, onSheet }: Readonly<DetailsProps>) {
  const { name, colour } = groupOf(pc.group);
  const design = pc.group === 'envelope' ? undefined : pc.design,
    spec = specFor(pc);
  const per = (sheet: SheetId) => {
    if (!design) return 0;
    const layout = nup({ ...design, exp: { ...design.exp, sheet } });
    return layout.cols * layout.rows;
  };
  const envelope = design ? envelopeSpec(design) : null;
  return (
    <div className="p3-det" style={{ ['--c' as string]: colour }}>
      <p className="p3-grp">
        <i className="p3-dot" style={{ background: colour }} />
        {name}
        {pc.tag && <em>{pc.tag}</em>}
      </p>
      <h2>{pc.name}</h2>
      <ul className="sg-facts">
        <li>
          <span className="text-label">Size</span> {sizeText(pc)} ({inch(pc.w)}
          {pc.circle ? '' : ` × ${inch(pc.h)}`} in)
        </li>
        <li>
          <span className="text-label">Compared</span> {area(pc)}
        </li>
        {envelope && (
          <>
            <li>
              <span className="text-label">File with bleed</span> {r1(pc.w + 2 * BLEED)} × {r1(pc.h + 2 * BLEED)} mm,{' '}
              {px300(pc.w + 2 * BLEED).toLocaleString()} × {px300(pc.h + 2 * BLEED).toLocaleString()} px at 300 dpi
            </li>
            <li>
              <span className="text-label">Per sheet</span> {per('a4') || '–'} on A4 · {per('a3') || '–'} on A3 · {per('1319') || '–'} on 13×19 in
            </li>
            <li>
              <span className="text-label">Envelope</span> {envelope.name} ({envelope.w} × {envelope.h} mm)
            </li>
          </>
        )}
        {pc.fits && (
          <li>
            <span className="text-label">Holds</span> {pc.fits.join(', ')}
          </li>
        )}
        {spec && (
          <li>
            <span className="text-label">Paper</span> {spec.stock}, {spec.weight}
          </li>
        )}
        {pc.note && <li>{pc.note}</li>}
      </ul>
      {design && (
        <div className="p3-acts">
          <button type="button" className="btn primary" onClick={() => onDesign(pc)}>
            Design at this size
          </button>
          <button type="button" className="btn ghost" onClick={onSheet}>
            See it on a print sheet
          </button>
        </div>
      )}
    </div>
  );
}
