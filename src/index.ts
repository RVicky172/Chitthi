/*
 * Library entry for Chitthi's components (used by the Claude Design sync and any embedding).
 * Unlike main.tsx this never mounts the app: it only re-exports components and the store/actions that drive them.
 * Components read and write one shared app store, so set state with the exported setters (setUI, setDesign,
 * setPhotos, switchProduct, …) rather than props.
 */

/* ---------- screens ---------- */
export { default as App } from './App';
export { Landing } from './components/Landing';
export { Header } from './components/Header';
export { Rail } from './components/Rail';
export { Stage } from './components/Stage';
export { PhotoTray } from './components/PhotoTray';
export { MonthStrip } from './components/MonthStrip';

/* ---------- step panes ---------- */
export { PhotosPane } from './components/panes/PhotosPane';
export { LayoutPane } from './components/panes/LayoutPane';
export { OccasionPane } from './components/panes/OccasionPane';
export { WordsPane } from './components/panes/WordsPane';
export { BackPane } from './components/panes/BackPane';
export { PrintPane } from './components/panes/PrintPane';

/* ---------- overlays ---------- */
export { GalleryDialog } from './components/GalleryDialog';
export { CropDialog } from './components/CropDialog';
export { Viewer3D } from './components/Viewer3D';
export { SettingsDialog } from './components/SettingsDialog';
export { PhotoLibrary } from './components/PhotoLibrary';
export { FeatureFinder } from './components/FeatureFinder';
export { SizeGuide } from './components/SizeGuide';
export { Toast } from './components/Toast';

/* ---------- pickers and media ---------- */
export { FontPicker } from './components/FontPicker';
export { PhotoStore } from './components/PhotoStore';
export { PexelsSearch } from './components/PexelsSearch';
export { ThemeTile, LayoutThumb, PhotoThumb } from './components/canvases';

/* ---------- primitives ---------- */
export { Seg, Check, Pane, StepLabel } from './components/common';

/* ---------- icons ---------- */
export {
  PaneIcon,
  GalleryIcon,
  CheckIcon,
  InstagramIcon,
  UndoIcon,
  RedoIcon,
  SaveIcon,
  DownloadIcon,
  CubeIcon,
  SunIcon,
  MoonIcon,
  ProductIcon,
  ArrowIcon,
  PrevIcon,
  NextIcon,
  CloseIcon,
  PlusIcon,
  AddPhotoIcon,
  CropIcon,
  ResetIcon,
  StarIcon,
  TrashIcon,
  EditIcon,
  PackIcon,
  SearchIcon,
  SettingsIcon,
  RulerIcon,
  Logo,
} from './components/icons';
export { SampleGallery } from './components/SampleGallery';

/* ---------- state: the one app store every component reads ---------- */
export {
  useApp,
  getState,
  setUI,
  setDesign,
  setBack,
  setExp,
  setPlain,
  setPhotos,
  patchPhoto,
  replaceCard,
  bumpFonts,
  undo,
  redo,
} from './state/store';
export type { AppState, UIState } from './state/store';
export {
  applyTheme,
  setOccasion,
  selectSize,
  addFiles,
  switchProduct,
  startProduct,
  newCard,
  saveDesign,
  open3D,
  downloadPack,
  openSample,
} from './state/actions';
export { placePhoto, selectSlot } from './state/photoSlots';
export { putOnCard, storePhotos } from './state/library';

/* ---------- data and engine ---------- */
export { PRODUCTS, productOf } from './data/products';
export { LAYOUTS, layoutsFor } from './data/layouts';
export { SIZES } from './data/sizes';
export { TH as THEMES, themeById } from './data/themes';
export { productDesign } from './engine/design';
export { renderCard } from './engine/render';
export { samplePhoto } from './engine/sample';
export { SAMPLES, buildSample, sampleCredits } from './data/samples';
export { installFontLinks, ensureFonts, fontsFor } from './lib/fonts';
export { toast } from './lib/toast';
export type * from './types';
