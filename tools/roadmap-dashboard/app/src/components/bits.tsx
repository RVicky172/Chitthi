// Small shared pieces: status badges, progress bars and rings, rendered Markdown.
import type { FeatureStatus, Roadmap, TaskStatus } from '../types';
import { renderInline, renderMarkdown } from '../lib/markdown';

export const FEATURE_LABELS: Record<FeatureStatus, string> = {
  draft: 'Draft',
  approved: 'Approved',
  'in-progress': 'In progress',
  implemented: 'Implemented',
  superseded: 'Superseded',
};
export const TASK_LABELS: Record<TaskStatus, string> = {
  todo: 'To do',
  'in-progress': 'In progress',
  blocked: 'Blocked',
  done: 'Done',
};

/** A roadmap status as icon and words (never colour alone). */
export function StatusBadge({ roadmap, status, onStage }: { roadmap: Roadmap; status: string; onStage?: boolean }) {
  const s = roadmap.statuses.byId[status];
  return (
    <span className={`badge s-${status}${onStage ? ' on-stage' : ''}`}>
      {s && <span aria-hidden="true">{s.icon}</span>}
      {s ? s.label : status}
    </span>
  );
}

export function FeatureBadge({ status }: { status: FeatureStatus }) {
  return <span className={`badge f-${status}`}>Spec · {FEATURE_LABELS[status] ?? status}</span>;
}

export function Bar({ done, total, label, onStage }: { done: number; total: number; label: string; onStage?: boolean }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <span className={`bar${onStage ? ' on-stage' : ''}`}>
      <span
        className="bar-track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-valuetext={`${done} of ${total}`}
      >
        <span className="bar-fill" style={{ width: `${pct}%` }} />
      </span>
      <span className="num">
        {done}/{total}
      </span>
    </span>
  );
}

/** A progress ring with the share done in the middle. */
export function Ring({ done, total, label, size = 64 }: { done: number; total: number; label: string; size?: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const share = total ? done / total : 0;
  return (
    <svg className="ring" width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={`${label}: ${done} of ${total}`}>
      <circle className="ring-track" cx="32" cy="32" r={r} />
      <circle className="ring-fill" cx="32" cy="32" r={r} strokeDasharray={`${c * share} ${c}`} transform="rotate(-90 32 32)" />
      <text x="32" y="36" textAnchor="middle" className="ring-text">
        {Math.round(share * 100)}%
      </text>
    </svg>
  );
}

/** Markdown from the specs, rendered safely (markdown.ts escapes everything first). */
export function Md({ text, featureId, inline }: { text: string | null | undefined; featureId?: string; inline?: boolean }) {
  if (inline) return <span className="md-inline" dangerouslySetInnerHTML={{ __html: renderInline(text ?? '', { featureId }) }} />;
  return <div className="md" dangerouslySetInnerHTML={{ __html: renderMarkdown(text, { featureId }) }} />;
}

/** A feature's task sections as segments, each with its done / total (the hero, the feature page header). */
export function Segments({ sections, onStage }: { sections: { title: string; done: number; total: number }[]; onStage?: boolean }) {
  if (!sections.length) return null;
  return (
    <ol className={`segments${onStage ? ' on-stage' : ''}`} aria-label="Task sections">
      {sections.map((s) => (
        <li key={s.title} className={s.done === s.total ? 'is-full' : s.done ? 'is-part' : ''}>
          <span className="seg-bar" aria-hidden="true">
            <span className="seg-fill" style={{ transform: `scaleX(${s.total ? s.done / s.total : 0})` }} />
          </span>
          <span className="seg-title">{s.title}</span>
          <span className="num seg-count">
            {s.done}/{s.total}
          </span>
        </li>
      ))}
    </ol>
  );
}
