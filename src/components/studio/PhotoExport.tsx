import { useEffect, useState } from 'react';
import { IG_CAPTION_MAX, IG_CAPTION_PREVIEW, IG_FILE_TYPES, IG_FILE_WARN_BYTES, IG_HASHTAG_MAX, type IgFileType } from '../../data/instagram';
import { encodableTypes, PHOTO_TYPES } from '../../engine/photoExport';
import { saveFile } from '../../lib/download';
import { logError } from '../../lib/errors';
import { toast } from '../../lib/toast';
import { desktop, isDesktop } from '../../platform/desktop';
import { getIg, setIg, useIg } from '../../state/instagram';
import { canShareFiles, prepareBatch, zipOf } from '../../state/instagramExport';
import { Seg } from '../common';
import { Slider } from '../ig/Slider';
import { DownloadIcon, InstagramIcon, ShareIcon } from '../icons';

/*
 * The photo editor's export dialog: the file type and quality, the caption with its limits, posting (prepare, then
 * share to the Instagram app, or save and open instagram.com) and downloading as a ZIP or separate files.
 */

const INSTAGRAM_WEB = 'https://www.instagram.com/';

/**
 * The batch's files: the prepared ones, else rendered now.
 * @returns the files
 */
const batchFiles = async (): Promise<File[]> => getIg().ready ?? (await prepareBatch());

/**
 * The ZIP's file name, dated today.
 * @returns "chitthi-instagram-YYYY-MM-DD.zip"
 */
const zipName = (): string => `chitthi-instagram-${new Date().toISOString().slice(0, 10)}.zip`;

/**
 * Saves the photos as a ZIP and opens Instagram.
 * @param files the prepared photos
 */
async function saveAndOpen(files: File[]): Promise<void> {
  await saveFile(zipName(), await zipOf(files));
  if (desktop) await desktop.openExternal(INSTAGRAM_WEB);
  else window.open(INSTAGRAM_WEB, '_blank', 'noopener');
  toast('Photos saved. On Instagram, choose Create (+), then select the photos.');
}

/**
 * Posts the batch: the first press prepares the photos (rendering takes a moment and a share needs a fresh tap); the
 * next shares them to the Instagram app where the device can (the caption copied), else saves them and opens Instagram.
 * @param isShareable whether this device can share the prepared files
 */
async function postBatch(isShareable: boolean): Promise<void> {
  const files = getIg().ready;
  if (!files) {
    await prepareBatch();
    return;
  }
  const { caption } = getIg();
  // The clipboard is missing outside secure contexts.
  if (caption && 'clipboard' in navigator) await navigator.clipboard.writeText(caption).catch(() => undefined);
  if (isShareable) {
    try {
      await navigator.share({ files, text: caption || undefined });
      if (caption) toast('Caption copied: paste it into Instagram.');
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      logError('handled', error);
      toast(files.length > 10 ? 'This device couldn’t share that many photos at once. Saving them instead.' : 'Sharing didn’t work here. Saving the photos instead.');
    }
  }
  await saveAndOpen(files);
}

/**
 * The file types this browser can write (JPEG and PNG always; WebP and AVIF where it can); a remembered choice it
 * can't is set back to JPEG.
 * @returns the types, JPEG and PNG until the check finishes
 */
function useWritableTypes(): IgFileType[] {
  const [types, setTypes] = useState<IgFileType[]>(['jpeg', 'png']);
  useEffect(() => {
    let isLive = true;
    void encodableTypes().then((writable) => {
      if (!isLive) return;
      setTypes(writable);
      if (!writable.includes(getIg().fileType)) setIg({ fileType: 'jpeg' });
    });
    return () => {
      isLive = false;
    };
  }, []);
  return types;
}

/** The file type, its note and (for lossy types) the quality. */
function FileTypeChoice() {
  const fileType = useIg((state) => state.fileType);
  const quality = useIg((state) => state.quality);
  const types = useWritableTypes();
  const typeInfo = PHOTO_TYPES[fileType];
  return (
    <div>
      <h3>File type</h3>
      <Seg<IgFileType>
        label="File type"
        value={fileType}
        options={IG_FILE_TYPES.filter(([type]) => types.includes(type)).map(([type, name]) => [type, name])}
        onChange={(type) => setIg({ fileType: type })}
      />
      <p className="hint">{IG_FILE_TYPES.find(([type]) => type === fileType)?.[2]}. sRGB colour, 1080 px wide.</p>
      {typeInfo.lossy && <Slider id="ig-q" label={`${typeInfo.label} quality`} value={quality} min={60} max={100} onChange={(chosen) => setIg({ quality: chosen })} />}
    </div>
  );
}

/** The caption with its length, hashtags and the part shown before "more". */
function CaptionField() {
  const caption = useIg((state) => state.caption);
  const hashtags = (caption.match(/#[\p{L}\p{N}_]+/gu) ?? []).length;
  return (
    <div>
      <h3>
        <label htmlFor="ig-caption">Caption</label>
      </h3>
      <textarea id="ig-caption" rows={4} maxLength={IG_CAPTION_MAX} placeholder="Write a caption. It’s copied for you when you post." value={caption} onChange={(event) => setIg({ caption: event.target.value })} />
      <p className={`hint${hashtags > IG_HASHTAG_MAX ? ' bad' : ''}`}>
        {caption.length} / {IG_CAPTION_MAX} characters · {hashtags} / {IG_HASHTAG_MAX} hashtags
        {caption.length > IG_CAPTION_PREVIEW ? ` · the first ${IG_CAPTION_PREVIEW} show before “more”` : ''}
      </p>
    </div>
  );
}

/**
 * The status line: the busy step, what is ready (and which files may be too big), or what posting will do.
 * @param props the photo count, the prepared files, the busy step and whether they can be shared
 * @param props.count how many photos the batch has
 * @param props.ready the prepared files, or null
 * @param props.busy the step running, or null
 * @param props.isShareable whether this device can share the prepared files
 * @returns the text
 */
function statusText({ count, ready, busy, isShareable }: { count: number; ready: File[] | null; busy: string | null; isShareable: boolean }): string {
  const tooMany = ready && isShareable && ready.length > 10 ? ' Some phones can share only 10 photos at once; if sharing fails, the photos are saved instead.' : '';
  if (busy !== null) return busy + tooMany;
  if (!count) return 'Add photos to export them.' + tooMany;
  if (ready) {
    const megabytes = (ready.reduce((total, file) => total + file.size, 0) / 1048576).toFixed(1);
    const big = ready.filter((file) => file.size > IG_FILE_WARN_BYTES).length;
    const them = big === 1 ? 'it' : 'them';
    const bigNote = big ? ` ${big} over 8 MB: lower the JPEG quality if Instagram refuses ${them}.` : '';
    return `${ready.length} photo${ready.length === 1 ? '' : 's'} ready (${megabytes} MB).${bigNote}${tooMany}`;
  }
  if (isDesktop) return 'The desktop app saves the photos and opens instagram.com, where you choose Create (+) and select them.' + tooMany;
  return 'On a phone, sharing opens the Instagram app with your photos. Elsewhere Chitthi Studio saves them and opens instagram.com.' + tooMany;
}

/** The photo editor's export dialog (see the file's comment). */
export function PhotoExport() {
  const count = useIg((state) => state.items.length);
  const ready = useIg((state) => state.ready);
  const busy = useIg((state) => state.busy);
  const [isWorking, setWorking] = useState(false);
  const isShareable = !!ready && !isDesktop && canShareFiles(ready);
  const run = async (job: () => Promise<void>) => {
    setWorking(true);
    try {
      await job();
    } catch (error) {
      logError('handled', error);
      toast('The photos couldn’t be made. Try again, or use fewer photos.');
    } finally {
      setWorking(false);
    }
  };
  let postLabel = isShareable ? 'Share to Instagram' : 'Save photos and open Instagram';
  if (!ready) postLabel = `Prepare ${count} photo${count === 1 ? '' : 's'} for Instagram`;
  const isDisabled = !count || isWorking || !!busy;
  return (
    <div className="ig-export">
      <div className="ig-export-grid">
        <FileTypeChoice />
        <CaptionField />
      </div>
      <div className="ig-actions">
        <button type="button" className="btn primary" disabled={isDisabled} onClick={() => void run(() => postBatch(isShareable))}>
          {isShareable ? <ShareIcon /> : <InstagramIcon />}
          {postLabel}
        </button>
        <button type="button" className="btn" disabled={isDisabled} onClick={() => void run(async () => saveFile(zipName(), await zipOf(await batchFiles())).then(() => undefined))}>
          <DownloadIcon />
          Download all (ZIP)
        </button>
        {!isDesktop && (
          <button
            type="button"
            className="btn"
            disabled={isDisabled}
            onClick={() =>
              void run(async () => {
                for (const file of await batchFiles()) await saveFile(file.name, file);
              })
            }
          >
            <DownloadIcon />
            Download as separate files
          </button>
        )}
      </div>
      <p className="hint" role="status">
        {statusText({ count, ready, busy, isShareable })}
      </p>
    </div>
  );
}
