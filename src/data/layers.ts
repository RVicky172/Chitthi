/*
 * What can be put over an Instagram photo or video (engine/layers.ts draws it): ready-made shapes that can hold words,
 * emoji stickers, text styles, drawing brushes and a colour palette.
 */

export type ShapeId = 'rect' | 'round' | 'circle' | 'pill' | 'bubble' | 'burst' | 'star' | 'heart' | 'banner' | 'arrow' | 'line';

/** id, name, default size (width and height, as a share of the frame width), and whether words fit inside. */
export const SHAPES: { id: ShapeId; name: string; w: number; h: number; holdsText: boolean }[] = [
  { id: 'round', name: 'Rounded box', w: 0.6, h: 0.22, holdsText: true },
  { id: 'rect', name: 'Box', w: 0.6, h: 0.22, holdsText: true },
  { id: 'pill', name: 'Label', w: 0.5, h: 0.12, holdsText: true },
  { id: 'circle', name: 'Circle', w: 0.34, h: 0.34, holdsText: true },
  { id: 'bubble', name: 'Speech bubble', w: 0.5, h: 0.3, holdsText: true },
  { id: 'burst', name: 'Burst', w: 0.36, h: 0.36, holdsText: true },
  { id: 'banner', name: 'Ribbon', w: 0.7, h: 0.14, holdsText: true },
  { id: 'star', name: 'Star', w: 0.3, h: 0.3, holdsText: false },
  { id: 'heart', name: 'Heart', w: 0.3, h: 0.27, holdsText: false },
  { id: 'arrow', name: 'Arrow', w: 0.4, h: 0.12, holdsText: false },
  { id: 'line', name: 'Line', w: 0.5, h: 0.02, holdsText: false },
];
export const shapeDef = (id: ShapeId) => SHAPES.find((s) => s.id === id) ?? SHAPES[0];

/** Emoji stickers: celebrations and Indian festivals first, then everyday ones. */
export const STICKERS = [
  '🪔', '🎉', '🎂', '🎁', '🎈', '🎊', '🌸', '🌼', '💐', '🌺', '✨', '⭐', '🌟', '❤️', '💛', '🧡',
  '😍', '🥳', '😂', '🙏', '👏', '👑', '💯', '🔥', '🌈', '☀️', '🌙', '🌊', '🏖️', '✈️', '📸', '🎶',
  '🍰', '☕', '🌿', '🦋', '🐾', '🏏', '🪁', '💌',
];

export const PALETTE = ['#ffffff', '#111111', '#f4c430', '#ff6b35', '#e63946', '#d81b60', '#8e44ad', '#2a9d8f', '#1d4ed8', '#7cb518', '#b5835a', '#ffd6e0'];

/** Font families offered first for text over photos (any card font or uploaded font can be chosen too). */
export const TEXT_FONTS = ['Poppins', 'Montserrat', 'Bebas Neue', 'Playfair Display', 'Pacifico', 'Caveat', 'Dancing Script', 'Lobster', 'Rozha One', 'Mukta', 'Kalam', 'Abril Fatface'];

export interface TextStyle {
  id: string;
  name: string;
  font: string;
  color: string;
  bold: boolean;
  italic: boolean;
  outline: string;
  bg: string;
  shadow: boolean;
}

/** One-tap looks for new text. */
export const TEXT_STYLES: TextStyle[] = [
  { id: 'classic', name: 'Classic', font: 'Poppins', color: '#ffffff', bold: true, italic: false, outline: '', bg: '', shadow: true },
  { id: 'outline', name: 'Outline', font: 'Bebas Neue', color: '#ffffff', bold: false, italic: false, outline: '#111111', bg: '', shadow: false },
  { id: 'label', name: 'Label', font: 'Montserrat', color: '#111111', bold: true, italic: false, outline: '', bg: '#ffffff', shadow: false },
  { id: 'serif', name: 'Elegant', font: 'Playfair Display', color: '#ffffff', bold: false, italic: true, outline: '', bg: '', shadow: true },
  { id: 'script', name: 'Script', font: 'Pacifico', color: '#f4c430', bold: false, italic: false, outline: '', bg: '', shadow: true },
  { id: 'hand', name: 'Handwritten', font: 'Caveat', color: '#111111', bold: true, italic: false, outline: '', bg: '#ffd6e0', shadow: false },
];

export type BrushId = 'pen' | 'marker' | 'highlighter' | 'neon';
/** Brush: name, width (share of the frame width), opacity, and whether it glows. */
export const BRUSHES: { id: BrushId; name: string; width: number; alpha: number; glow: boolean }[] = [
  { id: 'pen', name: 'Pen', width: 0.008, alpha: 1, glow: false },
  { id: 'marker', name: 'Marker', width: 0.02, alpha: 1, glow: false },
  { id: 'highlighter', name: 'Highlighter', width: 0.04, alpha: 0.4, glow: false },
  { id: 'neon', name: 'Neon', width: 0.012, alpha: 1, glow: true },
];
export const brushDef = (id: BrushId) => BRUSHES.find((b) => b.id === id) ?? BRUSHES[0];
