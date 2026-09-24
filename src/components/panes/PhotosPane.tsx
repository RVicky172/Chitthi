import { useState } from 'react';
import { LOOKS } from '../../data/layouts';
import { cardMM } from '../../engine/design';
import { MAX_MB, MAX_PHOTOS } from '../../engine/photo';
import { photoDpi } from '../../engine/render';
import { addFiles } from '../../state/actions';
import { patchPhoto, setPhotos, setUI, useApp } from '../../state/store';
import type { LookId } from '../../types';
import { PhotoThumb } from '../canvases';
import { Pane } from '../common';

function DpiBadge({ dpi }: { dpi: number | null }) {
  if (dpi === null) return <span className="q">not used in this layout</span>;
  const cls = dpi >= 250 ? 'good' : dpi >= 150 ? 'ok' : 'low';
  const txt = dpi >= 250 ? 'sharp in print' : dpi >= 150 ? 'fine in print' : 'may print soft';
  return (
    <span className={`q ${cls}`}>
      {txt} ({dpi} dpi)
    </span>
  );
}

export function PhotosPane() {
  const d = useApp((s) => s.design),
    photos = useApp((s) => s.photos);
  const [msgs, setMsgs] = useState<['err' | 'warn', string][]>([]);
  const [over, setOver] = useState(false);
  const { w, h } = cardMM(d);
  const dpis = photoDpi({ d, photos });

  const take = async (list: FileList | null) => {
    if (list?.length) setMsgs(await addFiles([...list]));
  };

  return (
    <Pane
      title="Photos"
      lead={`Add up to ${MAX_PHOTOS} photos. The original resolution goes into your print file.`}
      next="layout"
      onNext={() => setUI({ pane: 'layout' })}
    >
      <label
        className={`drop${over ? ' over' : ''}`}
        onDragEnter={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void take(e.dataTransfer.files);
        }}
      >
        <input
          type="file"
          multiple
          accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
          onChange={(e) => {
            void take(e.target.files);
            e.target.value = '';
          }}
        />
        <strong>Choose photos or drop them here</strong>
        <span>JPG, PNG or WebP, up to {MAX_MB} MB each</span>
      </label>
      {msgs.length > 0 && (
        <ul className="msgs" role="alert">
          {msgs.map(([k, m], i) => (
            <li key={i} className={k}>
              {m}
            </li>
          ))}
        </ul>
      )}
      <ul className="photos">
        {photos.map((p, i) => (
          <li key={p.id} className="photo">
            <PhotoThumb photo={p} />
            <div className="meta">
              <b>{p.name}</b>
              <span>
                {p.sw}×{p.sh} px{p.src !== p.orig ? ' after edits' : ''}, <DpiBadge dpi={dpis[i]} />
              </span>
              <div className="zoom">
                <label htmlFor={`z-${p.id}`}>Zoom</label>
                <input
                  id={`z-${p.id}`}
                  type="range"
                  min={1}
                  max={4}
                  step={0.01}
                  value={p.zoom}
                  onChange={(e) => patchPhoto(p.id, { zoom: +e.target.value })}
                />
                <label htmlFor={`l-${p.id}`}>Look</label>
                <select
                  id={`l-${p.id}`}
                  value={p.look}
                  style={{ padding: '3px 6px', fontSize: '.84rem' }}
                  onChange={(e) => patchPhoto(p.id, { look: e.target.value as LookId })}
                >
                  {LOOKS.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
              <div className="acts">
                <button type="button" className="sbtn accent" onClick={() => setUI({ cropId: p.id })}>
                  Crop
                </button>
                <button type="button" className="sbtn" onClick={() => patchPhoto(p.id, { zoom: 1, px: 0, py: 0 })}>
                  Reset position
                </button>
                {i > 0 && (
                  <button type="button" className="sbtn" onClick={() => setPhotos([p, ...photos.filter((x) => x.id !== p.id)])}>
                    Make first
                  </button>
                )}
                <button type="button" className="sbtn" onClick={() => setPhotos(photos.filter((x) => x.id !== p.id))}>
                  Remove
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {photos.length > 0 && (
        <p className="hint">Drag a photo on the card to move it. Use Zoom, or scroll over the photo, to enlarge it.</p>
      )}
      <details className="guide" open={!photos.length}>
        <summary>Photo guide</summary>
        <ul>
          <li>
            Accepted: <b>JPG, PNG and WebP</b>, up to {MAX_MB} MB each.
          </li>
          <li>
            For a sharp full-card print at this size, use at least{' '}
            <b>
              {Math.round((w / 25.4) * 300)} × {Math.round((h / 25.4) * 300)} px
            </b>
            . Most phone cameras are well above this.
          </li>
          <li>Upload the original photo. Pictures saved from WhatsApp or social media are shrunk and can print soft.</li>
          <li>Keep faces and writing a little away from the edges, because a thin strip is trimmed off when cards are cut.</li>
          <li>
            Use <b>Crop</b> to choose the part of the photo you want, rotate it or match the shape of your layout.
          </li>
          <li>iPhone photos in HEIC format need to be saved as JPG first.</li>
        </ul>
      </details>
    </Pane>
  );
}
