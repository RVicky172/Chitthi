import { useEffect, useState } from 'react';
import { adjacentKey, keyState, layersAt, type LayerKeyProp } from '../../engine/keyframes';
import { formatsFor, vFormat } from '../../engine/videoFormats';
import { isDesktop } from '../../platform/desktop';
import { addVLayer, removeVLayer, restackVLayer, setLayerTimes, updateLayerAt } from '../../state/videoLayers';
import { getVideo, redoV, selectVLayer, setKind, setPlayhead, setPlaying, setVideoOptions, setVTools, undoV, useVideo, videoLength } from '../../state/videoStore';
import { AddElements, AddText, DrawPanel, LayerList, LayerProps, typingIn, type LayerPanelProps } from '../ig/LayerPanel';
import { BrushIcon, DownloadIcon, ImageIcon, LayersIcon, MusicIcon, RedoIcon, ShapesIcon, TransitionIcon, TypeIcon, UndoIcon } from '../icons';
import { MoreMenu } from '../MoreMenu';
import { ClipInspector, ProjectInspector } from './ClipInspector';
import { OPEN_TRANSITIONS } from './CutMarks';
import { StudioDialog } from './Dialog';
import { KeyframeNav } from './KeyframeButton';
import { StudioShell, type RailItem, type StudioMode } from './Shell';
import { Timeline } from './Timeline';
import { tell } from './timelineActions';
import { TransitionInspector, TransitionPanel } from './TransitionPanel';
import { Transport } from './Transport';
import { KeyButton } from './videoFields';
import { VideoExport } from './VideoExport';
import { EmptyStage, MediaPanel, MusicPanel } from './VideoPanels';
import { VideoStage } from './VideoStage';

/*
 * The video editor in the studio layout, for Reels / Shorts (vertical, short, shared to Instagram) and YouTube videos
 * (16:9, long, saved to a file). The stage plays the timeline live (VideoStage.tsx); the timeline below edits it
 * directly; the inspector shows the selected clip (ClipInspector.tsx), layer or transition. State: state/video*.ts
 * (videoStore.ts and its actions); drawing: engine/video.ts; export: engine/videoExport.ts (loaded on export,
 * VideoExport.tsx).
 */

/** The tool rail's tools. */
type Tool = 'media' | 'text' | 'elements' | 'draw' | 'transitions' | 'audio' | 'layers';
const RAIL: RailItem<Tool>[] = [
  { id: 'media', label: 'Media', icon: <ImageIcon /> },
  { id: 'text', label: 'Text', icon: <TypeIcon /> },
  { id: 'elements', label: 'Elements', icon: <ShapesIcon /> },
  { id: 'draw', label: 'Draw', icon: <BrushIcon /> },
  { id: 'transitions', label: 'Transitions', icon: <TransitionIcon /> },
  { id: 'audio', label: 'Audio', icon: <MusicIcon /> },
  { id: 'layers', label: 'Layers', icon: <LayersIcon /> },
];

/** Ctrl + Z / Ctrl + Y (or Ctrl + Shift + Z) undo and redo, and Space plays and pauses, anywhere but in a field. */
function useWorkspaceKeys(): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (typingIn(event.target)) return;
      const key = event.key.toLowerCase();
      const withCommand = event.ctrlKey || event.metaKey;
      if (withCommand && key === 'z' && !event.shiftKey) {
        event.preventDefault();
        undoV();
      } else if (withCommand && (key === 'y' || (key === 'z' && event.shiftKey))) {
        event.preventDefault();
        redoV();
      } else if (key === ' ' && !(event.target instanceof HTMLButtonElement) && !(event.target instanceof Element && event.target.closest('.tl-scroll'))) {
        event.preventDefault();
        setPlaying(!getVideo().playing);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
}

/**
 * The layer panels' props: the layers as shown at the playhead (205): the fields show animated values, and changes go
 * through the router, so an animated value gets a keyframe there. A new start alone is the layer's start edge (its
 * keyframes stay in place).
 * @returns the props the layer panels share
 */
function useLayerPanelProps(): LayerPanelProps {
  const layers = useVideo((state) => state.layers);
  const layerSel = useVideo((state) => state.layerSel);
  const time = useVideo((state) => state.t);
  const total = useVideo(videoLength);
  const selectedLayer = layers.find((layer) => layer.id === layerSel);
  const start = selectedLayer?.start ?? 0;
  const local = time - start;
  const previous = selectedLayer ? adjacentKey(selectedLayer, local, -1) : null;
  const next = selectedLayer ? adjacentKey(selectedLayer, local, 1) : null;
  return {
    layers: layersAt(layers, time),
    selected: layerSel,
    onSelect: selectVLayer,
    onAdd: addVLayer,
    onUpdate: (id, patch, key) =>
      tell(typeof patch === 'object' && 'start' in patch && !('end' in patch) ? setLayerTimes(id, { start: patch.start }, key) : updateLayerAt(id, patch, key)),
    keyframes: (props: LayerKeyProp[], label: string) =>
      selectedLayer && <KeyButton target={{ layer: selectedLayer.id }} props={props} label={label} state={keyState(props[0] && selectedLayer.keys?.[props[0]], local)} time={time} />,
    keyNav: selectedLayer?.keys && (
      <KeyframeNav what="layer" previous={previous === null ? null : start + previous} next={next === null ? null : start + next} onSeek={setPlayhead} />
    ),
    onRemove: removeVLayer,
    onRestack: restackVLayer,
    timing: { duration: total, now: time },
  };
}

/** The panel for the rail's tool. */
interface ToolPanelProps {
  tool: Tool | null;
  layerProps: LayerPanelProps;
}

/**
 * The panel for the rail's tool (the layer tools need clips first).
 * @param props the tool and the layer panels' props
 */
function ToolPanel({ tool, layerProps }: Readonly<ToolPanelProps>) {
  const hasClips = useVideo((state) => state.clips.length > 0);
  const tools = useVideo((state) => state.tools);
  if (tool === 'media') return <MediaPanel />;
  if (tool === 'audio') return <MusicPanel />;
  if (!hasClips) return <p className="hint mst-pad">Add photos or videos first: choose Media in the tool rail.</p>;
  if (tool === 'text') return <AddText {...layerProps} />;
  if (tool === 'elements') return <AddElements {...layerProps} />;
  if (tool === 'draw') return <DrawPanel tools={tools} onTools={setVTools} onNewDrawing={() => selectVLayer(null)} />;
  if (tool === 'transitions') return <TransitionPanel />;
  return <LayerList {...layerProps} />;
}

/** The inspector. */
interface InspectorProps {
  layerProps: LayerPanelProps;
}

/**
 * The inspector: the selected layer, else the selected cut's transition (206), else the selected clip, else the project.
 * @param props the layer panels' props
 */
function Inspector({ layerProps }: Readonly<InspectorProps>) {
  const clips = useVideo((state) => state.clips);
  const layerSel = useVideo((state) => state.layerSel);
  const selected = useVideo((state) => state.selected);
  const transitionSel = useVideo((state) => state.transitionSel);
  if (layerSel) return <LayerProps {...layerProps} />;
  const cut = clips.find((clip) => clip.id === transitionSel);
  if (cut) return <TransitionInspector clip={cut} />;
  const clip = clips.find((candidate) => candidate.id === selected);
  return clip ? <ClipInspector clip={clip} /> : <ProjectInspector />;
}

/** The top bar's actions. */
interface WorkspaceActionsProps {
  kind: 'reel' | 'vlog';
  onExport: () => void;
}

/**
 * Undo, redo, the video format and Export.
 * @param props Reel or YouTube video, and opening the export dialog
 */
function WorkspaceActions({ kind, onExport }: Readonly<WorkspaceActionsProps>) {
  const hasClips = useVideo((state) => state.clips.length > 0);
  const formatId = useVideo((state) => state.format);
  const canUndo = useVideo((state) => state.canUndo);
  const canRedo = useVideo((state) => state.canRedo);
  const format = vFormat(formatId);
  return (
    <>
      <button type="button" className="btn icon ghost" aria-label="Undo (Ctrl+Z)" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undoV}>
        <UndoIcon />
      </button>
      <button type="button" className="btn icon ghost" aria-label="Redo (Ctrl+Y)" title="Redo (Ctrl+Y)" disabled={!canRedo} onClick={redoV}>
        <RedoIcon />
      </button>
      <MoreMenu
        className="mst-format"
        text={`${format.ratio} ${format.label}`}
        label="Video format"
        items={formatsFor(kind).map((option) => ({
          key: option.id,
          label: `${option.ratio} · ${option.label} (${option.w}×${option.h})${option.desktopOnly && !isDesktop ? ' · desktop app' : ''}`,
          current: option.id === formatId,
          disabled: !!option.desktopOnly && !isDesktop,
          onSelect: () => setVideoOptions({ format: option.id }),
        }))}
      />
      <button type="button" className="btn primary" aria-label="Export" disabled={!hasClips} onClick={onExport}>
        <DownloadIcon />
        <span className="mst-l">Export</span>
      </button>
    </>
  );
}

/** The video editor. */
interface VideoWorkspaceProps {
  mode: Exclude<StudioMode, 'photos'>;
  onMode: (mode: StudioMode) => void;
}

/**
 * The video editor (see the file's comment).
 * @param props the studio mode (Reels or YouTube) and switching it
 */
export function VideoWorkspace({ mode, onMode }: Readonly<VideoWorkspaceProps>) {
  const kind = mode === 'vlog' ? 'vlog' : 'reel';
  useEffect(() => setKind(kind), [kind]);
  const hasClips = useVideo((state) => state.clips.length > 0);
  const [tool, setTool] = useState<Tool | null>(() => (getVideo().clips.length ? 'text' : 'media'));
  const [isExporting, setExporting] = useState(false);
  // The timeline's cuts open the Transitions panel (206 D2).
  useEffect(() => {
    const open = () => setTool('transitions');
    document.addEventListener(OPEN_TRANSITIONS, open);
    return () => document.removeEventListener(OPEN_TRANSITIONS, open);
  }, []);
  useEffect(() => {
    setVTools({ tool: tool === 'draw' ? 'draw' : 'select' });
    return () => setVTools({ tool: 'select' });
  }, [tool]);
  useEffect(() => () => setPlaying(false), []);
  useWorkspaceKeys();
  const layerProps = useLayerPanelProps();
  const openExport = () => {
    setPlaying(false);
    setExporting(true);
  };

  return (
    <StudioShell
      mode={mode}
      onMode={onMode}
      rail={RAIL}
      tool={tool}
      onTool={setTool}
      actions={<WorkspaceActions kind={kind} onExport={openExport} />}
      panel={<ToolPanel tool={tool} layerProps={layerProps} />}
      inspector={<Inspector layerProps={layerProps} />}
      stage={hasClips ? <VideoStage /> : <EmptyStage kind={kind} />}
      dock={
        <>
          <Transport />
          <Timeline />
        </>
      }
    >
      <StudioDialog open={isExporting} onClose={() => setExporting(false)} title={kind === 'vlog' ? 'Export for YouTube' : 'Export and post'}>
        <VideoExport />
      </StudioDialog>
    </StudioShell>
  );
}
