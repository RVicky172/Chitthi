import { useEffect, useState } from 'react';
import { IG_FORMATS, igFormat } from '../../data/instagram';
import { toast } from '../../lib/toast';
import { getIg, redo, selectLayer, setIg, setTools, undo, useIg, type IgItem } from '../../state/instagram';
import { addLayer, copyLayersToAll, removeLayer, restackLayer, updateLayer } from '../../state/instagramLayers';
import { AddElements, AddText, DrawPanel, LayerList, LayerProps, typingIn, type LayerPanelProps } from '../ig/LayerPanel';
import { MaskInspector, MaskPanel } from '../ig/MaskPanel';
import { DownloadIcon, RedoIcon, UndoIcon } from '../icons';
import { MoreMenu } from '../MoreMenu';
import { StudioDialog } from './Dialog';
import { PhotoEditPanel } from './PhotoEditPanel';
import { PhotoExport } from './PhotoExport';
import { EmptyPhotoStage, PhotoMediaPanel } from './PhotoPanels';
import { PhotoStage } from './PhotoStage';
import { PhotoStrip } from './PhotoStrip';
import { StudioShell, type StudioMode } from './Shell';
import { PHOTO_RAIL as RAIL, type PhotoTool as Tool } from './railTools';

/*
 * The Instagram photo editor in the studio layout: up to 20 photos in one format, each with its own framing, colour
 * and layers, exported as files or shared to the Instagram app. State: state/instagram.ts; drawing:
 * engine/instagram.ts and engine/layers.ts. The stage is PhotoStage.tsx, the inspector PhotoEditPanel.tsx, the strip
 * PhotoStrip.tsx, the export PhotoExport.tsx.
 */


/** What the stage does with a press for each tool: draw layers, paint masks, or select. */
const STAGE_TOOLS: Partial<Record<Tool, 'draw' | 'mask'>> = { draw: 'draw', masks: 'mask' };

/** Ctrl + Z / Ctrl + Y (or Ctrl + Shift + Z) undo and redo, anywhere but in a field. */
function useUndoKeys(): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || typingIn(event.target)) return;
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if (key === 'y' || (key === 'z' && event.shiftKey)) {
        event.preventDefault();
        redo();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
}

/**
 * The layer panels' props for a photo.
 * @param item the photo
 * @param layerSel the selected layer
 * @returns the props the layer panels share
 */
const layerPanelProps = (item: IgItem, layerSel: string | null): LayerPanelProps => ({
  layers: item.layers,
  selected: layerSel,
  onSelect: selectLayer,
  onAdd: (layer) => addLayer(item.id, layer),
  onUpdate: (id, patch, key) => updateLayer(item.id, id, patch, key),
  onRemove: (id) => removeLayer(item.id, id),
  onRestack: (id, by) => restackLayer(item.id, id, by),
});

/** The panel for the rail's tool. */
interface ToolPanelProps {
  tool: Tool | null;
  item: IgItem | undefined;
  layerProps: LayerPanelProps | null;
}

/**
 * The Layers panel, with copying the layers to every photo when the batch has more than one.
 * @param props the photo and the layer panels' props
 */
function LayersPanel({ item, layerProps }: Readonly<{ item: IgItem; layerProps: LayerPanelProps }>) {
  const hasMany = useIg((state) => state.items.length > 1);
  const copyButton =
    hasMany && item.layers.length > 0 ? (
      <button
        type="button"
        className="sbtn"
        onClick={() => {
          copyLayersToAll(item.id);
          toast('Layers copied to every photo in the batch.');
        }}
      >
        Copy these layers to every photo
      </button>
    ) : null;
  return <LayerList {...layerProps} extra={copyButton} />;
}

/**
 * The panel for the rail's tool (everything but Photos needs a photo first).
 * @param props the tool, the selected photo and the layer panels' props
 */
function ToolPanel({ tool, item, layerProps }: Readonly<ToolPanelProps>) {
  if (tool === 'media') return <PhotoMediaPanel />;
  if (!item || !layerProps) return <p className="hint mst-pad">Add photos first: choose Photos in the tool rail.</p>;
  if (tool === 'masks') return <MaskPanel item={item} />;
  if (tool === 'text') return <AddText {...layerProps} />;
  if (tool === 'elements') return <AddElements {...layerProps} />;
  if (tool === 'draw') return <DrawPanel tools={getIg().tools} onTools={setTools} onNewDrawing={() => selectLayer(null)} />;
  return <LayersPanel item={item} layerProps={layerProps} />;
}

/** The inspector. */
interface InspectorProps {
  tool: Tool | null;
  item: IgItem | undefined;
  layerProps: LayerPanelProps | null;
}

/**
 * The inspector: the selected mask (with the Masks tool open), else the selected layer, else the photo.
 * @param props the tool, the selected photo and the layer panels' props
 */
function Inspector({ tool, item, layerProps }: Readonly<InspectorProps>) {
  const maskSel = useIg((state) => state.maskSel);
  const layerSel = useIg((state) => state.layerSel);
  if (!item) return <p className="hint mst-pad">Nothing selected yet.</p>;
  if (tool === 'masks' && maskSel && item.edit.masks.some((mask) => mask.id === maskSel)) return <MaskInspector item={item} />;
  if (layerSel && layerProps) return <LayerProps {...layerProps} />;
  return <PhotoEditPanel item={item} />;
}

/**
 * Undo, redo, the post format and Export.
 * @param props opening the export dialog
 */
function WorkspaceActions({ onExport }: Readonly<{ onExport: () => void }>) {
  const hasItems = useIg((state) => state.items.length > 0);
  const formatId = useIg((state) => state.format);
  const canUndo = useIg((state) => state.canUndo);
  const canRedo = useIg((state) => state.canRedo);
  const format = igFormat(formatId);
  return (
    <>
      <button type="button" className="btn icon ghost" aria-label="Undo (Ctrl+Z)" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo}>
        <UndoIcon />
      </button>
      <button type="button" className="btn icon ghost" aria-label="Redo (Ctrl+Y)" title="Redo (Ctrl+Y)" disabled={!canRedo} onClick={redo}>
        <RedoIcon />
      </button>
      <MoreMenu
        className="mst-format"
        text={`${format.ratio} ${format.label}`}
        label="Post format"
        items={IG_FORMATS.map((option) => ({
          key: option.id,
          label: `${option.ratio} · ${option.label} (${option.w}×${option.h})`,
          current: option.id === formatId,
          onSelect: () => setIg({ format: option.id }),
        }))}
      />
      <button type="button" className="btn primary" aria-label="Export" disabled={!hasItems} onClick={onExport}>
        <DownloadIcon />
        <span className="mst-l">Export</span>
      </button>
    </>
  );
}

/** The photo editor. */
interface PhotoWorkspaceProps {
  mode: StudioMode;
  onMode: (mode: StudioMode) => void;
}

/**
 * The Instagram photo editor (see the file's comment).
 * @param props the studio mode and switching it
 */
export function PhotoWorkspace({ mode, onMode }: Readonly<PhotoWorkspaceProps>) {
  const items = useIg((state) => state.items);
  const selected = useIg((state) => state.selected);
  const layerSel = useIg((state) => state.layerSel);
  const [tool, setTool] = useState<Tool | null>(() => (getIg().items.length ? 'text' : 'media'));
  const [isExporting, setExporting] = useState(false);
  const current = items.find((item) => item.id === selected) ?? items.at(0);
  // The Draw tool draws layers on the stage; the Masks tool paints the selected mask.
  useEffect(() => {
    setTools({ tool: (tool && STAGE_TOOLS[tool]) ?? 'select' });
    return () => setTools({ tool: 'select' });
  }, [tool]);
  useUndoKeys();
  const layerProps = current ? layerPanelProps(current, layerSel) : null;

  return (
    <StudioShell
      mode={mode}
      onMode={onMode}
      rail={RAIL}
      tool={tool}
      onTool={setTool}
      actions={<WorkspaceActions onExport={() => setExporting(true)} />}
      panel={<ToolPanel tool={tool} item={current} layerProps={layerProps} />}
      inspector={<Inspector tool={tool} item={current} layerProps={layerProps} />}
      stage={current ? <PhotoStage item={current} /> : <EmptyPhotoStage onAdd={() => setTool('media')} />}
      dock={<PhotoStrip />}
    >
      <StudioDialog open={isExporting} onClose={() => setExporting(false)} title="Export and post">
        <PhotoExport />
      </StudioDialog>
    </StudioShell>
  );
}
