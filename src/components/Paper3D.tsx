import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { SHEETS } from '../engine/printPages';
import { selectSize, switchProduct } from '../state/actions';
import { setDesign, setUI, useApp } from '../state/store';
import { Seg } from './common';
import {
  allPieces,
  drawnFace,
  faceOf,
  GROUPS,
  LABEL,
  MM_PX,
  onSheet,
  reduced,
  sideBySide,
  stacked,
  type GroupId,
  type Mode,
  type OrientPick,
  type Piece,
  type Scene,
  type SheetId,
} from './paper3dScene';
import { CameraBar, Details, PieceList, PieceView } from './Paper3DParts';
import { SiteNav } from './SiteNav';
import { useMatCamera, VIEWS } from './useMatCamera';

/*
 * Paper sizes in 3D (#/paper): every size Chitthi prints, laid on a cutting mat at true relative scale, with a real
 * design on each face. Three views: side by side, stacked (largest at the bottom), and one size imposed on a print
 * sheet exactly as the sheet PDF does it. Built with CSS 3D transforms like the rest of the app's 3D (no WebGL):
 * drag to orbit, scroll or pinch to zoom, arrow keys too, and an "actual size" top view.
 */

/**
 * A set with one member added or removed.
 * @param set the set
 * @param member the member
 * @returns a new set
 */
function toggled<T>(set: Set<T>, member: T): Set<T> {
  const next = new Set(set);
  if (next.has(member)) next.delete(member);
  else next.add(member);
  return next;
}

/**
 * Opens the print studio on a piece's product and size, at the Layout step.
 * @param piece the piece (only product pieces have a size and design)
 */
function designAt(piece: Piece): void {
  if (!piece.size || !piece.design) return;
  switchProduct(piece.design.product);
  selectSize(piece.size);
  if (!piece.size.instax) setDesign({ orient: piece.design.orient });
  setUI({ screen: 'studio', pane: 'layout', side: 'front', slot: 0, calPage: 0 });
}

/**
 * Draws the faces of a scene's pieces in the background, a few at a time, ticking as each arrives.
 * @param scene the arrangement
 * @param showFaces whether faces are shown
 * @param photosTick changes when fonts load (redraw)
 */
function useFaces(scene: Scene, showFaces: boolean, photosTick: number): void {
  const [, setFaceTick] = useState(0);
  useEffect(() => {
    if (!showFaces) return;
    const closed = new AbortController(),
      isClosed = () => closed.signal.aborted;
    void (async () => {
      const todo = [...new Map(scene.placed.map((placed) => [placed.pc.id, placed.pc])).values()].filter(
        (piece) => piece.design,
      );
      for (const piece of todo) {
        if (isClosed()) return;
        await faceOf(piece);
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (!isClosed()) setFaceTick((tick) => tick + 1);
      }
    })();
    return () => {
      closed.abort();
    };
  }, [scene, showFaces, photosTick]);
}

/** The view bar's choices. */
interface ViewBarProps {
  mode: Mode;
  onMode: (mode: Mode) => void;
  groups: Set<GroupId>;
  onToggleGroup: (group: GroupId) => void;
  sheet: SheetId;
  onSheet: (sheet: SheetId) => void;
  lift: number;
  onLift: (lift: number) => void;
}

/**
 * The bar above the mat: the view, the groups shown (or, on a sheet, the sheet and how high the pieces float).
 * @param props the choices and their handlers
 */
function ViewBar({ mode, onMode, groups, onToggleGroup, sheet, onSheet, lift, onLift }: Readonly<ViewBarProps>) {
  return (
    <div className="p3-bar">
      <Seg<Mode>
        label="View"
        value={mode}
        options={[
          ['side', 'Side by side'],
          ['stack', 'Stacked'],
          ['sheet', 'On a print sheet'],
        ]}
        onChange={onMode}
      />
      {mode !== 'sheet' && (
        <div className="chips" role="group" aria-label="Show">
          {GROUPS.map(([group, name, colour]) => (
            <button
              key={group}
              type="button"
              className="chip"
              aria-pressed={groups.has(group)}
              onClick={() => onToggleGroup(group)}
            >
              <i className="p3-dot" style={{ background: colour }} />
              {name}
            </button>
          ))}
        </div>
      )}
      {mode === 'sheet' && (
        <>
          <Seg<SheetId>
            label="Sheet"
            value={sheet}
            options={(Object.entries(SHEETS) as [SheetId, [number, number, string]][]).map(([id, entry]) => [
              id,
              entry[2],
            ])}
            onChange={onSheet}
          />
          <label className="f p3-lift">
            Lift the pieces
            <input type="range" min={0} max={140} value={lift} onChange={(event) => onLift(+event.target.value)} />
          </label>
        </>
      )}
    </div>
  );
}

/**
 * The sheet view's count line: how many fit, and sheets for 100.
 * @param props how many fit, the piece's name and the sheet
 */
function SheetCount({ count, name, sheet }: Readonly<{ count: number; name: string; sheet: SheetId }>) {
  return (
    <p className="p3-count">
      <b>{count || 'None'}</b> {name} per {SHEETS[sheet][2]} sheet
      {count ? `, ${Math.ceil(100 / count)} sheets for 100 pieces` : ' (too big for this sheet)'}
    </p>
  );
}

/** The paper sizes in 3D page: the view bar, the mat with its camera, the options and the selected piece's numbers. */
export function Paper3D() {
  const photosTick = useApp((state) => state.ui.fontTick);
  const [groups, setGroups] = useState<Set<GroupId>>(() => new Set<GroupId>(['postcard', 'sheet', 'ref']));
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(['sheet:letter', 'sheet:1319']));
  const [mode, setMode] = useState<Mode>('side');
  const [pick, setPick] = useState<OrientPick>('natural');
  const [showFaces, setShowFaces] = useState(true);
  const [sheet, setSheet] = useState<SheetId>('a4');
  const [lift, setLift] = useState(40);
  const [sel, setSel] = useState<string | null>('postcard:4x6');
  const [hover, setHover] = useState<string | null>(null);
  const [view, setView] = useState({ w: 900, h: 560 });
  const box = useRef<HTMLDivElement>(null);
  const camera = useMatCamera(box, setSel);
  const { cam, tilt, spin, actual, pan, setCamAnim } = camera;

  const pieces = useMemo(() => allPieces(pick), [pick]);
  const shown = pieces.filter((piece) => groups.has(piece.group) && !hidden.has(piece.id));
  const selected = pieces.find((piece) => piece.id === sel) ?? null;
  // The sheet view needs a product piece: the selected one, else the first product piece on show.
  const sheetPiece =
    selected?.design && selected.group !== 'envelope'
      ? selected
      : (shown.find((piece) => piece.design && piece.group !== 'envelope') ?? pieces.at(0));

  const scene = useMemo(() => {
    if (mode === 'sheet') return onSheet(sheetPiece, sheet, lift);
    return mode === 'stack' ? stacked(shown) : sideBySide(shown);
  }, [mode, shown.map((piece) => piece.id).join(), sheetPiece?.id, sheet, lift, pick]);
  useFaces(scene, showFaces, photosTick);

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setView({ w: element.clientWidth, h: element.clientHeight }));
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  // Pixels per millimetre: fit the arrangement (plus its mat) in the view, then the user's zoom.
  const fit = Math.min((view.w * 0.96) / (scene.w + 60), (view.h * 0.92) / (scene.h + 60));
  const pxPerMM = actual ? MM_PX : fit * cam.zoom;
  const worldStyle: CSSProperties = {
    transform: `translate(${pan.x}px, ${pan.y}px) rotateX(${tilt}deg) rotateZ(${spin}deg)`,
    transition: camera.anim ? 'transform .7s cubic-bezier(.2,.7,.2,1)' : 'none',
  };
  const matW = scene.w + 60,
    matH = scene.h + 60 + (mode === 'side' ? LABEL : 0);
  const gridSize = `${10 * pxPerMM}px ${10 * pxPerMM}px`,
    majorSize = `${50 * pxPerMM}px ${50 * pxPerMM}px`;

  const chooseMode = (nextMode: Mode) => {
    setMode(nextMode);
    camera.setPan({ x: 0, y: 0 });
    camera.setActual(false);
    setCamAnim({ ...(nextMode === 'stack' ? VIEWS.low : VIEWS.angled), zoom: 1 });
  };
  const toggleActual = () => {
    camera.setAnim(!reduced());
    // Actual size centres on the selected piece (1 mm on screen = 1 mm, so big sheets run off the edges).
    const at = actual ? undefined : scene.placed.find((placed) => placed.pc.id === sel);
    camera.setPan(at ? { x: -at.x * MM_PX, y: -at.y * MM_PX } : { x: 0, y: 0 });
    camera.setActual(!actual);
  };

  return (
    <div className="landing sg p3">
      <SiteNav current="paper" />
      <main>
        <header className="sg-head">
          <h1>Paper sizes in 3D</h1>
          <p className="lsec-sub">
            Every size Chitthi prints, drawn to the same scale on a cutting mat, with a real design on each. Drag to
            turn the mat, scroll or pinch to zoom, and click a piece to see its numbers.
          </p>
        </header>

        <ViewBar
          mode={mode}
          onMode={chooseMode}
          groups={groups}
          onToggleGroup={(group) => setGroups((current) => toggled(current, group))}
          sheet={sheet}
          onSheet={setSheet}
          lift={lift}
          onLift={setLift}
        />

        <div className="p3-main">
          <div className="p3-stagewrap">
            <div
              className={`p3-view${actual ? ' actual' : ''}`}
              ref={box}
              tabIndex={0}
              role="application"
              aria-label="3D view of paper sizes. Drag or use the arrow keys to turn, Shift and drag to move, scroll or plus and minus to zoom."
              {...camera.handlers}
            >
              <div className="p3-world" style={worldStyle}>
                <div
                  className="p3-mat"
                  style={{
                    width: matW * pxPerMM,
                    height: matH * pxPerMM,
                    left: (-matW / 2) * pxPerMM,
                    top: (-matH / 2) * pxPerMM,
                    backgroundSize: `${gridSize}, ${gridSize}, ${majorSize}, ${majorSize}`,
                  }}
                />
                {scene.placed.map((placed, index) => (
                  <PieceView
                    key={`${placed.pc.id}-${index}`}
                    placed={placed}
                    pxPerMM={pxPerMM}
                    mode={mode}
                    face={showFaces ? drawnFace(placed.pc) : undefined}
                    showFaces={showFaces}
                    selected={placed.pc.id === sel && mode !== 'sheet'}
                    hovered={placed.pc.id === hover}
                    onHover={setHover}
                  />
                ))}
              </div>
              {!scene.placed.length && <p className="p3-empty">Pick something to show above.</p>}
              {mode === 'sheet' && <SheetCount count={scene.count ?? 0} name={sheetPiece?.name ?? ''} sheet={sheet} />}
            </div>
            <CameraBar
              cam={cam}
              tilt={tilt}
              spin={spin}
              actual={actual}
              setCamAnim={setCamAnim}
              onActual={toggleActual}
              onReset={() => {
                camera.setPan({ x: 0, y: 0 });
                setCamAnim({ ...VIEWS.angled, zoom: 1 });
              }}
            />
            <div className="p3-opts">
              <Seg<OrientPick>
                label="Orientation"
                value={pick}
                options={[
                  ['natural', 'As designed'],
                  ['portrait', 'All vertical'],
                  ['landscape', 'All horizontal'],
                ]}
                onChange={setPick}
              />
              <label className="check">
                <input type="checkbox" checked={showFaces} onChange={(event) => setShowFaces(event.target.checked)} />{' '}
                Show designs
              </label>
              {actual && (
                <span className="hint">
                  Actual size assumes a standard 96 dpi screen; hold a bank card up to check.
                </span>
              )}
            </div>
          </div>

          <aside className="p3-side">
            {selected ? (
              <Details
                pc={selected}
                onDesign={designAt}
                onSheet={() => {
                  setMode('sheet');
                  setCamAnim({ ...VIEWS.angled, zoom: 1 });
                }}
              />
            ) : (
              <p className="hint">Click a piece to see its numbers.</p>
            )}
            {mode !== 'sheet' && (
              <PieceList
                pieces={pieces}
                shownCount={shown.length}
                groups={groups}
                hidden={hidden}
                selected={sel}
                onToggle={(id) => setHidden((current) => toggled(current, id))}
                onSelect={setSel}
                onHover={setHover}
              />
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}
