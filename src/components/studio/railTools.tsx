import { BrushIcon, ImageIcon, LayersIcon, MaskIcon, MusicIcon, ShapesIcon, TransitionIcon, TypeIcon } from '../icons';
import type { RailItem } from './Shell';

/*
 * The media studio's tool rails (501 §2, docs/DESIGN.md): each tool's rail heading (Add brings things in, Edit
 * changes what is there) and its panel's lead. Kept apart from the workspaces so tests can read them.
 */

/** The Reel and YouTube editors' tools. */
export type VideoTool = 'media' | 'text' | 'elements' | 'draw' | 'transitions' | 'audio' | 'layers';
export const VIDEO_RAIL: readonly RailItem<VideoTool>[] = [
  { id: 'media', label: 'Media', icon: <ImageIcon />, group: 'add', lead: 'Videos and photos from this device, for the timeline.' },
  { id: 'text', label: 'Text', icon: <TypeIcon />, group: 'add', lead: 'Choose a style to put text on the frame at the playhead.' },
  { id: 'elements', label: 'Elements', icon: <ShapesIcon />, group: 'add', lead: 'Pictures, shapes and stickers to put on the frame.' },
  { id: 'draw', label: 'Draw', icon: <BrushIcon />, group: 'add', minor: true, lead: 'Draw on the frame with a brush.' },
  { id: 'audio', label: 'Audio', icon: <MusicIcon />, group: 'add', lead: 'Add songs, voice-overs or effects from this device: they go at the playhead.' },
  { id: 'transitions', label: 'Transitions', icon: <TransitionIcon />, group: 'edit', lead: 'A transition plays across the cut between two clips.' },
  { id: 'layers', label: 'Layers', icon: <LayersIcon />, group: 'edit', lead: 'Everything added to the video, the top one first.' },
];

/** The photo editor's tools. */
export type PhotoTool = 'media' | 'masks' | 'text' | 'elements' | 'draw' | 'layers';
export const PHOTO_RAIL: readonly RailItem<PhotoTool>[] = [
  { id: 'media', label: 'Photos', icon: <ImageIcon />, group: 'add', lead: 'Photos from this device or your photo library, for the batch.' },
  { id: 'text', label: 'Text', icon: <TypeIcon />, group: 'add', lead: 'Choose a style to put text on the photo.' },
  { id: 'elements', label: 'Elements', icon: <ShapesIcon />, group: 'add', lead: 'Pictures, shapes and stickers to put on the photo.' },
  { id: 'draw', label: 'Draw', icon: <BrushIcon />, group: 'add', lead: 'Draw on the photo with a brush.' },
  { id: 'masks', label: 'Masks', icon: <MaskIcon />, group: 'edit', lead: 'A mask limits its own settings to part of the photo.' },
  { id: 'layers', label: 'Layers', icon: <LayersIcon />, group: 'edit', lead: 'Everything added to this photo, the top one first.' },
];
