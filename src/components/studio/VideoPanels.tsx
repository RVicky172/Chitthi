import { useState } from 'react';
import { formatTime } from '../../engine/timeline';
import { lockedReason, MUSIC } from '../../engine/tracks';
import { useIg } from '../../state/instagram';
import { addMedia, removeMusic, setMusicFile, updateMusic } from '../../state/videoMedia';
import { limits, limitText, useVideo, videoLength } from '../../state/videoStore';
import { AddPhotoIcon, MusicIcon, ReelIcon, TrashIcon, YouTubeIcon } from '../icons';
import { DesktopNote } from './Shell';
import { Range } from './videoFields';

/* The video editor's Media and Audio panels, the empty stage, and the browser's limits. */

/** The files the media pickers take. */
const ACCEPT = 'image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm,.mov,.m4v,.mkv';

/**
 * Files as media to add.
 * @param files the files chosen or dropped
 * @returns their names, contents and types
 */
const mediaOf = (files: Iterable<File>) => [...files].map((file) => ({ name: file.name, blob: file, type: file.type }));

/** What the browser allows, and what the desktop app adds. */
export function LimitsNote() {
  const kind = useVideo((state) => state.kind);
  const limit = limits(kind);
  const fileSize = limit.fileMB >= 1024 ? String(limit.fileMB / 1024) + ' GB' : String(limit.fileMB) + ' MB';
  return (
    <DesktopNote>
      In the browser, {kind === 'vlog' ? 'YouTube videos' : 'Reels'} can be up to {limitText(limit.seconds)} long with {limit.clips} clips and files up to{' '}
      {fileSize}, at 30 fps{kind === 'vlog' ? ' and 1080p' : ''}: video processing in a browser tab is limited by its memory and can slow down in the
      background. The desktop app is the full studio: {kind === 'vlog' ? 'videos up to 3 hours, 1440p and 4K, 60 fps,' : 'Reels up to 3 minutes, 60 fps,'} bigger
      files, and faster exports with your graphics card.
    </DesktopNote>
  );
}

/** The empty stage. */
interface EmptyStageProps {
  kind: 'reel' | 'vlog';
}

/**
 * The stage before any clip: what this editor makes, and a button to add media.
 * @param props Reel or YouTube video
 */
export function EmptyStage({ kind }: Readonly<EmptyStageProps>) {
  const [message, setMessage] = useState('');
  return (
    <div className="mst-empty">
      {kind === 'vlog' ? <YouTubeIcon /> : <ReelIcon />}
      <h2>{kind === 'vlog' ? 'Make a YouTube video' : 'Make a Reel or Short'}</h2>
      <p>
        {kind === 'vlog'
          ? 'Load your clips and photos, trim and arrange them on the timeline, add titles and music, and export a 16:9 MP4 for YouTube.'
          : 'Photos and clips become a vertical video with movement, text, stickers and music, ready for Instagram Reels or YouTube Shorts.'}
      </p>
      <label className="btn primary mst-file">
        <AddPhotoIcon />
        Add videos or photos
        <input
          type="file"
          accept={ACCEPT}
          multiple
          onChange={(event) => {
            void addMedia(mediaOf(event.target.files ?? [])).then((messages) => setMessage(messages[0] ?? ''));
          }}
        />
      </label>
      {message && <p className="hint bad">{message}</p>}
      <LimitsNote />
    </div>
  );
}

/** The Media panel: add videos and photos (picked, dropped, or from the photo studio). */
export function MediaPanel() {
  const photos = useIg((state) => state.items);
  const [messages, setMessages] = useState<string[]>([]);
  const add = async (files: FileList | null) => {
    if (files?.length) setMessages(await addMedia(mediaOf(files)));
  };
  return (
    <>
      <div className="ig-group">
        <h3>Add media</h3>
        <label
          className="mst-drop"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            void add(event.dataTransfer.files);
          }}
        >
          <AddPhotoIcon />
          <span>
            <b>Choose videos or photos</b> or drop them here
          </span>
          <small>MP4, MOV, WebM, MKV · JPG, PNG, WebP</small>
          <input
            type="file"
            accept={ACCEPT}
            multiple
            onChange={(event) => {
              const input = event.target;
              void add(input.files).then(() => {
                input.value = '';
              });
            }}
          />
        </label>
        {photos.length > 0 && (
          <button type="button" className="sbtn" onClick={() => void addMedia(photos.map((photo) => ({ name: photo.name, blob: photo.file }))).then(setMessages)}>
            Use the {photos.length} photo{photos.length === 1 ? '' : 's'} from Photos
          </button>
        )}
        {messages.length > 0 && (
          <ul className="msgs" role="alert">
            {messages.map((message, index) => (
              // Messages can repeat; their order is fixed for the batch.
              <li key={`${index}:${message}`} className="err">
                {message}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="ig-group">
        <LimitsNote />
        <p className="hint">New clips go to the end of the timeline. Drag them there to reorder; drag their edges to trim.</p>
      </div>
    </>
  );
}

/** The Audio panel: the music, its volume and where the song starts; disabled while the music track is locked. */
export function MusicPanel() {
  const music = useVideo((state) => state.music);
  const [message, setMessage] = useState('');
  const total = useVideo(videoLength);
  const locked = useVideo((state) => lockedReason(state.tracks, MUSIC));
  return (
    <div className="ig-group">
      <h3>Music</h3>
      <p className="hint">Add a song or sound from this device. Use music you have the right to post: Instagram and YouTube may mute or claim recognised songs.</p>
      {locked && <p className="hint lp-locked">{locked}</p>}
      <fieldset className="lp-fs" disabled={!!locked}>
        <label className="sbtn mst-file">
          <MusicIcon />
          {music ? 'Choose another sound' : 'Add music'}
          <input
            type="file"
            accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.opus,.flac"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void setMusicFile(file).then((refusal) => setMessage(refusal ?? ''));
            }}
          />
        </label>
        {message && (
          <p className="hint bad" role="alert">
            {message}
          </p>
        )}
        {music && (
          <>
            <p className="hint ig-name" title={music.name}>
              {music.name} · {formatTime(music.dur)}
            </p>
            <Range id="m-vol" label="Volume" value={music.volume} min={0} max={1} step={0.05} show={`${Math.round(music.volume * 100)}%`} onChange={(volume) => updateMusic({ volume })} />
            <Range
              id="m-off"
              label="Start the song at"
              value={music.offset}
              min={0}
              max={Math.max(0, music.dur - Math.min(total, music.dur))}
              step={0.5}
              show={formatTime(music.offset)}
              onChange={(offset) => updateMusic({ offset })}
            />
            <p className="hint">Or drag the music on the timeline. It fades out over the last seconds. Lower a clip’s own sound in its inspector.</p>
            <button type="button" className="sbtn" onClick={removeMusic}>
              <TrashIcon />
              Remove music
            </button>
          </>
        )}
      </fieldset>
    </div>
  );
}
