import { fontDef, fontStr } from '../data/fonts';
import { marksFor, type DayMark } from '../data/holidays';
import { MONTHS } from '../data/products';
import type { Box, Design, Rect } from '../types';
import { hexA, lum, mix } from './color';
import { darkInk, resolveTheme } from './design';
import { capHeight, setLetterSpacing, shrinkFont, wrapLines, type FontFace } from './printText';
import { cardUnit, fillWithBleed } from './themeBackground';

/*
 * Calendars: a month page's title and day grid (with marked days), the "Big number" month, the twelve small months of
 * the year page and Year strip, and the back with the whole year.
 */

/** Weekday names, Sunday first. */
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * The year and month a calendar page shows.
 * @param design the design
 * @param page the page, 0-based from the start month
 * @returns the year and the month (0–11)
 */
export function calMonth(design: Design, page: number): { year: number; month: number } {
  const monthsIn = design.cal.start + (design.cal.months === 1 ? 0 : page);
  return { year: design.cal.year + Math.floor(monthsIn / 12), month: monthsIn % 12 };
}

/**
 * The dates' face (weekday names, day numbers, the year): the chosen family, or Hind. Bold uses its heaviest weight.
 * @param design the design
 * @param bold whether bold (default: the design's choice)
 * @returns the typeface
 */
function numFace(design: Design, bold = design.cal.numBold): FontFace {
  const family = design.cal.numSync ? design.cal.font || design.headFont : design.cal.numFont;
  if (!family) return (px) => `${bold ? '600' : '400'} ${String(px)}px "Hind",sans-serif`;
  const font = fontDef(family);
  const weight = bold ? Math.max(...font.w) : Math.min(...font.w);
  return (px) => fontStr(font.n, weight, px);
}

/** The month title's text and colours. */
interface MonthTitle {
  label: string;
  /** The year beside it, or null when hidden. */
  year: string | null;
  ink: string;
  accent: string;
  /** Space kept at the left (corner numbers), pixels. */
  inset: number;
}

/**
 * Sets the year's font beside a month title at a title size.
 * @param ctx the card's context
 * @param design the design
 * @param px the title's size, pixels
 */
function setYearFont(ctx: CanvasRenderingContext2D, design: Design, px: number): void {
  ctx.font = numFace(design, true)(px * 0.36);
  setLetterSpacing(ctx, `${String(px * 0.04)}px`);
}

/**
 * A month title ("March" plus the year in the accent colour on the same baseline). Sized to fit the widest month
 * name, so every page of the calendar uses exactly the same size and position.
 * @param ctx the card's context
 * @param area the title's box
 * @param title the title
 * @param design the design
 */
function drawMonthTitle(ctx: CanvasRenderingContext2D, area: Rect, title: MonthTitle, design: Design): void {
  const { label, year, inset } = title;
  const family = fontDef(design.cal.font || design.headFont);
  let px = area.h * 0.8;
  const yearWidth = () => {
    if (!year) return 0;
    setYearFont(ctx, design, px);
    const width = ctx.measureText(year).width + px * 0.3;
    setLetterSpacing(ctx, '0px');
    return width;
  };
  for (let step = 0; step < 40; step++) {
    ctx.font = fontStr(family.n, family.hw, px);
    const widest = Math.max(...MONTHS.map((month) => ctx.measureText(month).width));
    if (widest + yearWidth() <= area.w - inset || px < 4) break;
    px *= 0.93;
  }
  ctx.font = fontStr(family.n, family.hw, px);
  const nameWidth = ctx.measureText(label).width;
  const baseline = area.y + area.h / 2 + capHeight(ctx) / 2;
  const yearSpace = yearWidth();
  const left = design.cal.titleAlign === 'left' ? area.x + inset : area.x + (area.w - nameWidth - yearSpace) / 2;
  ctx.font = fontStr(family.n, family.hw, px);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = title.ink;
  ctx.fillText(label, left, baseline);
  if (year) {
    setYearFont(ctx, design, px);
    ctx.fillStyle = title.accent;
    ctx.fillText(year, left + nameWidth + px * 0.3, baseline);
    setLetterSpacing(ctx, '0px');
  }
}

/** A month's day grid, measured. */
interface DayGrid {
  area: Rect;
  design: Design;
  ink: string;
  accent: string;
  /** The year page's small version. */
  mini: boolean;
  /** Numbers in the cells' top-left corners (else centred). */
  corner: boolean;
  weekStart: number;
  /** The column of the 1st. */
  first: number;
  /** Days in the month. */
  days: number;
  rows: number;
  cellWidth: number;
  headHeight: number;
  rowHeight: number;
  padX: number;
  padY: number;
  /** The top of the first row, pixels. */
  top: number;
  /** The numbers' scale (1 on the year page). */
  numberScale: number;
  /** The day numbers' size, the same for every month, pixels. */
  numberPx: number;
}

/**
 * Measures a month's grid. Month pages always use five rows (a sixth week shares cells, as in "23/30"), so the grid,
 * and every number in it, sits in the same place on all twelve pages; the year page's months use six.
 * @param area the grid's box (the weekday row included)
 * @param month the year and month
 * @param design the design
 * @param colours the ink and accent
 * @param mini whether this is the year page's version
 * @returns the grid
 */
function measureGrid(area: Rect, month: { year: number; month: number }, design: Design, colours: { ink: string; accent: string }, mini: boolean): DayGrid {
  const weekStart = design.cal.weekStart;
  const rows = mini ? 6 : 5;
  const corner = !mini && design.cal.numbers === 'corner';
  const cellWidth = area.w / 7;
  const headHeight = mini ? Math.min(area.h * 0.15, cellWidth * 0.8) : Math.min(area.h * 0.1, cellWidth * 0.42);
  const rowHeight = (area.h - headHeight) / rows;
  const numberScale = mini ? 1 : Math.min(1.8, Math.max(0.5, design.cal.numScale || 1));
  const cornerPx = Math.min(cellWidth * 0.3, rowHeight * 0.36);
  const centredPx = Math.min(cellWidth * 0.36, rowHeight * 0.44);
  const pagePx = corner ? cornerPx : centredPx;
  const numberPx = mini ? Math.min(cellWidth * 0.5, rowHeight * 0.62) : Math.min(pagePx * numberScale, rowHeight * 0.7, cellWidth * 0.5);
  return {
    area,
    design,
    ...colours,
    mini,
    corner,
    weekStart,
    first: (new Date(month.year, month.month, 1).getDay() - weekStart + 7) % 7,
    days: new Date(month.year, month.month + 1, 0).getDate(),
    rows,
    cellWidth,
    headHeight,
    rowHeight,
    padX: cellWidth * 0.13,
    padY: Math.min(rowHeight, cellWidth) * 0.12,
    top: area.y + headHeight,
    numberScale,
    numberPx,
  };
}

/**
 * Whether a column is Sunday's, when Sundays are marked.
 * @param grid the grid
 * @param column the column, 0–6
 * @returns true for a marked Sunday
 */
const isSunday = (grid: DayGrid, column: number): boolean => grid.design.cal.sundays && (column + grid.weekStart) % 7 === 0;

/**
 * The weekday names above the grid (initials on the year page), Sunday's in the accent.
 * @param ctx the card's context
 * @param grid the grid
 */
function drawWeekdays(ctx: CanvasRenderingContext2D, grid: DayGrid): void {
  const { area, cellWidth, headHeight, mini, corner } = grid;
  const px = mini
    ? Math.min(headHeight * 0.62, cellWidth * 0.5)
    : Math.min(headHeight * 0.46 * grid.numberScale, cellWidth * 0.2 * grid.numberScale, headHeight * 0.8);
  ctx.font = numFace(grid.design, true)(px);
  ctx.textBaseline = 'middle';
  setLetterSpacing(ctx, mini ? '0px' : `${String(px * 0.12)}px`);
  for (let column = 0; column < 7; column++) {
    const weekday = (column + grid.weekStart) % 7;
    const name = WEEKDAYS.at(weekday) ?? '';
    ctx.fillStyle = weekday === 0 && grid.design.cal.sundays ? grid.accent : hexA(grid.ink, 0.7);
    ctx.textAlign = corner ? 'left' : 'center';
    const x = corner ? area.x + cellWidth * column + grid.padX : area.x + cellWidth * (column + 0.5);
    ctx.fillText(mini ? name.slice(0, 1) : name.toUpperCase(), x, area.y + headHeight / 2);
  }
  setLetterSpacing(ctx, '0px');
}

/**
 * The grid's rules: lines between the rows, and between the columns for boxes.
 * @param ctx the card's context
 * @param grid the grid
 */
function drawRules(ctx: CanvasRenderingContext2D, grid: DayGrid): void {
  const { area, cellWidth, rowHeight, rows, top } = grid;
  const style = grid.design.cal.grid;
  ctx.strokeStyle = hexA(grid.ink, style === 'boxes' ? 0.22 : 0.18);
  ctx.lineWidth = Math.max(1, Math.min(cellWidth, rowHeight) * 0.012);
  ctx.beginPath();
  for (let row = 0; row <= rows; row++) {
    ctx.moveTo(area.x, top + row * rowHeight);
    ctx.lineTo(area.x + area.w, top + row * rowHeight);
  }
  if (style === 'boxes') {
    for (let column = 0; column <= 7; column++) {
      ctx.moveTo(area.x + cellWidth * column, top);
      ctx.lineTo(area.x + cellWidth * column, top + rows * rowHeight);
    }
  }
  ctx.stroke();
}

/**
 * A rounded, lightly tinted square behind a date (Sundays in the accent).
 * @param ctx the card's context
 * @param grid the grid
 * @param column the cell's column
 * @param row the cell's row
 */
function drawTile(ctx: CanvasRenderingContext2D, grid: DayGrid, column: number, row: number): void {
  const { area, cellWidth, rowHeight, top } = grid;
  const inset = Math.min(cellWidth, rowHeight) * 0.06;
  ctx.fillStyle = isSunday(grid, column) ? hexA(grid.accent, 0.14) : hexA(grid.ink, 0.06);
  ctx.beginPath();
  ctx.roundRect(area.x + cellWidth * column + inset, top + rowHeight * row + inset, cellWidth - 2 * inset, rowHeight - 2 * inset, Math.min(cellWidth, rowHeight) * 0.16);
  ctx.fill();
}

/** Where a day number sits in its cell: top-left, bottom-right, or centred. */
type NumberPlace = 'tl' | 'br' | 'c';

/** A day number to draw in its cell. */
interface DayNumber {
  day: number;
  column: number;
  row: number;
  px: number;
  place: NumberPlace;
  /** Shown in the accent: a Sunday or a red-letter day. */
  red: boolean;
}

/**
 * Draws a day number in its cell.
 * @param ctx the card's context
 * @param grid the grid
 * @param number the number and its place
 */
function drawDayNumber(ctx: CanvasRenderingContext2D, grid: DayGrid, number: DayNumber): void {
  const { cellWidth, rowHeight, padX, padY } = grid;
  ctx.font = numFace(grid.design, grid.mini ? false : grid.design.cal.numBold)(number.px);
  ctx.fillStyle = isSunday(grid, number.column) || number.red ? grid.accent : grid.ink;
  const left = grid.area.x + cellWidth * number.column;
  const top = grid.top + rowHeight * number.row;
  const text = String(number.day);
  if (number.place === 'c') {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, left + cellWidth / 2, top + rowHeight / 2);
  } else if (number.place === 'tl') {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(text, left + padX, top + padY);
  } else {
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(text, left + cellWidth - padX, top + rowHeight - padY);
  }
}

/**
 * A cell's box.
 * @param grid the grid
 * @param column the cell's column
 * @param row the cell's row
 * @returns the cell, pixels
 */
const cellAt = (grid: DayGrid, column: number, row: number): Rect => ({
  x: grid.area.x + grid.cellWidth * column,
  y: grid.top + grid.rowHeight * row,
  w: grid.cellWidth,
  h: grid.rowHeight,
});

/** How a day's marks are drawn in its cell. */
interface MarkStyle {
  /** One dot per kind instead of the names. */
  dotsOnly: boolean;
  corner: boolean;
  /** Dots towards the left (a sixth-week day sharing the cell's bottom right). */
  right: boolean;
}

/**
 * A sixth-week day in the last row's cell it shares: its number at the bottom right, its marks as dots, and the
 * diagonal between the two numbers.
 * @param ctx the card's context
 * @param grid the grid
 * @param day the day
 * @param column its column
 * @param marks the month's marked days
 */
function drawSixthWeekDay(ctx: CanvasRenderingContext2D, grid: DayGrid, day: number, column: number, marks: Map<number, DayMark[]>): void {
  const { area, cellWidth, rowHeight, top } = grid;
  const row = grid.rows - 1;
  drawDayNumber(ctx, grid, { day, column, row, px: grid.numberPx * 0.78, place: 'br', red: isRedLetter(marks, day) });
  const dayMarks = marks.get(day);
  if (dayMarks) drawMarks(ctx, dayMarks, cellAt(grid, column, row), { dotsOnly: true, corner: grid.corner, right: true }, grid);
  ctx.strokeStyle = hexA(grid.ink, 0.25);
  ctx.lineWidth = Math.max(1, cellWidth * 0.01);
  ctx.beginPath();
  ctx.moveTo(area.x + cellWidth * column + cellWidth * 0.28, top + rowHeight * (row + 1) - rowHeight * 0.18);
  ctx.lineTo(area.x + cellWidth * (column + 1) - cellWidth * 0.28, top + rowHeight * row + rowHeight * 0.18);
  ctx.stroke();
}

/**
 * National days and festivals are red-letter days, like Sundays; the user's own dates only get a label.
 * @param marks the month's marked days
 * @param day the day
 * @returns true for a red-letter day
 */
const isRedLetter = (marks: Map<number, DayMark[]>, day: number): boolean => !!marks.get(day)?.some((mark) => mark.kind !== 'own');

/**
 * A day in its own cell: its number and marks. A cell shared with a sixth-week day gets both numbers, smaller, split
 * by a diagonal (drawSixthWeekDay draws the other).
 * @param ctx the card's context
 * @param grid the grid
 * @param cell the day and its cell's column and row
 * @param cell.day the day
 * @param cell.column its column
 * @param cell.row its row
 * @param marks the month's marked days
 */
function drawDay(ctx: CanvasRenderingContext2D, grid: DayGrid, cell: { day: number; column: number; row: number }, marks: Map<number, DayMark[]>): void {
  const { day, column, row } = cell;
  const cellIndex = grid.first + day - 1;
  const shared = !grid.mini && row === grid.rows - 1 && cellIndex + 7 < grid.first + grid.days;
  const place: NumberPlace = shared || grid.corner ? 'tl' : 'c';
  drawDayNumber(ctx, grid, { day, column, row, px: shared ? grid.numberPx * 0.78 : grid.numberPx, place, red: isRedLetter(marks, day) });
  const dayMarks = marks.get(day);
  if (dayMarks) {
    const style = { dotsOnly: grid.mini || shared || !grid.design.cal.markNames, corner: grid.corner, right: false };
    drawMarks(ctx, dayMarks, cellAt(grid, column, row), style, grid);
  }
}

/**
 * The weekday row and the day grid (rules or tiles, numbers, marked days).
 * @param ctx the card's context
 * @param area the grid's box
 * @param month the year and month
 * @param design the design
 * @param colours the ink and accent
 * @param mini whether this is the year page's version
 */
function drawDays(
  ctx: CanvasRenderingContext2D,
  area: Rect,
  month: { year: number; month: number },
  design: Design,
  colours: { ink: string; accent: string },
  mini: boolean,
): void {
  const grid = measureGrid(area, month, design, colours, mini);
  ctx.save();
  drawWeekdays(ctx, grid);
  if (!mini && (design.cal.grid === 'lines' || design.cal.grid === 'boxes')) drawRules(ctx, grid);
  const tiles = !mini && design.cal.grid === 'tiles';
  const tiled = new Set<number>();
  const marks = marksFor(month.year, month.month, design.cal.marks, design.cal.ownDates);
  for (let day = 1; day <= grid.days; day++) {
    const cellIndex = grid.first + day - 1;
    const column = cellIndex % 7;
    const row = Math.floor(cellIndex / 7);
    const tileRow = Math.min(row, grid.rows - 1);
    if (tiles && !tiled.has(tileRow * 7 + column)) {
      tiled.add(tileRow * 7 + column);
      drawTile(ctx, grid, column, tileRow);
    }
    if (row >= grid.rows) drawSixthWeekDay(ctx, grid, day, column, marks);
    else drawDay(ctx, grid, { day, column, row }, marks);
  }
  ctx.restore();
}

/**
 * A marked day's dots: one small dot per kind (the user's own, red-letter).
 * @param ctx the card's context
 * @param marks the day's marks
 * @param cell the day's cell
 * @param right whether towards the left of the cell (a shared cell's second day)
 * @param ink the grid's ink
 * @param accent the grid's accent
 */
function drawMarkDots(ctx: CanvasRenderingContext2D, marks: DayMark[], cell: Rect, right: boolean, ink: string, accent: string): void {
  const radius = Math.max(0.6, Math.min(cell.w, cell.h) * 0.045);
  const kinds = [...new Set(marks.map((mark) => (mark.kind === 'own' ? 'own' : 'red')))];
  const centreX = right ? cell.x + cell.w * 0.3 : cell.x + cell.w / 2;
  const centreY = cell.y + cell.h * 0.86;
  kinds.forEach((kind, index) => {
    ctx.fillStyle = kind === 'own' ? hexA(ink, 0.75) : accent;
    ctx.beginPath();
    ctx.arc(centreX + (index - (kinds.length - 1) / 2) * radius * 3, centreY, radius, 0, Math.PI * 2);
    ctx.fill();
  });
}

/**
 * Cuts text short with an ellipsis until it fits a width.
 * @param ctx the context, its font set
 * @param text the text
 * @param maxWidth the width, pixels
 * @returns the text, or its start and "…"
 */
function fitWithEllipsis(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let shortened = text;
  while (shortened.length > 1 && ctx.measureText(shortened + '…').width > maxWidth) shortened = shortened.slice(0, -1);
  return shortened.trimEnd() + '…';
}

/**
 * A marked day in its cell: the names in small type along the bottom (up to two lines, the rest cut short), or,
 * when there's no room (year grid, shared "23/30" cells, names turned off), one small dot per kind.
 * @param ctx the card's context
 * @param marks the day's marks
 * @param cell the day's cell
 * @param style dots or names, and where
 * @param grid the grid (its design, ink and accent)
 */
function drawMarks(ctx: CanvasRenderingContext2D, marks: DayMark[], cell: Rect, style: MarkStyle, grid: DayGrid): void {
  const { ink, accent } = grid;
  ctx.save();
  if (style.dotsOnly) {
    drawMarkDots(ctx, marks, cell, style.right, ink, accent);
    ctx.restore();
    return;
  }
  const pad = cell.w * 0.1;
  const maxWidth = cell.w - pad * 2;
  const px = Math.max(3, Math.min(cell.h * 0.19, cell.w * 0.14));
  const twoLines = cell.h > px * 4.2;
  ctx.font = numFace(grid.design, false)(px);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = style.corner ? 'left' : 'center';
  const shown = marks.slice(0, twoLines ? 2 : 1);
  const x = style.corner ? cell.x + pad : cell.x + cell.w / 2;
  shown.forEach((mark, index) => {
    const more = !twoLines && marks.length > 1 && index === 0 ? ` +${String(marks.length - 1)}` : '';
    ctx.fillStyle = mark.kind === 'own' ? hexA(ink, 0.85) : accent;
    ctx.fillText(fitWithEllipsis(ctx, mark.name + more, maxWidth), x, cell.y + cell.h - pad * 0.7 - (shown.length - 1 - index) * px * 1.15);
  });
  ctx.restore();
}

/**
 * "Big number" calendars: the month as a large two-digit number ("01"–"12") in the accent colour.
 * @param ctx the card's context
 * @param area the number's box
 * @param month the month, 0–11
 * @param design the design
 * @param accent the accent colour
 */
export function drawMonthNumber(ctx: CanvasRenderingContext2D, area: Rect, month: number, design: Design, accent: string): void {
  const label = String(month + 1).padStart(2, '0');
  const face = numFace(design, true);
  ctx.font = face(100);
  const startPx = (area.h / Math.max(1, capHeight(ctx))) * 100;
  // Sized on the widest pair of digits so every page uses the same size.
  const px = shrinkFont(ctx, face, startPx, () => ctx.measureText('00').width <= area.w, { factor: 0.94, minPx: 4 });
  ctx.save();
  ctx.fillStyle = accent;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  setLetterSpacing(ctx, `${String(-px * 0.04)}px`);
  ctx.fillText(label, area.x - px * 0.04, area.y + area.h);
  setLetterSpacing(ctx, '0px');
  ctx.restore();
}

/** Where a month page's title and grid go. */
export interface MonthPage {
  /** The title's box, or null without a title. */
  title: Rect | null;
  grid: Rect;
}

/**
 * A month page: the title and the day grid, aligned to each other (a left title lines up with the first column's
 * numbers).
 * @param ctx the card's context
 * @param page where the title and grid go
 * @param month the year and month
 * @param design the design
 * @param colours the ink and accent
 */
export function drawMonth(
  ctx: CanvasRenderingContext2D,
  page: MonthPage,
  month: { year: number; month: number },
  design: Design,
  colours: { ink: string; accent: string },
): void {
  ctx.save();
  if (page.title) {
    const title: MonthTitle = {
      label: MONTHS.at(month.month) ?? '',
      year: design.cal.showYear ? String(month.year) : null,
      ...colours,
      inset: design.cal.numbers === 'corner' ? (page.grid.w / 7) * 0.13 : 0,
    };
    drawMonthTitle(ctx, page.title, title, design);
  }
  drawDays(ctx, page.grid, month, design, colours, false);
  ctx.restore();
}

/**
 * How many columns the twelve small months take for a box's shape.
 * @param ratio the box's width over its height
 * @returns 6, 4 or 3
 */
function yearColumns(ratio: number): number {
  if (ratio > 2.4) return 6;
  return ratio > 1.05 ? 4 : 3;
}

/**
 * Twelve small months in a grid, from the calendar's start month. Used on the year page and the Year strip.
 * @param ctx the card's context
 * @param area the grid's box
 * @param design the design
 * @param colours the ink and accent
 */
export function drawYearGrid(ctx: CanvasRenderingContext2D, area: Rect, design: Design, colours: { ink: string; accent: string }): void {
  const yearDesign: Design = { ...design, cal: { ...design.cal, months: 12 } };
  const columns = yearColumns(area.w / area.h);
  const rows = 12 / columns;
  const gapX = area.w * (columns === 6 ? 0.03 : 0.05);
  const monthWidth = (area.w - (columns - 1) * gapX) / columns;
  const gapY = Math.min(area.h * 0.05, monthWidth * 0.14);
  const monthHeight = (area.h - (rows - 1) * gapY) / rows;
  const family = fontDef(design.cal.font || design.headFont);
  const left = design.cal.titleAlign === 'left';
  const face: FontFace = (px) => fontStr(family.n, family.hw, px);
  // Month names share one size (the widest name decides), so the rows line up.
  const widest = () => Math.max(...MONTHS.map((month) => ctx.measureText(month).width));
  const px = shrinkFont(ctx, face, Math.min(monthHeight * 0.13, monthWidth * 0.15), () => widest() <= monthWidth * 0.92, { factor: 0.93, minPx: 3 });
  const titleHeight = px * 1.6;
  for (let index = 0; index < 12; index++) {
    const shown = calMonth(yearDesign, index);
    const x = area.x + (index % columns) * (monthWidth + gapX);
    const y = area.y + Math.floor(index / columns) * (monthHeight + gapY);
    ctx.save();
    ctx.font = face(px);
    ctx.fillStyle = colours.accent;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = left ? 'left' : 'center';
    ctx.fillText(MONTHS.at(shown.month) ?? '', left ? x + (monthWidth / 7) * 0.2 : x + monthWidth / 2, y + titleHeight / 2 + capHeight(ctx) / 2);
    ctx.restore();
    drawDays(ctx, { x, y: y + titleHeight, w: monthWidth, h: monthHeight - titleHeight }, shown, design, colours, true);
  }
}

/**
 * The year title.
 * @param design the design
 * @returns "2027", or "2027–28" for a year that starts mid-year
 */
function yearLabel(design: Design): string {
  const yearDesign: Design = { ...design, cal: { ...design.cal, months: 12 } };
  const firstYear = calMonth(yearDesign, 0).year;
  const lastYear = calMonth(yearDesign, 11).year;
  return firstYear === lastYear ? String(firstYear) : `${String(firstYear)}–${String(lastYear).slice(2)}`;
}

/**
 * The Year strip's title: the year, in the month font, aligned like the month titles.
 * @param ctx the card's context
 * @param area the title's box
 * @param design the design
 * @param ink the ink
 */
export function drawYearTitle(ctx: CanvasRenderingContext2D, area: Rect, design: Design, ink: string): void {
  const family = fontDef(design.cal.font || design.headFont);
  const label = yearLabel(design);
  shrinkFont(ctx, (px) => fontStr(family.n, family.hw, px), area.h * 0.85, () => ctx.measureText(label).width <= area.w, { factor: 0.93, minPx: 4 });
  ctx.save();
  ctx.fillStyle = ink;
  ctx.textBaseline = 'alphabetic';
  const left = design.cal.titleAlign === 'left';
  ctx.textAlign = left ? 'left' : 'center';
  ctx.fillText(label, left ? area.x : area.x + area.w / 2, area.y + area.h / 2 + capHeight(ctx) / 2);
  ctx.restore();
}

/**
 * The back's title (the greeting, or the year) and up to two lines of subtitle (the quote).
 * @param ctx the card's context
 * @param design the design
 * @param top the title's top, pixels
 * @param column the text column (left and width) and its anchor
 * @param unit the card's drawing unit
 * @param ink the back's ink
 * @returns the bottom of the words, pixels
 */
function drawYearBackTitle(
  ctx: CanvasRenderingContext2D,
  design: Design,
  top: number,
  column: { x: number; w: number; anchor: number },
  unit: number,
  ink: string,
): number {
  const family = fontDef(design.cal.titleFont || design.cal.font || design.headFont);
  const title = (design.showHeading && design.heading.trim()) || yearLabel(design);
  const subtitle = design.cal.backQuote ? design.quote.trim() : '';
  ctx.save();
  ctx.fillStyle = ink;
  ctx.textAlign = design.cal.titleAlign === 'left' ? 'left' : 'center';
  ctx.textBaseline = 'alphabetic';
  const px = shrinkFont(ctx, (size) => fontStr(family.n, family.hw, size), unit * 9, () => ctx.measureText(title).width <= column.w, { factor: 0.92, minPx: unit * 3 });
  let y = top + capHeight(ctx);
  ctx.fillText(title, column.anchor, y);
  y += px * 0.35;
  if (subtitle) {
    const quoteFamily = fontDef(design.quoteFont);
    let lines: string[] = [];
    const quotePx = shrinkFont(
      ctx,
      (size) => fontStr(quoteFamily.n, quoteFamily.bw, size),
      unit * 3.6,
      () => {
        lines = wrapLines(ctx, subtitle, column.w);
        return lines.length <= 2;
      },
      { factor: 0.92, minPx: unit * 2 },
    );
    ctx.fillStyle = hexA(ink, 0.8);
    for (const line of lines.slice(0, 2)) {
      y += quotePx * 1.35;
      ctx.fillText(line, column.anchor, y);
    }
  }
  ctx.restore();
  return y;
}

/**
 * The back of a calendar: the whole year at a glance under the greeting (or the year) and an optional subtitle.
 * @param ctx the card's context
 * @param box the card
 * @param design the design
 */
export function drawYearBack(ctx: CanvasRenderingContext2D, box: Box, design: Design): void {
  const theme = resolveTheme(design);
  const unit = cardUnit(box);
  const bleed = box.e;
  const pad = unit * 7;
  const ink = darkInk(theme);
  const left = design.cal.titleAlign === 'left';
  const inner = { x: box.x + pad, w: box.w - 2 * pad };
  ctx.fillStyle = design.back.tint ? mix('#FFFFFF', theme.bg1, 0.08) : '#FFFFFF';
  fillWithBleed(ctx, box);
  ctx.fillStyle = theme.bg1;
  ctx.fillRect(box.x - bleed, box.y - bleed, box.w + 2 * bleed, unit * 2.2 + bleed);
  ctx.fillRect(box.x - bleed, box.y + box.h - unit * 2.2, box.w + 2 * bleed, unit * 2.2 + bleed);
  const anchor = left ? inner.x : box.x + box.w / 2;
  const wordsEnd = drawYearBackTitle(ctx, design, box.y + pad, { ...inner, anchor }, unit, ink);
  const top = wordsEnd + unit * 5;
  const accent = lum(theme.accent) > 0.6 ? mix(theme.accent, ink, 0.45) : theme.accent;
  drawYearGrid(ctx, { x: inner.x, y: top, w: inner.w, h: box.y + box.h - pad - top }, design, { ink, accent });
}
