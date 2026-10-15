// What the 3D viewer turns (Viewer3D): the card, every month in a ring, the wall calendar and the envelope with the
// card inside. The viewer's loop sets each one's transform through the ref it passes.
import type { CSSProperties, Ref } from 'react';
import type { ViewerFaces } from '../types';

/** A calendar page in the viewer. */
export type ViewerPage = NonNullable<ViewerFaces['pages']>[number];

/** The card and its size on screen. */
interface CardViewProps {
  faces: ViewerFaces;
  objectRef: Ref<HTMLDivElement>;
  width: number;
  height: number;
  /** Rounded corners (a circle, the card's corner, or 2 px). */
  radius: number | string;
  /** The page shown on the front (a month opened from the ring), else the card's front. */
  pageSrc: string | null;
}

/**
 * The card: front and back faces with shade and gloss.
 * @param props the faces, the ref the loop turns, the size, the corners and the page on the front
 */
export function CardView({ faces, objectRef, width, height, radius, pageSrc }: Readonly<CardViewProps>) {
  return (
    <div className="vcard" ref={objectRef} style={{ width, height }}>
      <div className="core" style={{ borderRadius: radius }} />
      <div className="face f" style={{ borderRadius: radius }}>
        <img src={pageSrc ?? faces.front} alt="Front of the card" />
        <i className="shade" />
        <i className="gloss" />
      </div>
      <div className="face b" style={{ borderRadius: radius }}>
        <img src={faces.back} alt="Back of the card" />
        <i className="shade b" />
        <i className="gloss" />
      </div>
    </div>
  );
}

/** The ring's pages and geometry. */
interface RingViewProps {
  ring: ViewerPage[];
  objectRef: Ref<HTMLDivElement>;
  pageWidth: number;
  aspect: number;
  /** Degrees between pages. */
  step: number;
  radius: number;
}

/**
 * Every month (and the year page) standing in a ring.
 * @param props the pages, the ref the loop turns and the geometry
 */
export function RingView({ ring, objectRef, pageWidth, aspect, step, radius }: Readonly<RingViewProps>) {
  return (
    <div className="vring" ref={objectRef} style={{ width: pageWidth, height: pageWidth / aspect }}>
      {ring.map((page, index) => (
        <figure
          key={index}
          className="vpage"
          data-page={index}
          style={{ transform: `rotateY(${index * step}deg) translateZ(${radius}px)` }}
        >
          <div className="face f" data-page={index}>
            <img src={page.src} alt={page.label} data-page={index} />
            <i className="gloss" />
          </div>
          <div className="face b" />
          <figcaption>{page.label}</figcaption>
        </figure>
      ))}
    </div>
  );
}

/** The wall calendar's pages and how many are turned. */
interface WallViewProps {
  pages: ViewerPage[];
  objectRef: Ref<HTMLDivElement>;
  width: number;
  aspect: number;
  /** Pages turned so far. */
  turnedCount: number;
}

/**
 * A wall calendar: turned pages go up over the binding and hang behind; the rest stack under the current one.
 * @param props the pages, the ref the loop turns, the size and the pages turned
 */
export function WallView({ pages, objectRef, width, aspect, turnedCount }: Readonly<WallViewProps>) {
  return (
    <div className="vwall" ref={objectRef} style={{ width, height: width / aspect }}>
      <div className="vbind" aria-hidden="true" />
      {pages.map((page, index) => {
        const turned = index < turnedCount;
        // Turned pages go up over the binding and hang behind; the rest stack underneath the current one.
        const transform = turned
          ? `rotateX(${354 - (turnedCount - 1 - index) * 0.5}deg) translateZ(${-(turnedCount - index) * 0.6}px)`
          : `translateZ(${-(index - turnedCount) * 0.7}px)`;
        return (
          <div
            key={index}
            className="vleaf"
            style={{ transform, zIndex: turned ? 0 : pages.length - index }}
            aria-hidden={index !== turnedCount}
          >
            <div className="face f">
              <img src={page.src} alt={page.label} />
              <i className="gloss" />
            </div>
            <div className="face b" />
          </div>
        );
      })}
    </div>
  );
}

/** The envelope, the card in it, and their sizes on screen. */
interface EnvelopeViewProps {
  faces: ViewerFaces;
  envelope: NonNullable<ViewerFaces['envelope']>;
  objectRef: Ref<HTMLDivElement>;
  /** The envelope's size on screen. */
  width: number;
  height: number;
  /** The card's size on screen (lying landscape in the envelope). */
  cardWidth: number;
  cardHeight: number;
  /** A portrait card, turned to lie in the envelope. */
  portraitCard: boolean;
  opened: boolean;
}

/**
 * The envelope: address side, back, flap (opening) and the card sliding out when opened.
 * @param props the faces, the envelope, the ref the loop turns, the sizes and whether it is open
 */
export function EnvelopeView({
  faces,
  envelope,
  objectRef,
  width,
  height,
  cardWidth,
  cardHeight,
  portraitCard,
  opened,
}: Readonly<EnvelopeViewProps>) {
  const turnedCard: CSSProperties | undefined = portraitCard
    ? {
        width: cardHeight,
        height: cardWidth,
        transform: `translate(${(cardWidth - cardHeight) / 2}px, ${(cardHeight - cardWidth) / 2}px) rotate(-90deg)`,
      }
    : undefined;
  return (
    <div className={`venv${opened ? ' open' : ''}`} ref={objectRef} style={{ width, height }}>
      <div className="face f">
        <img src={envelope.front} alt={`Envelope, address side (${envelope.name})`} />
        <i className="gloss" />
      </div>
      <div
        className="venv-card"
        style={{
          width: cardWidth,
          height: cardHeight,
          left: (width - cardWidth) / 2,
          top: (height - cardHeight) / 2,
        }}
      >
        <div className="venv-slide" style={{ transform: opened ? `translateY(${-cardHeight * 0.5}px)` : 'none' }}>
          <div className="face f" style={{ transform: 'rotateY(180deg)' }}>
            <img src={faces.front} alt="The card inside" style={turnedCard} />
          </div>
        </div>
      </div>
      <div className="face b">
        <img src={envelope.body} alt="Envelope, back" />
      </div>
      <div
        className="venv-flap"
        style={{ transform: `rotateY(180deg) translateZ(3px) rotateX(${opened ? 196 : 0}deg)` }}
      >
        <img className="out" src={envelope.flap} alt="" />
        <img className="in" src={envelope.liner} alt="" />
      </div>
    </div>
  );
}
