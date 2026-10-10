// The kanban board: To do, In progress, Blocked, Done. Cards move by dragging or by the card's "Move to" menu
// (keyboard and touch); blocking asks for a reason. A move shows at once and is then saved by the server, which
// writes feature.json and regenerates tasks.md; a refused move is undone and the reason shown.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { moveTaskOnServer } from '../api';
import { columns, COLUMNS, moveTask, today, type Card } from '../lib/board';
import { useReducedMotion } from '../lib/motion';
import { replaceParams } from '../route';
import type { FeatureData, TaskStatus } from '../types';
import { Md, TASK_LABELS } from './bits';

interface Props {
  data: FeatureData;
  params: URLSearchParams;
  replace: (d: FeatureData) => void;
}

export function Board({ data, params, replace }: Props) {
  const feature = data.feature!;
  const [section, setSection] = useState(params.get('section') ?? '');
  const [criterion, setCriterion] = useState(params.get('criterion') ?? '');
  const [q, setQ] = useState(params.get('q') ?? '');
  const [dragging, setDragging] = useState<string | null>(null);
  // The card being dragged, readable at once by dragover (state only updates after the next render).
  const draggingRef = useRef<string | null>(null);
  const [target, setTarget] = useState<TaskStatus | null>(null);
  const [asking, setAsking] = useState<{ id: string } | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const setFilter = (next: { section?: string; criterion?: string; q?: string }) => {
    const s = next.section ?? section;
    const c = next.criterion ?? criterion;
    const t = next.q ?? q;
    setSection(s);
    setCriterion(c);
    setQ(t);
    replaceParams({ section: s, criterion: c, q: t.trim() });
  };

  // A card that changed column (drag, menu or a change from outside) glides from where it was (FLIP, 405 §8).
  const boardRef = useRef<HTMLDivElement>(null);
  const places = useRef(new Map<string, { x: number; y: number; status: string }>());
  const reduced = useReducedMotion();
  useLayoutEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const next = new Map<string, { x: number; y: number; status: string }>();
    for (const card of el.querySelectorAll<HTMLElement>('[data-task]')) {
      const r = card.getBoundingClientRect();
      const now = { x: r.left + scrollX, y: r.top + scrollY, status: card.dataset.status ?? '' };
      next.set(card.dataset.task!, now);
      const was = places.current.get(card.dataset.task!);
      if (!reduced && was && was.status !== now.status)
        card.animate([{ transform: `translate(${was.x - now.x}px, ${was.y - now.y}px)` }, { transform: 'none' }], {
          duration: 450,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        });
    }
    places.current = next;
  });

  const cols = columns(feature, { section, criterion, q });
  const statusOf = (id: string) => feature.tasks?.items.byId[id]?.status;

  async function move(id: string, to: TaskStatus, reason?: string) {
    const from = statusOf(id);
    if (!from || from === to) return;
    if (to === 'blocked' && !reason) return setAsking({ id });
    setError('');
    const before = data;
    replace({ ...data, feature: moveTask(feature, id, to, { reason, today: today() }) });
    setMessage(`${id} moved to ${TASK_LABELS[to]}.`);
    try {
      replace(await moveTaskOnServer(data.id, id, to, reason));
    } catch (e) {
      replace(before);
      setMessage('');
      setError(`${id} couldn’t be moved: ${(e as Error).message}`);
    }
  }

  const sections = feature.tasks?.sections.map((s) => s.title) ?? [];
  const criteria = feature.spec.criteria.order;
  const shown = Object.values(cols).flat().length;
  const total = feature.tasks?.items.order.length ?? 0;

  if (!feature.tasks) return <p className="empty card-like">No tasks yet: they are written with /spec-tasks.</p>;

  return (
    <div className="board-wrap">
      <form className="filters board-filters" role="search" onSubmit={(e) => e.preventDefault()}>
        <label className="field">
          <span>Section</span>
          <select value={section} onChange={(e) => setFilter({ section: e.target.value })}>
            <option value="">All sections</option>
            {sections.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Proves</span>
          <select value={criterion} onChange={(e) => setFilter({ criterion: e.target.value })}>
            <option value="">Any criterion</option>
            {criteria.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="field search">
          <span>Search tasks</span>
          <input type="search" value={q} placeholder="Id or text" onChange={(e) => setFilter({ q: e.target.value })} />
        </label>
        <p className="count">
          {shown === total ? `${total} tasks` : `${shown} of ${total} tasks`}
        </p>
      </form>

      <p className="sr-only" role="status" aria-live="polite">
        {message}
      </p>
      {error && (
        <p className="callout problems" role="alert">
          {error}
        </p>
      )}

      <div className="board" ref={boardRef}>
        {COLUMNS.map((col) => (
          <section
            key={col.id}
            className={`col col-${col.id}${target === col.id ? ' is-target' : ''}`}
            aria-labelledby={`col-${col.id}`}
            onDragOver={(e) => {
              const id = draggingRef.current;
              if (!id || statusOf(id) === col.id) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              setTarget(col.id);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setTarget(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData('text/plain') || draggingRef.current;
              draggingRef.current = null;
              setTarget(null);
              setDragging(null);
              if (id) void move(id, col.id);
            }}
          >
            <header className="col-head">
              <h2 id={`col-${col.id}`}>{col.title}</h2>
              <span className="num col-count">{cols[col.id].length}</span>
            </header>
            {cols[col.id].length ? (
              <ul className="cards">
                {cols[col.id].map((card) => (
                  <TaskCard
                    key={card.id}
                    card={card}
                    featureId={data.id}
                    dragging={dragging === card.id}
                    onDragStart={() => {
                      draggingRef.current = card.id;
                      setDragging(card.id);
                    }}
                    onDragEnd={() => {
                      draggingRef.current = null;
                      setDragging(null);
                      setTarget(null);
                    }}
                    onMove={(to) => void move(card.id, to)}
                  />
                ))}
              </ul>
            ) : (
              <p className="col-empty">{col.empty}</p>
            )}
          </section>
        ))}
      </div>

      {asking && (
        <ReasonDialog
          taskId={asking.id}
          onCancel={() => setAsking(null)}
          onSave={(reason) => {
            setAsking(null);
            void move(asking.id, 'blocked', reason);
          }}
        />
      )}
    </div>
  );
}

interface CardProps {
  card: Card;
  featureId: string;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onMove: (to: TaskStatus) => void;
}

function TaskCard({ card, featureId, dragging, onDragStart, onDragEnd, onMove }: CardProps) {
  const { id, task } = card;
  const [menu, setMenu] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const firstItem = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (menu) firstItem.current?.focus();
  }, [menu]);
  const close = () => {
    setMenu(false);
    button.current?.focus();
  };
  const others = COLUMNS.filter((c) => c.id !== task.status);
  return (
    <li
      className={`card status-${task.status}${dragging ? ' is-dragging' : ''}`}
      data-task={id}
      data-status={task.status}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', id);
        e.dataTransfer.effectAllowed = 'move';
        onDragStart();
      }}
      onDragEnd={onDragEnd}
    >
      <div className="card-top">
        <span className="num card-id">{id}</span>
        {task.parallel && (
          <span className="tag" title="Can run in parallel with the previous task">
            parallel
          </span>
        )}
        {task.manual && (
          <span className="tag" title="Needs a person">
            👤 by hand
          </span>
        )}
        <span className="card-menu">
          <button
            ref={button}
            type="button"
            className="ghost"
            aria-expanded={menu}
            aria-label={`Move ${id}`}
            onClick={() => setMenu((m) => !m)}
          >
            Move
          </button>
          {menu && (
            <span
              className="menu"
              onKeyDown={(e) => {
                if (e.key === 'Escape') close();
              }}
            >
              {others.map((c, i) => (
                <button
                  key={c.id}
                  ref={i === 0 ? firstItem : undefined}
                  type="button"
                  onClick={() => {
                    close();
                    onMove(c.id);
                  }}
                >
                  To {c.title}
                </button>
              ))}
            </span>
          )}
        </span>
      </div>
      <p className="card-text">
        <Md text={task.text} featureId={featureId} inline />
      </p>
      {task.status === 'blocked' && task.blockedReason && (
        <p className="card-reason">
          <strong>Blocked:</strong> {task.blockedReason}
        </p>
      )}
      <div className="card-meta">
        <span className="muted">{task.section}</span>
        {task.covers?.map((c) => (
          <span key={c} className="chip-static num">
            {c}
          </span>
        ))}
        {task.files && task.files.length > 0 && (
          <span className="muted" title={task.files.join('\n')}>
            {task.files.length} file{task.files.length > 1 ? 's' : ''}
          </span>
        )}
        {task.doneOn && <span className="muted">Done {task.doneOn}</span>}
        {task.status === 'in-progress' && task.startedOn && <span className="muted">Since {task.startedOn}</span>}
      </div>
      {task.notes && task.notes.length > 0 && (
        <details className="card-notes">
          <summary>
            {task.notes.length} note{task.notes.length > 1 ? 's' : ''}
          </summary>
          {task.notes.map((n, i) => (
            <Md key={i} text={n} featureId={featureId} />
          ))}
        </details>
      )}
    </li>
  );
}

function ReasonDialog({ taskId, onSave, onCancel }: { taskId: string; onSave: (reason: string) => void; onCancel: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState('');
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog ref={ref} className="dialog" aria-labelledby="reason-title" onCancel={onCancel}>
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          if (reason.trim()) onSave(reason.trim());
        }}
      >
        <h2 id="reason-title">Block {taskId}</h2>
        <label className="field">
          <span>What does it wait for?</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onKeyDown={(e) => {
              // Enter saves (reasons are short); Shift + Enter adds a line.
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (reason.trim()) onSave(reason.trim());
              }
            }}
            rows={3}
            required
            autoFocus
            aria-describedby="reason-hint"
          />
        </label>
        <p id="reason-hint" className="muted small">
          Enter saves; Shift + Enter starts a new line. Shown on the card and in tasks.md.
        </p>
        <div className="dialog-actions">
          <button type="button" className="secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={!reason.trim()}>
            Block it
          </button>
        </div>
      </form>
    </dialog>
  );
}
