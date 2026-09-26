export type Orient = 'landscape' | 'portrait';
export type Side = 'front' | 'back';
export type FrameStyle = 'white' | 'cream' | 'black' | 'occasion';
export type ProductId = 'postcard' | 'calendar' | 'frame' | 'magnet';
export type MatWidth = 'none' | 'thin' | 'classic' | 'wide';
export type VAlign = 'top' | 'middle' | 'bottom';
export type HAlign = 'left' | 'center' | 'right';
export type ExportFormat = 'pdf' | 'sheet' | 'png';
export type SheetId = 'a4' | 'a3' | '1319' | 'letter';
export type LookId = 'none' | 'vivid' | 'warm' | 'cool' | 'bw' | 'vintage';
export type ThemeGroup = 'Festivals' | 'Birthdays' | 'Seasons';
export type PaneId = 'photos' | 'layout' | 'occasion' | 'words' | 'back' | 'print';
export type FontCat = 'ind' | 'reg' | 'disp' | 'scr' | 'ss' | 'own';
export type LayoutId =
  | 'full'
  | 'magazine'
  | 'band'
  | 'textfirst'
  | 'split'
  | 'sandwich'
  | 'polaroid'
  | 'instax'
  | 'photobooth'
  | 'arch'
  | 'window'
  | 'circle'
  | 'stamp'
  | 'collage2'
  | 'collage3'
  | 'mosaic'
  | 'collage4'
  | 'text'
  /* modern postcard layouts */
  | 'offset'
  | 'diagonal'
  | 'scrapbook'
  | 'filmstrip'
  | 'minimal'
  | 'twin-arch'
  /* photo frame prints */
  | 'frame-single'
  | 'frame-caption'
  | 'frame-duo'
  | 'frame-trio'
  | 'frame-grid'
  | 'frame-feature'
  /* calendars */
  | 'cal-top'
  | 'cal-side'
  | 'cal-full'
  | 'cal-duo'
  | 'cal-plain'
  | 'cal-strip'
  /* fridge magnets */
  | 'mag-full'
  | 'mag-caption'
  | 'mag-polaroid'
  | 'mag-duo'
  | 'mag-grid'
  | 'mag-badge'
  | 'mag-quote';
export type PatternName =
  | 'confetti'
  | 'balloons'
  | 'diya'
  | 'sparkle'
  | 'toran'
  | 'splash'
  | 'rakhi'
  | 'crescent'
  | 'snow'
  | 'stars'
  | 'kites'
  | 'rain'
  | 'leaves'
  | 'sunrays'
  | 'flowers'
  | 'mandala'
  | 'kolam'
  | 'peacock'
  | 'tricolor'
  | 'wheat'
  | 'sparks'
  | 'bunting';

export interface Theme {
  id: string;
  g: ThemeGroup | '';
  name: string;
  bg1: string;
  bg2: string;
  ink: string;
  accent: string;
  deep: string;
  pal: string[];
  bgP: PatternName[];
  over: PatternName | null;
  hf: string;
  qf: string;
  heads: string[];
  quotes: string[];
}
export interface SizeDef {
  id: string;
  grp: 'Postcards' | 'Instax style' | 'Large and custom' | 'Calendars' | 'Frame prints' | 'Fridge magnets';
  /** Products this size is offered for (postcard when omitted). */
  products?: ProductId[];
  name: string;
  L: number;
  S: number;
  inch?: string;
  tag?: string;
  instax?: { w: number; h: number; side: number; top: number };
  native?: Orient;
  /** Corner radius of the finished piece in mm (shown in the preview; the print file stays square for trimming). */
  corner?: number;
  /** Round pieces (button magnets): the design is trimmed to a circle. */
  shape?: 'circle';
}
export interface FontDef {
  n: string;
  c: FontCat;
  w: number[];
  note?: string;
  hw: number;
  bw: number;
}
export interface Crop {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Serialisable photo settings (stored in gallery and autosave). */
export interface PhotoMeta {
  name: string;
  url: string;
  rot: number;
  flip: boolean;
  crop: Crop;
  zoom: number;
  px: number;
  py: number;
  look: LookId;
}
/** A loaded photo with its processed (cropped / rotated / filtered) drawing source. */
export interface Photo extends PhotoMeta {
  id: string;
  orig: HTMLImageElement;
  src: CanvasImageSource;
  sw: number;
  sh: number;
}

export interface BackDesign {
  message: string;
  font: string;
  from: string;
  to: string;
  address: string;
  pin: string;
  stamp: boolean;
  label: boolean;
  tint: boolean;
}
/** The matching envelope, exported with the print pack and shown in 3D. */
export interface EnvelopeSettings {
  on: boolean;
  /** Flap shape. */
  style: 'pointed' | 'straight' | 'wallet';
  paper: 'occasion' | 'cream' | 'white' | 'kraft';
  /** Occasion artwork along the left edge of the front. */
  art: boolean;
  /** The card's first photo in the seal on the flap. */
  photo: boolean;
  /** Return address (the sender's name comes from the back's "From"). */
  sender: string;
}
export interface ExportSettings {
  format: ExportFormat;
  sheet: SheetId;
  bleed: string;
  dpi: string;
  quality: 'jpeg' | 'png';
  marks: boolean;
  back: boolean;
}
export interface PlainColours {
  bg: string;
  ink: string;
  accent: string;
  gradient: boolean;
}

export interface CalendarSettings {
  year: number;
  /** First month, 0 = January. */
  start: number;
  /** A single month page or a full year of pages. */
  months: 1 | 12;
  /** 0 = weeks start on Sunday, 1 = Monday. */
  weekStart: 0 | 1;
  /** Where the greeting / month captions go on month pages. */
  text: CalTextPlace;
  /** One caption per calendar month (index 0 = January); an empty one falls back to the greeting. */
  captions: string[];
  /** Month title alignment, shared by the month pages and the year page. */
  titleAlign: 'left' | 'center';
  /** Day numbers in the top-left corner of each cell or centred in it. */
  numbers: 'corner' | 'center';
  /** Day grid rules. */
  grid: 'lines' | 'boxes' | 'none';
  /** Font for month names and the year title (empty = the greeting font). */
  font: string;
  /** Font for the dates and weekday names (empty = Hind). */
  numFont: string;
  /** Dates in bold or regular weight. */
  numBold: boolean;
  /** Show the quote as a subtitle under the title on the year page. */
  backQuote: boolean;
}
export type CalTextPlace = 'off' | 'caption' | 'photo';

export interface Design {
  product: ProductId;
  sizeId: string;
  custom: { w: number; h: number };
  orient: Orient;
  useOccasion: boolean;
  themeId: string;
  group: ThemeGroup;
  artwork: boolean;
  decor: boolean;
  plain: PlainColours;
  layout: LayoutId;
  frame: FrameStyle;
  heading: string;
  quote: string;
  sig: string;
  showHeading: boolean;
  showQuote: boolean;
  showSig: boolean;
  /** Instagram username, stored without the leading @; drawn at the photo's bottom-right corner. */
  insta: string;
  headFont: string;
  quoteFont: string;
  textScale: number;
  vAlign: VAlign;
  hAlign: HAlign;
  customColor: boolean;
  color: string;
  scrim: boolean;
  ornament: boolean;
  back: BackDesign;
  exp: ExportSettings;
  cal: CalendarSettings;
  env: EnvelopeSettings;
  mat: MatWidth;
  designName: string;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Box extends Rect {
  e: number;
}
export type SlotShape = 'rect' | 'arch' | 'circle' | 'round' | 'poly';
export interface Slot extends Rect {
  s: SlotShape;
  bleed?: boolean;
  d: Rect;
  /** Polygon corners for s = 'poly' (the photo is clipped to them; d is their bounding box). */
  pts?: [number, number][];
  /** Tilt in radians, around the slot's centre (scrapbook prints). */
  rot?: number;
  /** Drawn as an instant print: a paper border with a deeper bottom, a shadow and a strip of tape. */
  print?: boolean;
}
export interface Layout {
  slots: Slot[];
  text: Rect | null;
  onPhoto: boolean;
  bg: boolean;
  band: Rect | null;
  overlay: boolean;
  paper: Rect | null;
  stamp: Rect | null;
  post: { x: number; y: number; r: number } | null;
  ink: 'frame' | null;
  frame: boolean;
  frameLine: number;
  /** Photo frame: draw a bevelled mat edge around each photo window. */
  mat?: boolean;
  /** Calendar: where the month name and the day grid go. */
  calTitle?: Rect;
  calGrid?: Rect;
  /** Calendar "Year strip": all twelve months in this box. */
  calYear?: Rect;
  /** Caption strips (magnet Polaroid and caption layouts): words are centred in the strip whatever vAlign says. */
  textCenter?: boolean;
  /** Text height as a share of the text zone's height (default 0.32); single-line caption bands use more. */
  textFill?: number;
  /** Limits the "darken the photo" scrim to this area (default: the whole card). */
  scrimArea?: Rect;
  /** Solid colour blocks drawn behind the photos (the offset layout). */
  blocks?: { r: Rect; c: 'accent' | 'deep' }[];
  /** A film strip band with sprocket holes, drawn behind its photo frames. */
  film?: { r: Rect; vertical: boolean };
  /** A fine accent hairline this far inside the trim (minimal layouts). */
  hairline?: number;
  /** Badge magnet: greeting on the top arc and signature on the bottom arc of this circle. */
  arc?: { x: number; y: number; r: number; band: number };
}
export interface RenderInput {
  d: Design;
  photos: Photo[];
}
export interface RenderOpts {
  layout?: LayoutId;
  /** Calendar month page (0-based from the start month). */
  page?: number;
  hint?: boolean;
  thumb?: boolean;
  guides?: boolean;
}

/** A photo kept in the photo store, reusable on any card. */
export interface StoredPhoto {
  id: string;
  name: string;
  url: string;
  added: number;
  /** Analysis results (engine/analyze.ts), stored so each photo is analysed once. */
  traits?: import('./engine/analyze').PhotoTraits;
}

export interface SavedDesign {
  id: string;
  name: string;
  updated: number;
  w: number;
  h: number;
  round: boolean;
  size: string;
  design: Design;
  photos: PhotoMeta[];
  front: string;
  back: string;
}
export interface ViewerFaces {
  front: string;
  back: string;
  w: number;
  h: number;
  round: boolean;
  title?: string;
  /** Corner radius in mm (overrides `round`). */
  corner?: number;
  circle?: boolean;
  /** Calendars: every month page, in order, for the all-months 3D views. */
  pages?: { src: string; label: string }[];
  /** The matching envelope as layers for the 3D envelope view (sizes in mm). */
  envelope?: { front: string; body: string; flap: string; liner: string; w: number; h: number; name: string };
  /** View to open on. */
  start?: 'card' | 'ring' | 'wall' | 'envelope';
}
