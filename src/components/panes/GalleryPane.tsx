import { useCallback, useEffect, useState } from 'react';
import { db } from '../../lib/db';
import { exportBackup, importBackup, newCard, open3D, openDesign, saveDesign } from '../../state/actions';
import { setDesign, useApp } from '../../state/store';
import type { SavedDesign } from '../../types';
import { Pane } from '../common';
import { toast } from '../../lib/toast';

function GalleryCard({ d, onDeleted }: { d: SavedDesign; onDeleted: () => void }) {
  const [sure, setSure] = useState(false);
  useEffect(() => {
    if (!sure) return;
    const t = setTimeout(() => setSure(false), 3000);
    return () => clearTimeout(t);
  }, [sure]);
  const view = () => void open3D({ front: d.front, back: d.back, w: d.w, h: d.h, round: d.round, title: d.name });
  const radius = d.round ? 6 : 2;
  return (
    <article className="gcard">
      <button type="button" className="gthumb" title="Open in 3D" onClick={view}>
        <div className="flipper" style={{ width: d.w >= d.h ? '100%' : `${(d.w / d.h) * 100}%`, aspectRatio: `${d.w}/${d.h}` }}>
          <img src={d.front} alt={`Front of ${d.name}`} style={{ borderRadius: radius }} />
          <img className="b" src={d.back} alt="" style={{ borderRadius: radius }} />
        </div>
      </button>
      <b>{d.name}</b>
      <small>
        {d.size}, {new Date(d.updated).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
      </small>
      <div className="acts">
        <button type="button" className="sbtn accent" onClick={() => void openDesign(d.id)}>
          Edit
        </button>
        <button type="button" className="sbtn" onClick={view}>
          3D
        </button>
        <button
          type="button"
          className="sbtn"
          onClick={async () => {
            if (!sure) {
              setSure(true);
              return;
            }
            await db.del(d.id);
            onDeleted();
            toast('Design deleted.');
          }}
        >
          {sure ? 'Tap again to delete' : 'Delete'}
        </button>
      </div>
    </article>
  );
}

export function GalleryPane() {
  const name = useApp((s) => s.design.designName);
  const [list, setList] = useState<SavedDesign[] | null>(null);
  const [error, setError] = useState(false);
  const load = useCallback(() => {
    db.all()
      .then((l) => {
        setList(l.sort((a, b) => b.updated - a.updated));
        setError(false);
      })
      .catch(() => setError(true));
  }, []);
  useEffect(() => {
    load();
    window.addEventListener('chitthi:gallery', load);
    return () => window.removeEventListener('chitthi:gallery', load);
  }, [load]);

  return (
    <Pane title="Gallery" lead="Designs are saved in this browser with their photos. Hover a card to see its back.">
      <label className="f">
        Name for this design
        <input
          type="text"
          placeholder="Diwali card for Nani"
          value={name}
          onChange={(e) => setDesign({ designName: e.target.value })}
        />
      </label>
      <div className="inline">
        <button type="button" className="btn primary" onClick={() => void saveDesign(false)}>
          Save to gallery
        </button>
        <button type="button" className="btn" onClick={() => void saveDesign(true)}>
          Save as a new copy
        </button>
      </div>
      <div className="gal">
        {error && (
          <div className="empty" style={{ gridColumn: '1/-1' }}>
            The gallery isn’t available in this browser.
          </div>
        )}
        {!error && list && !list.length && (
          <div className="empty" style={{ gridColumn: '1/-1' }}>
            No saved designs yet. Use “Save to gallery” to keep this card with its photos and settings.
          </div>
        )}
        {list?.map((d) => (
          <GalleryCard key={d.id} d={d} onDeleted={load} />
        ))}
      </div>
      <h3>More</h3>
      <div className="inline">
        <button type="button" className="btn" onClick={newCard}>
          Start a new card
        </button>
        <button type="button" className="btn" onClick={() => void exportBackup()}>
          Back up gallery
        </button>
        <label className="btn">
          Restore a backup
          <input
            type="file"
            className="vh"
            accept=".json,application/json"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importBackup(f);
              e.target.value = '';
            }}
          />
        </label>
      </div>
      <p className="hint">
        A backup is one .json file with every design and its photos. Keep one before clearing browser data or moving to another
        computer.
      </p>
      <p className="hint">Shortcuts: Ctrl+Z undo, Ctrl+Shift+Z redo, Ctrl+S save to gallery, F to flip between front and back.</p>
    </Pane>
  );
}
