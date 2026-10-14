/*
 * A small writer over jsPDF for the print-shop documents (quote.ts): flowing text, fact lists, tables that break
 * across pages, rows of images, blank lines to fill in and a running footer, in jsPDF's standard Helvetica (so text
 * is kept to Latin-1). Also turns pictures into JPEG data URLs for it.
 */

/** A jsPDF document. */
export type Doc = InstanceType<typeof import('jspdf').jsPDF>;

/** An RGB colour, 0–255 each. */
type Rgb = readonly [number, number, number];

/** A4 portrait, mm. */
export const PAGE_W = 210;
const PAGE_H = 297;
/** The page margin, mm. */
export const MARGIN = 16;
/** The width between the margins, mm. */
export const CONTENT = PAGE_W - 2 * MARGIN;
/** Headings and rules. */
export const UMBER: Rgb = [122, 74, 43];
/** Body text. */
export const INK: Rgb = [42, 36, 30];
/** Secondary text. */
export const MUTED: Rgb = [106, 94, 82];
const LINE: Rgb = [214, 202, 184];
const TINT: Rgb = [246, 238, 226];
/** Where content stops above the footer, mm from the top. */
const CONTENT_BOTTOM = PAGE_H - MARGIN - 8;

/**
 * Text that jsPDF's standard fonts can draw: they cover Latin-1 only, so the few other characters our data uses are
 * swapped, and anything else is dropped.
 * @param text any text
 * @returns Latin-1 text
 */
export const latin = (text: string): string =>
  text
    .replace(/⅛/g, '1/8')
    .replace(/(\d)⅜/g, '$1 3/8')
    .replace(/⅜/g, '3/8')
    .replace(/→/g, '->')
    .replace(/✦/g, '*')
    .replace(/₹/g, 'Rs ')
    // eslint-disable-next-line no-control-regex -- keeps every Latin-1 character the PDF font can draw
    .replace(/[^\u0000-ÿ–—‘’“”•…]/g, '');

/** A table column: its header, width (mm) and alignment. */
export interface TableColumn {
  label: string;
  w: number;
  align?: 'left' | 'right' | 'center';
}

/** A picture for the PDF: a JPEG data URL ('' when it failed to load) and its size in px. */
export interface PdfImage {
  data: string;
  w: number;
  h: number;
}

/**
 * Where a cell's text starts for its alignment.
 * @param column the column
 * @param left the column's left edge, mm
 * @returns x, mm
 */
function cellX(column: TableColumn, left: number): number {
  if (column.align === 'right') return left + column.w - 2;
  if (column.align === 'center') return left + column.w / 2;
  return left + 2;
}

/** A small writer over jsPDF: flowing text, tables that break across pages, images and a running footer. */
export class Writer {
  /** Where the next block starts, mm from the top. */
  y = MARGIN;

  /**
   * A writer for a document.
   * @param doc the jsPDF document
   * @param title the document's title, repeated in the footer
   */
  constructor(
    readonly doc: Doc,
    readonly title: string,
  ) {}

  /**
   * Starts a new page when a block of some height wouldn't fit on this one.
   * @param height the block's height, mm
   */
  ensure(height: number): void {
    if (this.y + height > CONTENT_BOTTOM) this.page();
  }

  /** Starts a new page. */
  page(): void {
    this.doc.addPage('a4', 'p');
    this.y = MARGIN;
  }

  /**
   * Sets the font.
   * @param size pt
   * @param style normal, bold or italic
   * @param color the text colour
   */
  font(size: number, style: 'normal' | 'bold' | 'italic' = 'normal', color: Rgb = INK): void {
    this.doc.setFont('helvetica', style);
    this.doc.setFontSize(size);
    this.doc.setTextColor(...color);
  }

  /**
   * A section heading with a short rule under it.
   * @param text the heading
   * @param size pt
   */
  heading(text: string, size = 16): void {
    this.ensure(size * 0.6 + 6);
    this.font(size, 'bold', UMBER);
    this.doc.text(latin(text), MARGIN, this.y + size * 0.35);
    this.y += size * 0.45 + 3;
    this.doc.setDrawColor(...UMBER);
    this.doc.setLineWidth(0.5);
    this.doc.line(MARGIN, this.y, MARGIN + 24, this.y);
    this.y += 4;
  }

  /**
   * A subheading.
   * @param text the subheading
   */
  subheading(text: string): void {
    this.ensure(9);
    this.font(10.5, 'bold', INK);
    this.doc.text(latin(text), MARGIN, this.y + 3.5);
    this.y += 6.5;
  }

  /**
   * A paragraph, wrapped.
   * @param text the paragraph
   * @param size pt
   * @param color the text colour
   * @param width the width to wrap at, mm
   */
  paragraph(text: string, size = 9.5, color: Rgb = MUTED, width = CONTENT): void {
    this.font(size, 'normal', color);
    const lines = this.doc.splitTextToSize(latin(text), width) as string[];
    const lineHeight = size * 0.42;
    this.ensure(lines.length * lineHeight + 2);
    this.doc.text(lines, MARGIN, this.y + size * 0.3);
    this.y += lines.length * lineHeight + 2.5;
  }

  /**
   * A bulleted list, each item wrapped.
   * @param items the items
   * @param size pt
   */
  bullets(items: string[], size = 9.5): void {
    for (const item of items) {
      this.font(size, 'normal', INK);
      const lines = this.doc.splitTextToSize(latin(item), CONTENT - 5) as string[];
      const lineHeight = size * 0.42;
      this.ensure(lines.length * lineHeight + 1.5);
      this.doc.setFillColor(...UMBER);
      this.doc.circle(MARGIN + 1.2, this.y + 1.8, 0.7, 'F');
      this.doc.text(lines, MARGIN + 4.5, this.y + size * 0.3);
      this.y += lines.length * lineHeight + 1.6;
    }
    this.y += 1.5;
  }

  /**
   * A two-column label / value list with wrapping values.
   * @param rows label and value
   */
  facts(rows: [string, string][]): void {
    const labelWidth = 38;
    for (const [label, value] of rows) {
      this.font(9.2, 'normal', INK);
      const lines = this.doc.splitTextToSize(latin(value), CONTENT - labelWidth - 3) as string[];
      const height = Math.max(1, lines.length) * 3.9 + 2.6;
      this.ensure(height);
      this.doc.setFillColor(...TINT);
      this.doc.rect(MARGIN, this.y, labelWidth, height, 'F');
      this.font(8.6, 'bold', MUTED);
      this.doc.text(latin(label), MARGIN + 2, this.y + 4.2);
      this.font(9.2, 'normal', INK);
      this.doc.text(lines, MARGIN + labelWidth + 3, this.y + 4.2);
      this.doc.setDrawColor(...LINE);
      this.doc.setLineWidth(0.2);
      this.doc.line(MARGIN, this.y + height, MARGIN + CONTENT, this.y + height);
      this.y += height;
    }
    this.y += 4;
  }

  /**
   * A table's header row.
   * @param columns the columns
   * @param rowHeight mm
   */
  private tableHeader(columns: TableColumn[], rowHeight: number): void {
    this.doc.setFillColor(...UMBER);
    this.doc.rect(MARGIN, this.y, CONTENT, rowHeight, 'F');
    this.font(7.8, 'bold', [255, 250, 241]);
    let x = MARGIN;
    for (const column of columns) {
      this.doc.text(latin(column.label), cellX(column, x), this.y + rowHeight / 2 + 1.3, { align: column.align ?? 'left', maxWidth: column.w - 3 });
      x += column.w;
    }
    this.y += rowHeight;
  }

  /**
   * A table row's cells, the text centred in the row, with the column lines.
   * @param columns the columns
   * @param cells each cell's wrapped lines
   * @param height the row's height, mm
   */
  private tableCells(columns: TableColumn[], cells: string[][], height: number): void {
    this.font(8.4, 'normal', INK);
    let x = MARGIN;
    columns.forEach((column, index) => {
      const lines = cells.at(index) ?? [];
      if (lines.length && lines.at(0)) {
        const top = this.y + height / 2 - ((lines.length - 1) * 3.5) / 2 + 1.3;
        this.doc.text(lines, cellX(column, x), top, { align: column.align ?? 'left' });
      }
      this.doc.setDrawColor(...LINE);
      this.doc.setLineWidth(0.15);
      this.doc.line(x, this.y, x, this.y + height);
      x += column.w;
    });
    this.doc.line(MARGIN + CONTENT, this.y, MARGIN + CONTENT, this.y + height);
    this.doc.line(MARGIN, this.y + height, MARGIN + CONTENT, this.y + height);
  }

  /**
   * A table with a repeating header; cells wrap and each row grows to its tallest cell. Empty cells are left for the
   * printer to fill in.
   * @param columns the columns
   * @param rows each row's cells
   * @param rowHeight the smallest row height, mm
   */
  table(columns: TableColumn[], rows: string[][], rowHeight = 7): void {
    this.ensure(rowHeight * 2);
    this.tableHeader(columns, rowHeight);
    rows.forEach((row, rowIndex) => {
      this.font(8.4, 'normal', INK);
      const cells = columns.map((column, index) => this.doc.splitTextToSize(latin(row.at(index) ?? ''), column.w - 3) as string[]);
      const height = Math.max(rowHeight, Math.max(...cells.map((lines) => lines.length)) * 3.5 + 3.5);
      if (this.y + height > CONTENT_BOTTOM) {
        this.page();
        this.tableHeader(columns, rowHeight);
      }
      if (rowIndex % 2) {
        this.doc.setFillColor(...TINT);
        this.doc.rect(MARGIN, this.y, CONTENT, height, 'F');
      }
      this.tableCells(columns, cells, height);
      this.y += height;
    });
    this.y += 5;
  }

  /**
   * A row of images scaled to one height (smaller if they don't fit across), centred; images that failed to load
   * are skipped.
   * @param list the images
   * @param height their height, mm
   * @param gap between them, mm
   */
  images(list: PdfImage[], height: number, gap = 5): void {
    const loaded = list.filter((image) => image.data);
    if (!loaded.length) return;
    let imageHeight = height;
    let total = loaded.reduce((sum, image) => sum + (image.w / image.h) * imageHeight, 0) + gap * (loaded.length - 1);
    if (total > CONTENT) {
      imageHeight *= (CONTENT - gap * (loaded.length - 1)) / (total - gap * (loaded.length - 1));
      total = CONTENT;
    }
    this.ensure(imageHeight + 4);
    let x = MARGIN + (CONTENT - total) / 2;
    for (const image of loaded) {
      const width = (image.w / image.h) * imageHeight;
      this.doc.setFillColor(232, 224, 212);
      this.doc.rect(x + 0.8, this.y + 0.8, width, imageHeight, 'F');
      this.doc.addImage(image.data, 'JPEG', x, this.y, width, imageHeight, undefined, 'FAST');
      x += width + gap;
    }
    this.y += imageHeight + 5;
  }

  /**
   * Labelled blank lines for the customer or the printer to fill in.
   * @param labels the labels
   * @param columns how many side by side
   */
  blanks(labels: string[], columns = 2): void {
    const width = (CONTENT - (columns - 1) * 6) / columns;
    for (let index = 0; index < labels.length; index += columns) {
      this.ensure(11);
      labels.slice(index, index + columns).forEach((label, column) => {
        const x = MARGIN + column * (width + 6);
        this.font(8, 'bold', MUTED);
        this.doc.text(latin(label), x, this.y + 3);
        this.doc.setDrawColor(...LINE);
        this.doc.setLineWidth(0.3);
        this.doc.line(x, this.y + 9, x + width, this.y + 9);
      });
      this.y += 12;
    }
    this.y += 2;
  }

  /** The running footer on every page: the title, "Page n of m" and a rule. */
  footer(): void {
    const count = this.doc.getNumberOfPages();
    for (let page = 1; page <= count; page++) {
      this.doc.setPage(page);
      this.font(7.5, 'normal', MUTED);
      this.doc.text(latin(this.title), MARGIN, PAGE_H - 9);
      this.doc.text(`Page ${page} of ${count}`, PAGE_W - MARGIN, PAGE_H - 9, { align: 'right' });
      this.doc.setDrawColor(...LINE);
      this.doc.line(MARGIN, PAGE_H - 13, PAGE_W - MARGIN, PAGE_H - 13);
    }
  }
}

/** An image that failed to load: the writer skips it. */
export const NO_IMAGE: PdfImage = { data: '', w: 1, h: 1 };

/**
 * A picture as a JPEG data URL, on white, scaled to at most a width.
 * @param source an image URL or a canvas
 * @param maxWidth px
 * @returns the JPEG and its size, or NO_IMAGE when it can't be read
 */
export async function jpegOf(source: string | HTMLCanvasElement, maxWidth = 900): Promise<PdfImage> {
  try {
    let image: CanvasImageSource;
    let width: number;
    let height: number;
    if (typeof source === 'string') {
      const bitmap = await createImageBitmap(await (await fetch(source)).blob());
      image = bitmap;
      width = bitmap.width;
      height = bitmap.height;
    } else {
      image = source;
      width = source.width;
      height = source.height;
    }
    const scale = Math.min(1, maxWidth / width);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const context = canvas.getContext('2d');
    if (!context) return { ...NO_IMAGE };
    context.fillStyle = '#FFFFFF';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return { data: canvas.toDataURL('image/jpeg', 0.86), w: canvas.width, h: canvas.height };
  } catch {
    return { ...NO_IMAGE };
  }
}
