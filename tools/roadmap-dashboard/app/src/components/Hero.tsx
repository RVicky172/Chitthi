// "You are here" (405 §5): the current stop opened into the dark stage, the only place marigold appears. The feature
// being built, its task ring and sections, what runs now, what's next, what's blocked, and how long it has been moving;
// then every roadblock on the road, each linking to its task on the board.
import { featureAge } from '../lib/pace';
import { heroModel, roadblocks, type Road, type Stop } from '../lib/road';
import { href } from '../route';
import type { Roadmap } from '../types';
import { FEATURE_LABELS, Md, Ring, Segments, StatusBadge } from './bits';

interface Props {
  stop: Stop;
  road: Road;
  roadmap: Roadmap;
  today: string;
  changed: Set<string>;
}

const taskLink = (feature: string, task: string) => href(`/feature/${feature}/board`, { q: task });

export function Hero({ stop, road, roadmap, today, changed }: Props) {
  const model = heroModel(stop);
  const age = stop.feature ? featureAge(stop.feature, today) : null;
  const phase = roadmap.phases.byId[stop.phase];
  const blocks = roadblocks(road.stops);
  const elsewhere = blocks.filter((b) => b.stop.id !== stop.id);
  return (
    <article className={`hero stage${changed.has(stop.id) ? ' is-changed' : ''}`} aria-labelledby="hero-title">
      <div className="hero-head">
        <div>
          <p className="stage-eyebrow">You are here · {phase?.title}</p>
          <h2 id="hero-title" className="stage-title">
            <span className="num hero-id">{stop.id}</span> <Md text={stop.item.title} inline />
          </h2>
          <p className="hero-meta">
            <StatusBadge roadmap={roadmap} status={stop.item.status} onStage />
            {stop.feature?.status && <span>Spec · {FEATURE_LABELS[stop.feature.status]}</span>}
            {age?.started && (
              <span>
                Started {age.started} · <span className="num">{age.days}</span> {age.days === 1 ? 'day' : 'days'}
              </span>
            )}
            {age?.quiet && <span className="tag hero-quiet">Quiet: nothing finished for 7 days</span>}
          </p>
        </div>
        {model && model.ring.total > 0 && <Ring done={model.ring.done} total={model.ring.total} label={`${stop.id} tasks done`} size={104} />}
      </div>

      {!model ? (
        <p className="hero-empty">
          No spec yet: the next step is its spec (<code>/spec-new {stop.id}</code>).
        </p>
      ) : (
        <>
          <Segments sections={model.segments} onStage />
          <div className="hero-grid">
            <section aria-labelledby="hero-now">
              <h3 id="hero-now" className="hero-label">
                Running now
              </h3>
              {model.running.length ? (
                <ul className="hero-tasks">
                  {model.running.map((t) => (
                    <li key={t.id} className={changed.has(`${stop.id}/${t.id}`) ? 'is-changed' : undefined}>
                      <span className="hero-live" aria-hidden="true" />
                      <a href={taskLink(stop.id, t.id)}>
                        <span className="num">{t.id}</span> <Md text={t.text} inline />
                      </a>
                      <span className="hero-sub">
                        {t.section}
                        {t.startedOn && ` · started ${t.startedOn}`}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="hero-sub">Nothing in progress.</p>
              )}
            </section>
            <section aria-labelledby="hero-next">
              <h3 id="hero-next" className="hero-label">
                Next
              </h3>
              {model.next ? (
                <p>
                  <a href={taskLink(stop.id, model.next.id)}>
                    <span className="num">{model.next.id}</span> <Md text={model.next.text} inline />
                  </a>
                </p>
              ) : (
                <p className="hero-sub">No task left to do.</p>
              )}
            </section>
            {model.blocked.length > 0 && (
              <section aria-labelledby="hero-blocked" className="hero-blocked">
                <h3 id="hero-blocked" className="hero-label">
                  Blocked
                </h3>
                <ul className="hero-tasks">
                  {model.blocked.map((t) => (
                    <li key={t.id}>
                      <a href={taskLink(stop.id, t.id)}>
                        <span className="num">{t.id}</span> <Md text={t.text} inline />
                      </a>
                      <span className="hero-sub">{t.reason ?? 'No reason given'}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </>
      )}

      {stop.link && (
        <p className="hero-open">
          <a href={href(`/feature/${stop.id}/board`)}>Open the board →</a>
        </p>
      )}

      {elsewhere.length > 0 && (
        <section aria-labelledby="roadblocks" className="hero-roadblocks">
          <h3 id="roadblocks" className="hero-label">
            Roadblocks elsewhere on the road ({elsewhere.length})
          </h3>
          <ul className="hero-tasks">
            {elsewhere.map((b) => (
              <li key={`${b.stop.id}/${b.task.id}`}>
                <a href={taskLink(b.stop.id, b.task.id)}>
                  <span className="num">
                    {b.stop.id} {b.task.id}
                  </span>{' '}
                  <Md text={b.task.text} inline />
                </a>
                <span className="hero-sub">{b.task.reason ?? 'No reason given'}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
