import {
  BookOpen,
  Activity,
  Blend,
  BetweenHorizontalStart,
  ArrowRight,
  Box,
  Brush,
  CalendarDays,
  Clapperboard,
  Copy,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Crop,
  Download,
  Ellipsis,
  Expand,
  FolderOpen,
  FlipHorizontal2,
  Maximize,
  Minimize,
  Frame,
  Image,
  ImagePlus,
  Images,
  Laptop,
  Layers,
  LayoutGrid,
  LayoutTemplate,
  Lightbulb,
  Magnet,
  ChevronsLeftRight,
  FoldHorizontal,
  MousePointer2,
  MoveHorizontal,
  SquareSplitHorizontal,
  Mail,
  Menu,
  MonitorPlay,
  Moon,
  Music,
  ChevronsUpDown,
  Eye,
  EyeOff,
  Lock,
  LockOpen,
  Volume2,
  VolumeX,
  Package,
  Pause,
  Pencil,
  Play,
  Plus,
  Printer,
  Redo2,
  RotateCcw,
  RotateCw,
  Ruler,
  Scissors,
  Save,
  Search,
  Settings,
  Shapes,
  Share2,
  SlidersHorizontal,
  SkipBack,
  SkipForward,
  Sparkles,
  Star,
  Sun,
  Trash2,
  Type,
  Undo2,
  WandSparkles,
  X,
  ZoomIn,
  ZoomOut,
  type LucideProps,
  Pipette,
} from 'lucide-react';
import type { PaneId, ProductId } from '../types';

/*
 * App icons: Lucide line icons (24x24 grid, currentColor), one consistent stroke across the app.
 * They size to their container via CSS (.btn svg = 17px); outside a sized box they default to 24px.
 */
const base: LucideProps = { strokeWidth: 1.9, 'aria-hidden': true };

const PANE_ICONS = {
  photos: Images,
  layout: LayoutTemplate,
  occasion: Sparkles,
  words: Type,
  back: Mail,
  print: Printer,
};
/**
 * A print studio pane's icon.
 * @param props the pane
 */
export function PaneIcon({ id }: Readonly<{ id: PaneId }>) {
  const Icon = PANE_ICONS[id];
  return <Icon {...base} />;
}

const PRODUCT_ICONS = { postcard: Mail, calendar: CalendarDays, frame: Frame, magnet: Magnet };
/**
 * A print product's icon.
 * @param props the product
 */
export function ProductIcon({ id }: Readonly<{ id: ProductId }>) {
  const Icon = PRODUCT_ICONS[id];
  return <Icon {...base} />;
}

/** The gallery icon. */
export function GalleryIcon() {
  return <LayoutGrid {...base} />;
}
/** The photos icon. */
export function PhotosIcon() {
  return <Images {...base} />;
}
/** The check icon. */
export function CheckIcon() {
  return <Check {...base} strokeWidth={2.6} />;
}
/** The undo icon. */
export function UndoIcon() {
  return <Undo2 {...base} />;
}
/** The redo icon. */
export function RedoIcon() {
  return <Redo2 {...base} />;
}
/** The save icon. */
export function SaveIcon() {
  return <Save {...base} />;
}
/** The download icon. */
export function DownloadIcon() {
  return <Download {...base} strokeWidth={2.1} />;
}
/** The cube icon (3D views). */
export function CubeIcon() {
  return <Box {...base} />;
}
/** The sun icon. */
export function SunIcon() {
  return <Sun {...base} />;
}
/** The moon icon. */
export function MoonIcon() {
  return <Moon {...base} />;
}
/** The arrow icon. */
export function ArrowIcon() {
  return <ArrowRight {...base} strokeWidth={2.1} />;
}
/** The chevron icon. */
export function ChevronIcon() {
  return <ChevronDown {...base} strokeWidth={2.2} />;
}
/** The expand icon. */
export function ExpandIcon() {
  return <Expand {...base} />;
}
/**
 * The full screen icon: leave full screen when in it, enter it otherwise.
 * @param props whether the window is full screen
 */
export function FullscreenIcon({ on }: Readonly<{ on: boolean }>) {
  return on ? <Minimize {...base} /> : <Maximize {...base} />;
}
/** The previous icon. */
export function PrevIcon() {
  return <ChevronLeft {...base} strokeWidth={2.2} />;
}
/** The next icon. */
export function NextIcon() {
  return <ChevronRight {...base} strokeWidth={2.2} />;
}
/** The close icon. */
export function CloseIcon() {
  return <X {...base} strokeWidth={2.1} />;
}
/** The plus icon. */
export function PlusIcon() {
  return <Plus {...base} strokeWidth={2.1} />;
}
/** The add photo icon. */
export function AddPhotoIcon() {
  return <ImagePlus {...base} strokeWidth={1.6} />;
}
/** The crop icon. */
export function CropIcon() {
  return <Crop {...base} />;
}
/** The reset icon. */
export function ResetIcon() {
  return <RotateCcw {...base} />;
}
/** The star icon. */
export function StarIcon() {
  return <Star {...base} />;
}
/** The trash icon. */
export function TrashIcon() {
  return <Trash2 {...base} />;
}
/** The edit icon. */
export function EditIcon() {
  return <Pencil {...base} />;
}
/** The pack icon (the print pack). */
export function PackIcon() {
  return <Package {...base} />;
}
/** The arrange icon. */
export function ArrangeIcon() {
  return <WandSparkles {...base} />;
}
/** The suggest icon. */
export function SuggestIcon() {
  return <Lightbulb {...base} />;
}
/** The search icon. */
export function SearchIcon() {
  return <Search {...base} />;
}
/** The settings icon. */
export function SettingsIcon() {
  return <Settings {...base} />;
}
/** The ruler icon. */
export function RulerIcon() {
  return <Ruler {...base} />;
}
/** The docs icon. */
export function DocsIcon() {
  return <BookOpen {...base} />;
}
/** The more icon. */
export function MoreIcon() {
  return <Ellipsis {...base} />;
}
/** The menu icon. */
export function MenuIcon() {
  return <Menu {...base} />;
}
/** The activity icon. */
export function ActivityIcon() {
  return <Activity {...base} />;
}
/** The rotate left icon. */
export function RotateLeftIcon() {
  return <RotateCcw {...base} />;
}
/** The rotate right icon. */
export function RotateRightIcon() {
  return <RotateCw {...base} />;
}
/** The flip icon. */
export function FlipIcon() {
  return <FlipHorizontal2 {...base} />;
}
/** The share icon. */
export function ShareIcon() {
  return <Share2 {...base} />;
}
/** The adjust icon. */
export function AdjustIcon() {
  return <SlidersHorizontal {...base} />;
}
/** The pipette icon. */
export function PipetteIcon() {
  return <Pipette {...base} />;
}
/** The reel icon (Reels and Shorts). */
export function ReelIcon() {
  return <Clapperboard {...base} />;
}
/** The YouTube icon (a monitor with a play button). */
export function YouTubeIcon() {
  return <MonitorPlay {...base} />;
}
/** The image icon. */
export function ImageIcon() {
  return <Image {...base} />;
}
/** The type icon. */
export function TypeIcon() {
  return <Type {...base} />;
}
/** The shapes icon. */
export function ShapesIcon() {
  return <Shapes {...base} />;
}
/** The brush icon. */
export function BrushIcon() {
  return <Brush {...base} />;
}
/** The mask icon (two overlapping circles). */
export function MaskIcon() {
  return <Blend {...base} />;
}
/** Transitions between clips (206): two clips meeting at a cut. */
export function TransitionIcon() {
  return <BetweenHorizontalStart {...base} />;
}
/** The music icon. */
export function MusicIcon() {
  return <Music {...base} />;
}
/**
 * Track headers: the icon shows the state (pressed = hidden, muted, locked). The hide icon: an eye, crossed out when hidden.
 * @param props whether the track is hidden
 */
export function HideIcon({ on }: Readonly<{ on: boolean }>) {
  return on ? <EyeOff {...base} /> : <Eye {...base} />;
}
/**
 * The mute icon: a speaker, crossed out when muted.
 * @param props whether the track is muted
 */
export function MuteIcon({ on }: Readonly<{ on: boolean }>) {
  return on ? <VolumeX {...base} /> : <Volume2 {...base} />;
}
/**
 * The lock icon: closed when locked, open when not.
 * @param props whether the track is locked
 */
export function LockIcon({ on }: Readonly<{ on: boolean }>) {
  return on ? <Lock {...base} /> : <LockOpen {...base} />;
}
/** The height icon. */
export function HeightIcon() {
  return <ChevronsUpDown {...base} />;
}
/** The layers icon. */
export function LayersIcon() {
  return <Layers {...base} />;
}
/** The scissors icon. */
export function ScissorsIcon() {
  return <Scissors {...base} />;
}
/** The timeline's edit tools (202) and its switches. */
const TOOL_ICONS = {
  select: MousePointer2,
  roll: SquareSplitHorizontal,
  slip: ChevronsLeftRight,
  slide: MoveHorizontal,
};
/**
 * A timeline edit tool's icon.
 * @param props the tool
 */
export function EditToolIcon({ tool }: Readonly<{ tool: keyof typeof TOOL_ICONS }>) {
  const Icon = TOOL_ICONS[tool];
  return <Icon {...base} />;
}
/** The magnetic icon. */
export function MagneticIcon() {
  return <FoldHorizontal {...base} />;
}
/** The snap icon. */
export function SnapIcon() {
  return <Magnet {...base} />;
}
/** The play icon. */
export function PlayIcon() {
  return <Play {...base} />;
}
/** The pause icon. */
export function PauseIcon() {
  return <Pause {...base} />;
}
/** The skip back icon. */
export function SkipBackIcon() {
  return <SkipBack {...base} />;
}
/** The skip forward icon. */
export function SkipForwardIcon() {
  return <SkipForward {...base} />;
}
/** The zoom in icon. */
export function ZoomInIcon() {
  return <ZoomIn {...base} />;
}
/** The zoom out icon. */
export function ZoomOutIcon() {
  return <ZoomOut {...base} />;
}
/** The copy icon. */
export function CopyIcon() {
  return <Copy {...base} />;
}
/** The folder icon. */
export function FolderIcon() {
  return <FolderOpen {...base} />;
}
/** The laptop icon. */
export function LaptopIcon() {
  return <Laptop {...base} />;
}

/** Brand glyph (Lucide no longer ships brand logos), drawn on the same 24px grid and stroke. */
export function InstagramIcon() {
  return (
    <svg
      width={24}
      height={24}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="17.4" cy="6.6" r="0.6" fill="currentColor" />
    </svg>
  );
}

/** Chitthi's postmark logo, with the name in Devanagari. */
export function Logo() {
  return (
    <svg className="logo" viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        <path id="ring" d="M60,60 m-40,0 a40,40 0 1,1 80,0 a40,40 0 1,1 -80,0" />
      </defs>
      <circle cx="60" cy="60" r="52" fill="none" stroke="currentColor" strokeWidth="3.5" />
      <circle cx="60" cy="60" r="31" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <text fontFamily="Hind, sans-serif" fontSize="11.5" fontWeight="600" fill="currentColor">
        {/* Spread evenly round the whole ring (circumference 251): the last ✦ meets the first letter. */}
        <textPath href="#ring" startOffset="1%" textLength="244" lengthAdjust="spacing">
          CHITTHI ✦ PRINT STUDIO ✦
        </textPath>
      </text>
      <text x="60" y="68" textAnchor="middle" fontFamily="Rozha One, serif" fontSize="21" fill="currentColor">
        चिट्ठी
      </text>
    </svg>
  );
}
