import { formatTime } from '../../engine/timeline';
import { bitrateFor, vFormat, type VQuality } from '../../engine/videoFormats';
import { saveFile } from '../../lib/download';
import { logError } from '../../lib/errors';
import { canStreamToDisk } from '../../lib/fileSink';
import { toast } from '../../lib/toast';
import { desktop, isDesktop } from '../../platform/desktop';
import { getIg, setIg, useIg } from '../../state/instagram';
import { canShareFiles } from '../../state/instagramExport';
import { cancelExport, exportVideo } from '../../state/videoExportJob';
import { limits, setVideoOptions, useVideo, videoLength } from '../../state/videoStore';
import { Check, Seg } from '../common';
import { DownloadIcon, FolderIcon, InstagramIcon, ShareIcon, YouTubeIcon } from '../icons';
import { LimitsNote } from './VideoPanels';

/*
 * The video export dialog's contents: frame rate, quality and size, the caption (Reels) or where it is saved (YouTube),
 * the export with its progress, and posting to Instagram or opening YouTube's upload page.
 */

const INSTAGRAM_WEB = 'https://www.instagram.com/';
const YOUTUBE_UPLOAD = 'https://www.youtube.com/upload';

/**
 * A path's file name.
 * @param path a file path (either slash)
 * @returns its last part
 */
const fileName = (path: string): string => path.split(/[\\/]/).pop() ?? path;

/** Makes the video (in memory for a Reel, streamed to a file for YouTube) and says how it went. */
async function runExport(): Promise<void> {
  try {
    const exported = await exportVideo();
    if (exported?.kind === 'file') toast(`Video ready: ${(exported.file.size / 1048576).toFixed(1)} MB.`);
    if (exported?.kind === 'saved') toast(`Saved ${fileName(exported.name)}.`);
  } catch (error) {
    logError('handled', error);
    toast(error instanceof Error && error.message ? error.message : 'The video couldn’t be made.');
  }
}

/**
 * Posts a Reel: shares the file where the device can (the caption copied for pasting), else saves it and opens
 * Instagram.
 * @param video the exported video
 * @param isShareable whether this device can share the file
 */
async function postToInstagram(video: File, isShareable: boolean): Promise<void> {
  const text = getIg().caption;
  // The clipboard is missing outside secure contexts.
  if (text && 'clipboard' in navigator) await navigator.clipboard.writeText(text).catch(() => undefined);
  if (isShareable) {
    try {
      await navigator.share({ files: [video], text: text || undefined });
      if (text) toast('Caption copied: paste it into Instagram.');
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      logError('handled', error);
    }
  }
  await saveFile(video.name, video);
  if (desktop) await desktop.openExternal(INSTAGRAM_WEB);
  else window.open(INSTAGRAM_WEB, '_blank', 'noopener');
  toast('Video saved. On Instagram, choose Create (+), then Reel, and select it.');
}

/** The video's format, frame rate, quality, size estimate and fade. */
function ExportSettings() {
  const kind = useVideo((state) => state.kind);
  const format = vFormat(useVideo((state) => state.format));
  const fps = useVideo((state) => state.fps);
  const fadeOut = useVideo((state) => state.fadeOut);
  const quality = useVideo((state) => state.quality);
  const total = useVideo(videoLength);
  const bitrate = bitrateFor(format, fps, quality);
  const sizeMB = ((bitrate + 128000) / 8 / 1048576) * total;
  const size = sizeMB >= 1024 ? (sizeMB / 1024).toFixed(1) + ' GB' : String(Math.max(1, Math.round(sizeMB))) + ' MB';
  return (
    <div>
      <h3>Video</h3>
      <p className="hint">
        {format.ratio} {format.label} · {format.w}×{format.h} · H.264 + AAC sound · {formatTime(total)}
      </p>
      {limits(kind).fps.length > 1 && (
        <>
          <span className="lp-label">Frame rate</span>
          <Seg<'30' | '60'>
            label="Frame rate"
            value={fps === 60 ? '60' : '30'}
            options={[
              ['30', '30 fps'],
              ['60', '60 fps (smoother motion)'],
            ]}
            onChange={(rate) => setVideoOptions({ fps: rate === '60' ? 60 : 30 })}
          />
        </>
      )}
      <span className="lp-label">Quality</span>
      <Seg<VQuality>
        label="Quality"
        value={quality}
        options={[
          ['standard', kind === 'vlog' ? 'Standard (YouTube’s recommendation)' : 'Standard (5 Mbit/s)'],
          ['high', 'High'],
        ]}
        onChange={(chosen) => setVideoOptions({ quality: chosen })}
      />
      <p className="hint">
        {(bitrate / 1e6).toFixed(1)} Mbit/s · about {size}
      </p>
      <Check checked={fadeOut} onChange={(isOn) => setVideoOptions({ fadeOut: isOn })}>
        Fade to black at the end
      </Check>
    </div>
  );
}

/** A Reel's caption, or where a YouTube video is saved. */
function ExportDestination() {
  const kind = useVideo((state) => state.kind);
  const caption = useIg((state) => state.caption);
  if (kind === 'reel')
    return (
      <div>
        <h3>
          <label htmlFor="v-caption">Caption</label>
        </h3>
        <textarea id="v-caption" rows={3} maxLength={2200} placeholder="Write a caption. It’s copied for you when you post." value={caption} onChange={(event) => setIg({ caption: event.target.value })} />
        <LimitsNote />
      </div>
    );
  return (
    <div>
      <h3>Saving</h3>
      <p className="hint">
        {canStreamToDisk()
          ? 'You choose where to save, then the video is written straight to that file as it is made, so even a long video never has to fit in memory.'
          : 'This browser can’t write straight to a file, so the video is built in memory first: keep it short, or use Chrome, Edge or the desktop app.'}{' '}
        Upload it at{' '}
        <a href={YOUTUBE_UPLOAD} target="_blank" rel="noopener noreferrer">
          youtube.com/upload
        </a>
        .
      </p>
      <LimitsNote />
    </div>
  );
}

/** What can be done with the exported video. */
interface ExportActionsProps {
  /** True when the video is too short for Instagram. */
  isTooShort: boolean;
}

/**
 * The export button, then sharing, downloading or showing the saved file.
 * @param props whether the video is too short
 */
function ExportActions({ isTooShort }: Readonly<ExportActionsProps>) {
  const clips = useVideo((state) => state.clips);
  const result = useVideo((state) => state.result);
  const savedTo = useVideo((state) => state.savedTo);
  const total = useVideo(videoLength);
  const isShareable = !!result && !isDesktop && canShareFiles([result]);
  return (
    <div className="ig-actions">
      <button type="button" className="btn primary" disabled={!clips.length || isTooShort} onClick={() => void runExport()}>
        <DownloadIcon />
        {result || savedTo ? 'Export again' : `Export MP4 (${formatTime(total)})`}
      </button>
      {result && (
        <>
          <button type="button" className="btn primary" onClick={() => void postToInstagram(result, isShareable)}>
            {isShareable ? <ShareIcon /> : <InstagramIcon />}
            {isShareable ? 'Share to Instagram' : 'Save and open Instagram'}
          </button>
          <button type="button" className="btn" onClick={() => void saveFile(result.name, result)}>
            <DownloadIcon />
            Download MP4 ({(result.size / 1048576).toFixed(1)} MB)
          </button>
        </>
      )}
      {savedTo && (
        <>
          <span className="hint">Saved: {fileName(savedTo)}</span>
          {desktop && (
            <button type="button" className="btn" onClick={() => void desktop?.showInFolder(savedTo)}>
              <FolderIcon />
              Show in folder
            </button>
          )}
          <a className="btn" href={YOUTUBE_UPLOAD} target="_blank" rel="noopener noreferrer">
            <YouTubeIcon />
            Open YouTube upload
          </a>
        </>
      )}
    </div>
  );
}

/** The export dialog's contents. */
export function VideoExport() {
  const clips = useVideo((state) => state.clips);
  const kind = useVideo((state) => state.kind);
  const progress = useVideo((state) => state.progress);
  const total = useVideo(videoLength);
  const minimum = limits(kind).minSeconds;
  const isTooShort = clips.length > 0 && total < minimum;
  let note = 'Exporting renders every frame on this device. Keep this tab in front while it works; browsers slow down background tabs.';
  if (!clips.length) note = 'Add clips to export a video.';
  else if (isTooShort) note = `Instagram needs at least ${minimum} seconds: lengthen a photo or add a clip.`;
  return (
    <div className="ig-export">
      <div className="ig-export-grid">
        <ExportSettings />
        <ExportDestination />
      </div>
      {progress ? (
        <div className="v-progress" role="status">
          <progress max={1} value={progress.frac} aria-label="Export progress" />
          <span>
            {Math.round(progress.frac * 100)}% · {progress.phase}
          </span>
          <button type="button" className="btn" onClick={cancelExport}>
            Cancel
          </button>
        </div>
      ) : (
        <ExportActions isTooShort={isTooShort} />
      )}
      <p className="hint">{note}</p>
    </div>
  );
}
