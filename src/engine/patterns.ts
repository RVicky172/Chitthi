import type { Box, PatternName, Theme } from '../types';
import { glow, hexA, leaf, marigold, pt, qpt, star } from './color';

/*
 * Procedural occasion artwork. Every pattern is drawn relative to the card box so it scales to any print size, from
 * a seeded random source so the same design always draws the same artwork.
 */

/** Where a pattern is drawn: the background behind the photos, or the lighter overlay on top of a full photo. */
export type PatternMode = 'bg' | 'over';

/**
 * Draws one pattern.
 * @param context the canvas
 * @param box the card's trim box and bleed
 * @param unit a hundredth of the card's shorter side
 * @param theme the occasion
 * @param random the seeded random source, 0–1
 * @param mode background or overlay
 */
export type PatternFn = (context: CanvasRenderingContext2D, box: Box, unit: number, theme: Theme, random: () => number, mode: PatternMode) => void;

/** A point as shares of the card's width and height (or a position, for the kolam). */
type Spot = readonly [number, number];

/**
 * A palette colour, going round the palette.
 * @param palette the theme's colours
 * @param index any whole number
 * @returns the colour
 */
const colourAt = (palette: readonly string[], index: number): string => palette.at(index % palette.length) ?? '';

/**
 * Draws one balloon on its string, with a highlight.
 * @param context the canvas
 * @param x the balloon's centre
 * @param y the balloon's centre
 * @param radius its height
 * @param unit the pattern's unit
 * @param colour its colour
 */
function balloon(context: CanvasRenderingContext2D, x: number, y: number, radius: number, unit: number, colour: string): void {
  context.strokeStyle = 'rgba(60,60,60,.5)';
  context.lineWidth = unit * 0.25;
  context.beginPath();
  context.moveTo(x, y + radius * 1.1);
  context.bezierCurveTo(x - radius * 0.6, y + radius * 2, x + radius * 0.6, y + radius * 3, x, y + radius * 4.2);
  context.stroke();
  context.fillStyle = colour;
  context.beginPath();
  context.ellipse(x, y, radius * 0.85, radius, 0, 0, 7);
  context.fill();
  context.beginPath();
  context.moveTo(x - radius * 0.18, y + radius * 1.13);
  context.lineTo(x + radius * 0.18, y + radius * 1.13);
  context.lineTo(x, y + radius * 0.95);
  context.fill();
  context.fillStyle = 'rgba(255,255,255,.45)';
  context.beginPath();
  context.ellipse(x - radius * 0.3, y - radius * 0.38, radius * 0.16, radius * 0.3, -0.5, 0, 7);
  context.fill();
}

/**
 * Draws one diya: its glow, clay bowl, rim and flame.
 * @param context the canvas
 * @param centreX the bowl's centre
 * @param centreY the bowl's rim
 * @param size its scale
 */
function diyaLamp(context: CanvasRenderingContext2D, centreX: number, centreY: number, size: number): void {
  glow(context, centreX, centreY - size * 3.5, size * 7, '#FFC857', 0.55);
  context.fillStyle = '#B4461B';
  context.beginPath();
  context.moveTo(centreX - size * 4, centreY - size);
  context.quadraticCurveTo(centreX, centreY + size * 4.2, centreX + size * 4, centreY - size);
  context.closePath();
  context.fill();
  context.fillStyle = '#E07B39';
  context.beginPath();
  context.ellipse(centreX, centreY - size, size * 4, size * 0.9, 0, 0, 7);
  context.fill();
  context.fillStyle = '#FFD166';
  context.beginPath();
  context.moveTo(centreX, centreY - size * 6.2);
  context.quadraticCurveTo(centreX + size * 1.7, centreY - size * 3, centreX, centreY - size * 1.6);
  context.quadraticCurveTo(centreX - size * 1.7, centreY - size * 3, centreX, centreY - size * 6.2);
  context.fill();
  context.fillStyle = '#FFF5CC';
  context.beginPath();
  context.ellipse(centreX, centreY - size * 2.8, size * 0.5, size * 1.05, 0, 0, 7);
  context.fill();
}

/**
 * Draws a rakhi's flower: petals round a red centre with white dots.
 * @param context the canvas
 * @param x the centre
 * @param y the centre
 * @param radius its size
 */
function rakhiFlower(context: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  for (let petal = 0; petal < 14; petal++) {
    const angle = (petal * Math.PI * 2) / 14;
    context.save();
    context.translate(x + Math.cos(angle) * radius * 0.62, y + Math.sin(angle) * radius * 0.62);
    context.rotate(angle);
    context.fillStyle = petal % 2 ? '#E9B949' : '#F4D35E';
    context.beginPath();
    context.ellipse(0, 0, radius * 0.42, radius * 0.2, 0, 0, 7);
    context.fill();
    context.restore();
  }
  context.fillStyle = '#C1121F';
  context.beginPath();
  context.arc(x, y, radius * 0.5, 0, 7);
  context.fill();
  context.fillStyle = '#FFFFFF';
  for (let dot = 0; dot < 10; dot++) {
    const angle = dot * 0.628;
    context.beginPath();
    context.arc(x + Math.cos(angle) * radius * 0.36, y + Math.sin(angle) * radius * 0.36, radius * 0.065, 0, 7);
    context.fill();
  }
  context.fillStyle = '#FFE8A3';
  context.beginPath();
  context.arc(x, y, radius * 0.18, 0, 7);
  context.fill();
}

/**
 * Draws a hanging lantern on its cord.
 * @param context the canvas
 * @param box the card
 * @param unit the pattern's unit
 * @param colour the lantern's colour
 * @param x the cord's x
 * @param bottom where the cord ends
 */
function lantern(context: CanvasRenderingContext2D, box: Box, unit: number, colour: string, x: number, bottom: number): void {
  context.strokeStyle = hexA(colour, 0.8);
  context.lineWidth = unit * 0.25;
  context.beginPath();
  context.moveTo(x, box.y - box.e);
  context.lineTo(x, bottom);
  context.stroke();
  glow(context, x, bottom + unit * 3, unit * 6, '#FFD27A', 0.45);
  context.fillStyle = colour;
  context.fillRect(x - unit * 1.2, bottom - unit * 0.6, unit * 2.4, unit * 0.9);
  context.beginPath();
  context.moveTo(x - unit * 2, bottom + unit * 0.3);
  context.lineTo(x + unit * 2, bottom + unit * 0.3);
  context.lineTo(x + unit * 2.6, bottom + unit * 4.5);
  context.lineTo(x, bottom + unit * 6.4);
  context.lineTo(x - unit * 2.6, bottom + unit * 4.5);
  context.closePath();
  context.fill();
  context.fillStyle = 'rgba(255,246,214,.92)';
  context.beginPath();
  context.moveTo(x - unit * 1, bottom + unit * 1.3);
  context.lineTo(x + unit * 1, bottom + unit * 1.3);
  context.lineTo(x + unit * 1.4, bottom + unit * 4.2);
  context.lineTo(x, bottom + unit * 5.2);
  context.lineTo(x - unit * 1.4, bottom + unit * 4.2);
  context.closePath();
  context.fill();
}

/**
 * Draws a kite at the origin: two halves, its spars and a tail.
 * @param context the canvas, moved and turned to the kite
 * @param palette the theme's colours
 * @param index the kite's number (picks its colours)
 * @param size its half height
 * @param unit the pattern's unit
 */
function kite(context: CanvasRenderingContext2D, palette: readonly string[], index: number, size: number, unit: number): void {
  context.fillStyle = colourAt(palette, index);
  context.beginPath();
  context.moveTo(0, -size);
  context.lineTo(-size * 0.8, 0);
  context.lineTo(0, size * 1.1);
  context.closePath();
  context.fill();
  context.fillStyle = colourAt(palette, index + 2);
  context.beginPath();
  context.moveTo(0, -size);
  context.lineTo(size * 0.8, 0);
  context.lineTo(0, size * 1.1);
  context.closePath();
  context.fill();
  context.strokeStyle = 'rgba(0,0,0,.3)';
  context.lineWidth = unit * 0.2;
  context.beginPath();
  context.moveTo(0, -size);
  context.lineTo(0, size * 1.1);
  context.moveTo(-size * 0.8, 0);
  context.quadraticCurveTo(0, -size * 0.4, size * 0.8, 0);
  context.stroke();
  context.fillStyle = colourAt(palette, index + 1);
  context.beginPath();
  context.moveTo(0, size * 1.05);
  context.lineTo(-size * 0.25, size * 1.45);
  context.lineTo(size * 0.25, size * 1.45);
  context.closePath();
  context.fill();
}

/** A mandala ring's petal and disc colours. */
interface RingColours {
  petal: string;
  disc: string;
}

/**
 * Draws one ring of a mandala: petals, a disc and white dots on its edge.
 * @param context the canvas
 * @param x the centre
 * @param y the centre
 * @param ring the ring, 0 (inner) to 4
 * @param step the rings' spacing
 * @param colours the petals' and the disc's colours
 */
function mandalaRing(context: CanvasRenderingContext2D, x: number, y: number, ring: number, step: number, colours: RingColours): void {
  const radius = step * (ring + 1);
  const count = 8 + ring * 4;
  context.fillStyle = colours.petal;
  for (let petal = 0; petal < count; petal++) {
    const angle = (petal * Math.PI * 2) / count + ((ring % 2) * Math.PI) / count;
    context.save();
    context.translate(x + Math.cos(angle) * (radius - step * 0.32), y + Math.sin(angle) * (radius - step * 0.32));
    context.rotate(angle);
    context.beginPath();
    context.ellipse(0, 0, step * 0.42, step * 0.2, 0, 0, 7);
    context.fill();
    context.restore();
  }
  context.fillStyle = colours.disc;
  context.beginPath();
  context.arc(x, y, radius - step * 0.72, 0, 7);
  context.fill();
  context.fillStyle = 'rgba(255,255,255,.85)';
  for (let dot = 0; dot < count; dot++) {
    const angle = (dot * Math.PI * 2) / count;
    context.beginPath();
    context.arc(x + Math.cos(angle) * (radius - step * 0.72), y + Math.sin(angle) * (radius - step * 0.72), step * 0.06, 0, 7);
    context.fill();
  }
}

/**
 * Draws one kolam loop round a dot.
 * @param context the canvas
 * @param x the dot
 * @param y the dot
 * @param half the loop's half width
 * @param unit the pattern's unit
 * @param dotColour the dot's colour
 */
function kolamLoop(context: CanvasRenderingContext2D, x: number, y: number, half: number, unit: number, dotColour: string): void {
  context.beginPath();
  context.moveTo(x, y - half);
  context.quadraticCurveTo(x + half * 0.15, y - half * 0.15, x + half, y);
  context.quadraticCurveTo(x + half * 0.15, y + half * 0.15, x, y + half);
  context.quadraticCurveTo(x - half * 0.15, y + half * 0.15, x - half, y);
  context.quadraticCurveTo(x - half * 0.15, y - half * 0.15, x, y - half);
  context.stroke();
  context.fillStyle = dotColour;
  context.beginPath();
  context.arc(x, y, unit * 0.45, 0, 7);
  context.fill();
}

/** A peacock feather's eye, outside in: colour and radii (units). */
const PEACOCK_EYE: readonly (readonly [string, number, number])[] = [
  ['#2A9D8F', 4.4, 3.1],
  ['#E9C46A', 3.3, 2.4],
  ['#1D4ED8', 2.4, 1.8],
  ['#0B1D51', 1.3, 1.05],
];

/**
 * Draws one peacock feather from the corner: barbs along the shaft, the shaft, then the eye.
 * @param context the canvas
 * @param originX the corner
 * @param originY the corner
 * @param angle the feather's direction
 * @param length its length
 * @param unit the pattern's unit
 */
function peacockFeather(context: CanvasRenderingContext2D, originX: number, originY: number, angle: number, length: number, unit: number): void {
  const endX = originX + Math.cos(angle) * length;
  const endY = originY + Math.sin(angle) * length;
  context.strokeStyle = hexA('#2A9D8F', 0.55);
  context.lineWidth = unit * 0.18;
  for (let barb = 4; barb < 18; barb++) {
    const along = barb / 20;
    const barbX = originX + Math.cos(angle) * length * along;
    const barbY = originY + Math.sin(angle) * length * along;
    const barbLength = unit * (1.2 + along * 2.4);
    for (const side of [1, -1]) {
      context.beginPath();
      context.moveTo(barbX, barbY);
      context.lineTo(barbX + Math.cos(angle + side * 0.7) * barbLength, barbY + Math.sin(angle + side * 0.7) * barbLength);
      context.stroke();
    }
  }
  context.strokeStyle = '#C9B458';
  context.lineWidth = unit * 0.3;
  context.beginPath();
  context.moveTo(originX, originY);
  context.lineTo(endX, endY);
  context.stroke();
  context.save();
  context.translate(endX, endY);
  context.rotate(angle);
  for (const [colour, radiusX, radiusY] of PEACOCK_EYE) {
    context.fillStyle = colour;
    context.beginPath();
    context.ellipse(0, 0, unit * radiusX, unit * radiusY, 0, 0, 7);
    context.fill();
  }
  context.restore();
}

/**
 * Draws a wavy band of colour along the top or bottom edge.
 * @param context the canvas
 * @param box the card
 * @param unit the pattern's unit
 * @param edgeY the edge's y, out in the bleed
 * @param waveY the wave's middle y
 */
function waveBand(context: CanvasRenderingContext2D, box: Box, unit: number, edgeY: number, waveY: number): void {
  context.beginPath();
  context.moveTo(box.x - box.e, edgeY);
  context.lineTo(box.x + box.w + box.e, edgeY);
  for (let x = box.x + box.w + box.e; x >= box.x - box.e; x -= unit) context.lineTo(x, waveY + Math.sin((x / box.w) * Math.PI * 2) * unit * 1.2);
  context.closePath();
  context.fill();
}

/**
 * Draws a faint Ashoka Chakra: a rim, 24 spokes and a hub.
 * @param context the canvas
 * @param x the centre
 * @param y the centre
 * @param radius its radius
 * @param unit the pattern's unit
 */
function chakra(context: CanvasRenderingContext2D, x: number, y: number, radius: number, unit: number): void {
  context.strokeStyle = hexA('#000080', 0.12);
  context.lineWidth = unit * 0.9;
  context.beginPath();
  context.arc(x, y, radius, 0, 7);
  context.stroke();
  context.lineWidth = unit * 0.35;
  for (let spoke = 0; spoke < 24; spoke++) {
    const angle = (spoke * Math.PI) / 12;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
    context.stroke();
  }
  context.fillStyle = hexA('#000080', 0.12);
  context.beginPath();
  context.arc(x, y, radius * 0.16, 0, 7);
  context.fill();
}

/** One string of bunting: where it hangs, its sag and the pennants' first colour. */
interface BuntingString {
  left: number;
  width: number;
  top: number;
  sag: number;
  firstColour: number;
}

/**
 * Draws one string of bunting and its nine pennants.
 * @param context the canvas
 * @param theme the occasion
 * @param unit the pattern's unit
 * @param string the string
 */
function buntingString(context: CanvasRenderingContext2D, theme: Theme, unit: number, { left, width, top, sag, firstColour }: BuntingString): void {
  const right = left + width;
  const middle = left + width / 2;
  context.strokeStyle = hexA(theme.deep, 0.6);
  context.lineWidth = unit * 0.25;
  context.beginPath();
  context.moveTo(left, top);
  context.quadraticCurveTo(middle, top + sag * 2, right, top);
  context.stroke();
  const count = 9;
  for (let pennant = 0; pennant < count; pennant++) {
    const [startX, startY] = qpt(left, top, middle, top + sag * 2, right, top, (pennant + 0.2) / count);
    const [endX, endY] = qpt(left, top, middle, top + sag * 2, right, top, (pennant + 0.8) / count);
    const midX = (startX + endX) / 2;
    const midY = (startY + endY) / 2;
    const angle = Math.atan2(endY - startY, endX - startX);
    context.fillStyle = colourAt(theme.pal, pennant + firstColour);
    context.beginPath();
    context.moveTo(startX, startY);
    context.lineTo(endX, endY);
    context.lineTo(midX - Math.sin(angle) * unit * 4.5 * -1, midY + Math.cos(angle) * unit * 4.5);
    context.closePath();
    context.fill();
  }
}

/** Every pattern, by name. */
export const PAT: Record<PatternName, PatternFn> = {
  confetti(context, box, unit, theme, random, mode) {
    const count = mode === 'over' ? 50 : 80;
    for (let piece = 0; piece < count; piece++) {
      const [x, y] = pt(box, random, mode === 'over' ? 0.16 : 0.26);
      const size = unit * (0.7 + random() * 1.3);
      context.save();
      context.translate(x, y);
      context.rotate(random() * 6.28);
      context.fillStyle = colourAt(theme.pal, piece);
      context.strokeStyle = colourAt(theme.pal, piece + 1);
      if (piece % 3 === 0) {
        context.beginPath();
        context.arc(0, 0, size * 0.55, 0, 7);
        context.fill();
      } else if (piece % 3 === 1) context.fillRect(-size, -size * 0.3, size * 2, size * 0.6);
      else {
        context.beginPath();
        context.moveTo(-size * 0.9, 0);
        context.bezierCurveTo(-size * 0.3, -size, size * 0.3, size, size * 0.9, 0);
        context.lineWidth = size * 0.32;
        context.stroke();
      }
      context.restore();
    }
  },
  balloons(context, box, unit, theme, random, mode) {
    const spots: readonly Spot[] =
      mode === 'over'
        ? [
            [0.07, 0.16],
            [0.17, 0.3],
            [0.92, 0.14],
            [0.83, 0.28],
          ]
        : [
            [0.07, 0.2],
            [0.17, 0.36],
            [0.91, 0.16],
            [0.82, 0.32],
            [0.95, 0.45],
          ];
    spots.forEach(([shareX, shareY], index) => {
      const radius = unit * (5 + random() * 2.5);
      balloon(context, box.x + box.w * shareX, box.y + box.h * shareY, radius, unit, colourAt(theme.pal, index));
    });
  },
  diya(context, box, unit) {
    const count = Math.max(3, Math.round(box.w / (unit * 16)));
    const size = unit * 1.1;
    for (let lamp = 0; lamp < count; lamp++) diyaLamp(context, box.x + ((lamp + 0.5) * box.w) / count, box.y + box.h - unit * 5, size);
  },
  sparkle(context, box, unit, theme, random) {
    for (let index = 0; index < 28; index++) {
      const [x, y] = pt(box, random, 0.3);
      context.fillStyle = hexA(colourAt(theme.pal, index), 0.8);
      star(context, x, y, unit * (0.5 + random() * 1.2), 4, 0.28);
    }
  },
  toran(context, box, unit, _theme, _random, mode) {
    const count = Math.max(3, Math.round(box.w / (unit * 34)));
    const segment = box.w / count;
    const top = box.y - unit * 0.5;
    const sag = unit * (mode === 'over' ? 6 : 7.5);
    const flower = unit * 1.7;
    context.fillStyle = '#7A3E12';
    context.fillRect(box.x - box.e, box.y - box.e, box.w + 2 * box.e, box.e + unit * 0.6);
    for (let garland = 0; garland < count; garland++) {
      const left = box.x + garland * segment;
      const right = left + segment;
      const steps = Math.max(6, Math.round(segment / (flower * 1.8)));
      for (let step = 0; step <= steps; step++) {
        const [x, y] = qpt(left, top, left + segment / 2, top + sag * 2, right, top, step / steps);
        marigold(context, x, y, flower, step % 2 ? '#FFB000' : '#F26B0F');
      }
    }
    for (let knot = 0; knot <= count; knot++) {
      const x = box.x + knot * segment;
      for (let step = 1; step <= 3; step++) marigold(context, x, top + step * flower * 1.8, flower * 0.95, step % 2 ? '#F26B0F' : '#FFB000');
      leaf(context, x, top + flower * 6.4, flower * 3.6, Math.PI / 2, '#2D7A3A');
    }
  },
  splash(context, box, unit, theme, random, mode) {
    const spots: readonly Spot[] =
      mode === 'over'
        ? [
            [0, 0],
            [1, 0],
            [0, 1],
            [1, 1],
          ]
        : [
            [0.05, 0.1],
            [0.92, 0.12],
            [0.12, 0.92],
            [0.88, 0.88],
            [0.5, 0.02],
            [0.02, 0.55],
            [0.98, 0.55],
          ];
    spots.forEach(([shareX, shareY], index) => {
      const x = box.x + box.w * shareX;
      const y = box.y + box.h * shareY;
      const radius = unit * (mode === 'over' ? 24 : 26) * (0.8 + random() * 0.5);
      const colour = colourAt(theme.pal, index);
      glow(context, x, y, radius, colour, 0.85);
      for (let drop = 0; drop < 12; drop++) {
        const angle = random() * 6.28;
        const distance = radius * (0.45 + random() * 0.75);
        context.fillStyle = hexA(colour, 0.85);
        context.beginPath();
        context.arc(x + Math.cos(angle) * distance, y + Math.sin(angle) * distance, unit * (0.4 + random() * 1.3), 0, 7);
        context.fill();
      }
    });
  },
  rakhi(context, box, unit) {
    const y = box.y + box.h * 0.86;
    for (const [colour, offset] of [
      ['#C1121F', 0],
      ['#D4A017', unit * 0.9],
    ] as const) {
      context.strokeStyle = colour;
      context.lineWidth = unit * 0.6;
      context.beginPath();
      for (let x = box.x - box.e; x <= box.x + box.w + box.e; x += unit) {
        context.lineTo(x, y + offset + Math.sin(x / (unit * 6)) * unit * 0.8);
      }
      context.stroke();
    }
    rakhiFlower(context, box.x + box.w * 0.18, y, unit * 8);
  },
  crescent(context, box, unit, theme, random, mode) {
    const x = box.x + box.w * 0.84;
    const y = box.y + box.h * 0.24;
    const radius = unit * 9;
    const moon = colourAt(theme.pal, 0);
    glow(context, x, y, radius * 2.3, moon, 0.3);
    context.save();
    context.beginPath();
    context.arc(x, y, radius, 0, 7);
    context.clip();
    context.beginPath();
    context.rect(x - radius * 2, y - radius * 2, radius * 4, radius * 4);
    context.arc(x + radius * 0.42, y - radius * 0.22, radius * 0.86, 0, 7);
    context.fillStyle = moon;
    context.fill('evenodd');
    context.restore();
    for (let index = 0; index < 20; index++) {
      const [starX, starY] = pt(box, random, 0.28);
      if (starY > box.y + box.h * 0.62) continue;
      context.fillStyle = hexA(theme.pal.at(1) ?? '', 0.85);
      star(context, starX, starY, unit * (0.5 + random() * 1.1), 5, 0.45);
    }
    (mode === 'over' ? [0.07, 0.17] : [0.08, 0.18, 0.28]).forEach((share, index) => {
      const length = box.h * (0.1 + ((index * 37) % 10) / 60);
      lantern(context, box, unit, moon, box.x + box.w * share, box.y + length);
    });
  },
  snow(context, box, unit, _theme, random, mode) {
    const count = mode === 'over' ? 70 : 110;
    for (let flake = 0; flake < count; flake++) {
      const [x, y] = pt(box, random, mode === 'over' ? 0.2 : 1);
      context.fillStyle = hexA('#FFFFFF', 0.35 + random() * 0.55);
      context.beginPath();
      context.arc(x, y, unit * (0.25 + random() * 0.9), 0, 7);
      context.fill();
    }
  },
  stars(context, box, unit, theme, random, mode) {
    for (let index = 0; index < 30; index++) {
      const [x, y] = pt(box, random, mode === 'over' ? 0.16 : 0.3);
      context.fillStyle = hexA(colourAt(theme.pal, index), 0.85);
      star(context, x, y, unit * (0.5 + random() * 1.4), 5, 0.45);
    }
  },
  kites(context, box, unit, theme, random, mode) {
    const spots: readonly Spot[] =
      mode === 'over'
        ? [
            [0.1, 0.18],
            [0.86, 0.16],
            [0.93, 0.42],
          ]
        : [
            [0.12, 0.2],
            [0.84, 0.16],
            [0.92, 0.46],
            [0.26, 0.4],
            [0.62, 0.1],
          ];
    spots.forEach(([shareX, shareY], index) => {
      const size = unit * (5.5 + random() * 3);
      const x = box.x + box.w * shareX;
      const y = box.y + box.h * shareY;
      const tilt = random() * 0.6 - 0.3;
      context.strokeStyle = 'rgba(0,0,0,.3)';
      context.lineWidth = unit * 0.15;
      context.beginPath();
      context.moveTo(x, y + size);
      context.quadraticCurveTo(x - size * 2, y + size * 6, box.x - box.e, box.y + box.h + box.e);
      context.stroke();
      context.save();
      context.translate(x, y);
      context.rotate(tilt);
      kite(context, theme.pal, index, size, unit);
      context.restore();
    });
  },
  rain(context, box, unit, _theme, random, mode) {
    const count = mode === 'over' ? 90 : 140;
    context.lineWidth = unit * 0.22;
    for (let drop = 0; drop < count; drop++) {
      const [x, y] = pt(box, random, 1);
      const length = unit * (2.5 + random() * 3);
      context.strokeStyle = hexA('#FFFFFF', 0.18 + random() * 0.3);
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x - length * 0.3, y + length);
      context.stroke();
    }
    if (mode !== 'over')
      for (let puddle = 0; puddle < 6; puddle++) {
        const x = box.x + random() * box.w;
        const y = box.y + box.h * (0.86 + random() * 0.1);
        const radiusX = unit * (2 + random() * 3);
        context.strokeStyle = hexA('#FFFFFF', 0.35);
        context.beginPath();
        context.ellipse(x, y, radiusX, radiusX * 0.3, 0, 0, 7);
        context.stroke();
      }
  },
  leaves(context, box, unit, theme, random, mode) {
    const count = mode === 'over' ? 16 : 24;
    for (let index = 0; index < count; index++) {
      const [x, y] = pt(box, random, 0.24);
      leaf(context, x, y, unit * (3 + random() * 3), random() * 6.28, colourAt(theme.pal, index));
    }
  },
  sunrays(context, box, unit, theme, _random, mode) {
    const centreX = box.x + box.w * 0.9;
    const centreY = box.y + box.h * 0.12;
    const reach = Math.hypot(box.w, box.h);
    context.fillStyle = `rgba(255,255,255,${mode === 'over' ? 0.08 : 0.15})`;
    for (let ray = 0; ray < 18; ray += 2) {
      const start = (ray * Math.PI * 2) / 18;
      context.beginPath();
      context.moveTo(centreX, centreY);
      context.arc(centreX, centreY, reach, start, start + (Math.PI * 2) / 18);
      context.closePath();
      context.fill();
    }
    glow(context, centreX, centreY, unit * 26, '#FFF3B0', 0.75);
    context.fillStyle = colourAt(theme.pal, 0);
    context.beginPath();
    context.arc(centreX, centreY, unit * 10, 0, 7);
    context.fill();
  },
  flowers(context, box, unit, theme, random, mode) {
    const count = mode === 'over' ? 26 : 36;
    for (let index = 0; index < count; index++) {
      const [x, y] = pt(box, random, mode === 'over' ? 0.15 : 0.24);
      const size = unit * (1.2 + random() * 1.6);
      const turn = random() * 6.28;
      context.fillStyle = theme.pal.at(index % 2) ?? '';
      for (let petal = 0; petal < 5; petal++) {
        const angle = turn + petal * 1.2566;
        context.beginPath();
        context.ellipse(x + Math.cos(angle) * size * 0.6, y + Math.sin(angle) * size * 0.6, size * 0.55, size * 0.33, angle, 0, 7);
        context.fill();
      }
      context.fillStyle = '#C45A00';
      context.beginPath();
      context.arc(x, y, size * 0.3, 0, 7);
      context.fill();
    }
  },
  mandala(context, box, unit, theme, _random, mode) {
    const corners: readonly Spot[] = [
      [0, 1],
      [1, 0],
    ];
    corners.forEach(([shareX, shareY], corner) => {
      const x = box.x + box.w * shareX;
      const y = box.y + box.h * shareY;
      const step = (unit * (mode === 'over' ? 24 : 34)) / 5;
      for (let ring = 4; ring >= 0; ring--) mandalaRing(context, x, y, ring, step, { petal: colourAt(theme.pal, ring + corner), disc: colourAt(theme.pal, ring + corner + 1) });
    });
  },
  kolam(context, box, unit, theme) {
    const spacing = unit * 4.2;
    const corners: readonly Spot[] = [
      [box.x + unit * 4, box.y + unit * 4],
      [box.x + box.w - unit * 4 - spacing * 4, box.y + box.h - unit * 4 - spacing * 4],
    ];
    for (const [originX, originY] of corners) {
      context.strokeStyle = colourAt(theme.pal, 0);
      context.lineWidth = unit * 0.35;
      for (let column = 0; column < 5; column++)
        for (let row = 0; row < 5; row++) {
          if (Math.abs(column - 2) + Math.abs(row - 2) > 2) continue;
          kolamLoop(context, originX + column * spacing, originY + row * spacing, spacing * 0.5, unit, theme.deep);
        }
      context.beginPath();
      context.arc(originX + 2 * spacing, originY + 2 * spacing, spacing * 2.9, 0, 7);
      context.stroke();
    }
  },
  peacock(context, box, unit, _theme, random, mode) {
    const originX = box.x + box.w + box.e;
    const originY = box.y + box.h + box.e;
    const count = 6;
    for (let feather = 0; feather < count; feather++) {
      const angle = Math.PI * 1.02 + (feather / (count - 1)) * Math.PI * 0.46;
      const length = unit * (32 + random() * 8) * (mode === 'over' ? 0.8 : 1);
      peacockFeather(context, originX, originY, angle, length, unit);
    }
  },
  tricolor(context, box, unit, _theme, _random, mode) {
    const band = unit * (mode === 'over' ? 4.5 : 7);
    context.fillStyle = '#FF9933';
    waveBand(context, box, unit, box.y - box.e, box.y + band);
    context.fillStyle = '#138808';
    waveBand(context, box, unit, box.y + box.h + box.e, box.y + box.h - band);
    if (mode !== 'over') chakra(context, box.x + box.w * 0.84, box.y + box.h * 0.5, unit * 18, unit);
  },
  wheat(context, box, unit, _theme, random) {
    const count = Math.round(box.w / (unit * 3.6));
    const base = box.y + box.h + box.e;
    for (let stalk = 0; stalk < count; stalk++) {
      const x = box.x + ((stalk + 0.5) * box.w) / count + (random() - 0.5) * unit;
      const height = unit * (14 + random() * 12) + box.e;
      const lean = (random() - 0.5) * unit * 4;
      const tipX = x + lean;
      const tipY = base - height;
      context.strokeStyle = '#8A5A00';
      context.lineWidth = unit * 0.35;
      context.beginPath();
      context.moveTo(x, base);
      context.quadraticCurveTo(x, base - height * 0.5, tipX, tipY);
      context.stroke();
      for (let grain = 0; grain < 7; grain++) {
        const along = 0.64 + grain * 0.055;
        const [grainX, grainY] = qpt(x, base, x, base - height * 0.5, tipX, tipY, Math.min(along, 1));
        context.save();
        context.translate(grainX, grainY);
        context.rotate(grain % 2 ? 0.5 : -0.5);
        context.fillStyle = grain % 2 ? '#C8961E' : '#B07D1A';
        context.beginPath();
        context.ellipse(0, 0, unit * 0.55, unit * 1.15, 0, 0, 7);
        context.fill();
        context.restore();
      }
    }
  },
  sparks(context, box, unit, theme, random, mode) {
    glow(context, box.x + box.w * 0.5, box.y + box.h + box.e, box.w * 0.45, '#FF7A00', mode === 'over' ? 0.4 : 0.55);
    for (let spark = 0; spark < 70; spark++) {
      const x = box.x + box.w * (0.5 + (random() - 0.5) * (0.3 + random() * 0.9));
      const rise = Math.pow(random(), 0.7) * (mode === 'over' ? 0.5 : 0.9);
      const y = box.y + box.h * (1 - rise);
      context.fillStyle = hexA(theme.pal.at(spark % 3) ?? '', 0.95 - rise * 0.7);
      context.beginPath();
      context.arc(x, y, unit * (0.2 + random() * 0.6), 0, 7);
      context.fill();
    }
  },
  bunting(context, box, unit, theme) {
    const width = (box.w + 2 * box.e) / 2;
    for (let string = 0; string < 2; string++) {
      buntingString(context, theme, unit, { left: box.x - box.e + string * width, width, top: box.y + unit * 1.5, sag: unit * 6, firstColour: string });
    }
  },
};
