import {
  ArrowRight,
  Box,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Crop,
  Download,
  Frame,
  ImagePlus,
  Images,
  LayoutGrid,
  LayoutTemplate,
  Magnet,
  Mail,
  Moon,
  Package,
  Pencil,
  Plus,
  Printer,
  Redo2,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  Star,
  Sun,
  Trash2,
  Type,
  Undo2,
  X,
  type LucideProps,
} from 'lucide-react';
import type { PaneId, ProductId } from '../types';

/*
 * App icons: Lucide line icons (24x24 grid, currentColor), one consistent stroke across the app.
 * They size to their container via CSS (.btn svg = 17px); outside a sized box they default to 24px.
 */
const base: LucideProps = { strokeWidth: 1.9, 'aria-hidden': true };

const PANE_ICONS = { photos: Images, layout: LayoutTemplate, occasion: Sparkles, words: Type, back: Mail, print: Printer };
export const PaneIcon = ({ id }: { id: PaneId }) => {
  const I = PANE_ICONS[id];
  return <I {...base} />;
};

const PRODUCT_ICONS = { postcard: Mail, calendar: CalendarDays, frame: Frame, magnet: Magnet };
export const ProductIcon = ({ id }: { id: ProductId }) => {
  const I = PRODUCT_ICONS[id];
  return <I {...base} />;
};

export const GalleryIcon = () => <LayoutGrid {...base} />;
export const CheckIcon = () => <Check {...base} strokeWidth={2.6} />;
export const UndoIcon = () => <Undo2 {...base} />;
export const RedoIcon = () => <Redo2 {...base} />;
export const SaveIcon = () => <Save {...base} />;
export const DownloadIcon = () => <Download {...base} strokeWidth={2.1} />;
export const CubeIcon = () => <Box {...base} />;
export const SunIcon = () => <Sun {...base} />;
export const MoonIcon = () => <Moon {...base} />;
export const ArrowIcon = () => <ArrowRight {...base} strokeWidth={2.1} />;
export const PrevIcon = () => <ChevronLeft {...base} strokeWidth={2.2} />;
export const NextIcon = () => <ChevronRight {...base} strokeWidth={2.2} />;
export const CloseIcon = () => <X {...base} strokeWidth={2.1} />;
export const PlusIcon = () => <Plus {...base} strokeWidth={2.1} />;
export const AddPhotoIcon = () => <ImagePlus {...base} strokeWidth={1.6} />;
export const CropIcon = () => <Crop {...base} />;
export const ResetIcon = () => <RotateCcw {...base} />;
export const StarIcon = () => <Star {...base} />;
export const TrashIcon = () => <Trash2 {...base} />;
export const EditIcon = () => <Pencil {...base} />;
export const PackIcon = () => <Package {...base} />;
export const SearchIcon = () => <Search {...base} />;

/** Brand glyph (Lucide no longer ships brand logos), drawn on the same 24px grid and stroke. */
export const InstagramIcon = () => (
  <svg width={24} height={24} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4.2" />
    <circle cx="17.4" cy="6.6" r="0.6" fill="currentColor" />
  </svg>
);

export const Logo = () => (
  <svg className="logo" viewBox="0 0 120 120" aria-hidden="true">
    <defs>
      <path id="ring" d="M60,60 m-40,0 a40,40 0 1,1 80,0 a40,40 0 1,1 -80,0" />
    </defs>
    <circle cx="60" cy="60" r="52" fill="none" stroke="currentColor" strokeWidth="3.5" />
    <circle cx="60" cy="60" r="31" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <text fontFamily="Hind, sans-serif" fontSize="11.5" fontWeight="600" letterSpacing="2.2" fill="currentColor">
      <textPath href="#ring" startOffset="2%">
        CHITTHI ✦ POSTCARD STUDIO ✦
      </textPath>
    </text>
    <text x="60" y="68" textAnchor="middle" fontFamily="Rozha One, serif" fontSize="21" fill="currentColor">
      चिट्ठी
    </text>
  </svg>
);
