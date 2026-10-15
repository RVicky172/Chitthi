import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LAYOUTS, layoutName } from '../data/layouts';
import { db } from '../lib/db';
import { toast } from '../lib/toast';
import {
  downloadQuotePack,
  exportBackup,
  importBackup,
  newCard,
  open3D,
  openDesign,
  saveDesign,
} from '../state/actions';
import { setDesign, setUI, useApp } from '../state/store';
import type { LayoutId, SavedDesign } from '../types';
import { Seg } from './common';
import { CloseIcon, EditIcon, GalleryIcon, TrashIcon } from './icons';
import { SampleGallery } from './SampleGallery';
import { Sparkles } from 'lucide-react';
import { isDesktop } from '../platform/desktop';

const close = () => setUI({ gallery: false });

function GalleryCard({
  d,
  onDeleted,
  pick,
}: {
  d: SavedDesign;
  onDeleted: () => void;
  pick?: { on: boolean; toggle: () => void };
}) {
  const [sure, setSure] = useState(false);
  useEffect(() => {
    if (!sure) return;
    const timer = setTimeout(() => setSure(false), 3000);
    return () => clearTimeout(timer);
  }, [sure]);
  const view = () => void open3D({ front: d.front, back: d.back, w: d.w, h: d.h, round: d.round, title: d.name });
  const radius = d.round ? 6 : 2;
  return (
    <article className={`gcard${pick?.on ? ' picked' : ''}`}>
      {pick && (
        <label className="gpick">
          <input type="checkbox" checked={pick.on} onChange={pick.toggle} />{' '}
          <span className="vh">Include {d.name} in the quote</span>
        </label>
      )}
      <button
        type="button"
        className="gthumb"
        title={pick ? 'Include in the quote' : 'Open in 3D'}
        onClick={pick ? pick.toggle : view}
      >
        <div
          className="flipper"
          style={{ width: d.w >= d.h ? '100%' : `${(d.w / d.h) * 100}%`, aspectRatio: `${d.w}/${d.h}` }}
        >
          <img src={d.front} alt={`Front of ${d.name}`} style={{ borderRadius: radius }} />
          <img className="b" src={d.back} alt="" style={{ borderRadius: radius }} />
        </div>
      </button>
      <b>{d.name}</b>
      <small>
        {d.size},{' '}
        {new Date(d.updated).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
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

const layoutOf = (saved: SavedDesign): LayoutId => saved.design?.layout ?? 'full';

/** Full-screen gallery of saved designs, grouped by layout (in Layout-step order), newest first within each group. */
export function GalleryDialog() {
  const open = useApp((state) => state.ui.gallery),
    name = useApp((state) => state.design.designName);
  const dlg = useRef<HTMLDialogElement>(null);
  const [list, setList] = useState<SavedDesign[] | null>(null);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<LayoutId | 'all'>('all');
  // Samples first for a new user; once they have saved designs, their own come first.
  const [tabChoice, setTab] = useState<'mine' | 'samples' | null>(null);
  const tab = tabChoice ?? (list && list.length ? 'mine' : 'samples');
  // Picking designs for one quote pack (order sheet + a quote request each).
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [quoteStep, setQuoteStep] = useState('');
  const togglePick = (id: string) =>
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const load = useCallback(() => {
    db.all()
      .then((loaded) => {
        setList(loaded);
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
    for (const saved of list ?? []) {
      const layout = layoutOf(saved);
      by.set(layout, [...(by.get(layout) ?? []), saved]);
    }
    return LAYOUTS.filter(([id]) => by.has(id)).map(([id]) => ({
      id,
      items: by.get(id)!.sort((left, right) => right.updated - left.updated),
    }));
  }, [list]);
  const shown = filter === 'all' ? groups : groups.filter((group) => group.id === filter);

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
            onChange={(event) => setDesign({ designName: event.target.value })}
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

      {tab === 'mine' && !!list?.length && (
        <div className="galquote">
          {picking ? (
            <>
              <span>
                <b>{picked.size}</b> selected for a quote
              </span>
              <button type="button" className="linkbtn" onClick={() => setPicked(new Set(list.map((x) => x.id)))}>
                Select all
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={!picked.size || !!quoteStep}
                onClick={async () => {
                  setQuoteStep('Preparing…');
                  try {
                    await downloadQuotePack([...picked], setQuoteStep);
                  } finally {
                    setQuoteStep('');
                  }
                }}
              >
                {quoteStep || `Quote pack for ${picked.size || ''} design${picked.size === 1 ? '' : 's'}`}
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  setPicking(false);
                  setPicked(new Set());
                }}
              >
                Cancel
              </button>
            </>
          ) : (
            <button type="button" className="btn ghost" onClick={() => setPicking(true)}>
              Get one quote for several designs
            </button>
          )}
        </div>
      )}
      {tab === 'mine' && groups.length > 1 && (
        <div className="chips galfilter" role="group" aria-label="Show layout">
          <button type="button" className="chip" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
            All ({list?.length ?? 0})
          </button>
          {groups.map((group) => (
            <button
              key={group.id}
              type="button"
              className="chip"
              aria-pressed={filter === group.id}
              onClick={() => setFilter(group.id)}
            >
              {layoutName(group.id)} ({group.items.length})
            </button>
          ))}
        </div>
      )}

      <div className="galbody">
        {tab === 'samples' && <SampleGallery />}
        {tab === 'mine' && error && (
          <div className="empty">The gallery isn’t available {isDesktop ? 'right now' : 'in this browser'}.</div>
        )}
        {tab === 'mine' && !error && !list && (
          <div className="gal" aria-busy="true" aria-label="Loading saved designs">
            {[0, 1, 2, 3].map((slot) => (
              <div key={slot} className="gcard">
                <span className="skel gthumb-skel" />
                <span className="skel line-skel" />
                <span className="skel line-skel short" />
              </div>
            ))}
          </div>
        )}
        {tab === 'mine' && !error && list && !list.length && (
          <div className="empty">
            No saved designs yet. Use “Save” to keep this card with its photos and settings, or start from a sample.
          </div>
        )}
        {tab === 'mine' &&
          shown.map((group) => (
            <section key={group.id} className="galgroup" aria-label={layoutName(group.id)}>
              <h3>
                {layoutName(group.id)} <small>{group.items.length}</small>
              </h3>
              <div className="gal">
                {group.items.map((saved) => (
                  <GalleryCard
                    key={saved.id}
                    d={saved}
                    onDeleted={load}
                    pick={picking ? { on: picked.has(saved.id), toggle: () => togglePick(saved.id) } : undefined}
                  />
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
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importBackup(file);
              event.target.value = '';
            }}
          />
        </label>
        <p className="hint">Hover a card to see its back. Shortcuts: Ctrl+S save, Ctrl+Z undo, F flip.</p>
      </div>
    </dialog>
  );
}
