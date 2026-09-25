import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LAYOUTS, layoutName } from '../data/layouts';
import { db } from '../lib/db';
import { toast } from '../lib/toast';
import { exportBackup, importBackup, newCard, open3D, openDesign, saveDesign } from '../state/actions';
import { setDesign, setUI, useApp } from '../state/store';
import type { LayoutId, SavedDesign } from '../types';
import { Seg } from './common';
import { CloseIcon, EditIcon, GalleryIcon, TrashIcon } from './icons';
import { SampleGallery } from './SampleGallery';
import { Sparkles } from 'lucide-react';
import { isDesktop } from '../platform/desktop';

const close = () => setUI({ gallery: false });

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
        <button
          type="button"
          className="sbtn accent"
          onClick={async () => {
            await openDesign(d.id);
            close();
          }}
        >
          <EditIcon />
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
          <TrashIcon />
          {sure ? 'Tap again to delete' : 'Delete'}
        </button>
      </div>
    </article>
  );
}

const layoutOf = (d: SavedDesign): LayoutId => d.design?.layout ?? 'full';

/** Full-screen gallery of saved designs, grouped by layout (in Layout-step order), newest first within each group. */
export function GalleryDialog() {
  const open = useApp((s) => s.ui.gallery),
    name = useApp((s) => s.design.designName);
  const dlg = useRef<HTMLDialogElement>(null);
  const [list, setList] = useState<SavedDesign[] | null>(null);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<LayoutId | 'all'>('all');
  // Samples first for a new user; once they have saved designs, their own come first.
  const [tabChoice, setTab] = useState<'mine' | 'samples' | null>(null);
  const tab = tabChoice ?? (list && list.length ? 'mine' : 'samples');

  const load = useCallback(() => {
    db.all()
      .then((l) => {
        setList(l);
        setError(false);
      })
      .catch(() => setError(true));
  }, []);
  useEffect(() => {
    window.addEventListener('chitthi:gallery', load);
    return () => window.removeEventListener('chitthi:gallery', load);
  }, [load]);

  useEffect(() => {
    const el = dlg.current;
    if (!el) return;
    if (open) {
      load();
      if (!el.open) el.showModal();
    } else if (el.open) el.close();
  }, [open, load]);

  const groups = useMemo(() => {
    const by = new Map<LayoutId, SavedDesign[]>();
    for (const d of list ?? []) {
      const k = layoutOf(d);
      by.set(k, [...(by.get(k) ?? []), d]);
    }
    return LAYOUTS.filter(([id]) => by.has(id)).map(([id]) => ({
      id,
      items: by.get(id)!.sort((a, b) => b.updated - a.updated),
    }));
  }, [list]);
  const shown = filter === 'all' ? groups : groups.filter((g) => g.id === filter);

  return (
    <dialog ref={dlg} className="galdlg" aria-labelledby="galTitle" onClose={close}>
      <div className="galbar">
        <h2 id="galTitle">Gallery</h2>
        <label className="galname">
          <span className="vh">Name for this design</span>
          <input
            type="text"
            placeholder="Name this design, e.g. Diwali card for Nani"
            value={name}
            onChange={(e) => setDesign({ designName: e.target.value })}
          />
        </label>
        <button type="button" className="btn primary" onClick={() => void saveDesign(false)}>
          Save
        </button>
        <button type="button" className="btn" onClick={() => void saveDesign(true)}>
          Save copy
        </button>
        <button type="button" className="btn icon ghost galx" aria-label="Close gallery" onClick={close}>
          <CloseIcon />
        </button>
      </div>

      <div className="galtabs">
        <Seg<'samples' | 'mine'>
          label="Show"
          value={tab}
          options={[
            ['samples', 'Samples', <Sparkles key="s" aria-hidden="true" strokeWidth={1.9} />],
            ['mine', `Your designs${list?.length ? ` (${list.length})` : ''}`, <GalleryIcon key="m" />],
          ]}
          onChange={setTab}
        />
      </div>

      {tab === 'mine' && groups.length > 1 && (
        <div className="chips galfilter" role="group" aria-label="Show layout">
          <button type="button" className="chip" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
            All ({list?.length ?? 0})
          </button>
          {groups.map((g) => (
            <button key={g.id} type="button" className="chip" aria-pressed={filter === g.id} onClick={() => setFilter(g.id)}>
              {layoutName(g.id)} ({g.items.length})
            </button>
          ))}
        </div>
      )}

      <div className="galbody">
        {tab === 'samples' && <SampleGallery />}
        {tab === 'mine' && error && <div className="empty">The gallery isn’t available {isDesktop ? 'right now' : 'in this browser'}.</div>}
        {tab === 'mine' && !error && !list && (
          <div className="gal" aria-busy="true" aria-label="Loading saved designs">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="gcard">
                <span className="skel gthumb-skel" />
                <span className="skel line-skel" />
                <span className="skel line-skel short" />
              </div>
            ))}
          </div>
        )}
        {tab === 'mine' && !error && list && !list.length && (
          <div className="empty">No saved designs yet. Use “Save” to keep this card with its photos and settings, or start from a sample.</div>
        )}
        {tab === 'mine' && shown.map((g) => (
          <section key={g.id} className="galgroup" aria-label={layoutName(g.id)}>
            <h3>
              {layoutName(g.id)} <small>{g.items.length}</small>
            </h3>
            <div className="gal">
              {g.items.map((d) => (
                <GalleryCard key={d.id} d={d} onDeleted={load} />
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="galfoot">
        <button
          type="button"
          className="btn"
          onClick={() => {
            newCard();
            close();
          }}
        >
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
            accept=".json,.chitthi,application/json"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importBackup(f);
              e.target.value = '';
            }}
          />
        </label>
        <p className="hint">Hover a card to see its back. Shortcuts: Ctrl+S save, Ctrl+Z undo, F flip.</p>
      </div>
    </dialog>
  );
}
