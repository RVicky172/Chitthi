export type Orient = 'landscape' | 'portrait';
export type Side = 'front' | 'back';
export type FrameStyle = 'white' | 'cream' | 'black' | 'occasion';
export type VAlign = 'top' | 'middle' | 'bottom';
export type HAlign = 'left' | 'center' | 'right';
export type ExportFormat = 'pdf' | 'sheet' | 'png';
export type SheetId = 'a4' | 'a3' | '1319' | 'letter';
export type LookId = 'none' | 'vivid' | 'warm' | 'cool' | 'bw' | 'vintage';
export type ThemeGroup = 'Festivals' | 'Birthdays' | 'Seasons';
export type PaneId = 'size' | 'occasion' | 'photos' | 'layout' | 'words' | 'back' | 'print' | 'gallery';
export type FontCat = 'ind' | 'reg' | 'disp' | 'scr' | 'ss';
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
  | 'text';
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
  grp: 'Postcards' | 'Instax style' | 'Large and custom';
  name: string;
  L: number;
  S: number;
  inch?: string;
  tag?: string;
  instax?: { w: number; h: number; side: number; top: number };
  native?: Orient;
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

export interface Design {
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
export type SlotShape = 'rect' | 'arch' | 'circle' | 'round';
export interface Slot extends Rect {
  s: SlotShape;
  bleed?: boolean;
  d: Rect;
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
}
export interface RenderInput {
  d: Design;
  photos: Photo[];
}
export interface RenderOpts {
  layout?: LayoutId;
  hint?: boolean;
  thumb?: boolean;
  guides?: boolean;
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
}
