// The pace of the work (405 AC-13, AC-14): tasks finished today and per day over the last 14 days (numbers as text for
// screen readers), and a stop's age line (started, days, days it took, quiet).
import { featureAge, finishedOn, perDay } from '../lib/pace';
import type { Stop } from '../lib/road';
import { href } from '../route';
import type { FeatureSummary } from '../types';
import { Md } from './bits';

const DAYS = 14;
const weekday = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'narrow' });

export function Activity({ features, today }: { features: Record<string, FeatureSummary>; today: string }) {
  const days = perDay(features, today, DAYS);
  const max = Math.max(1, ...days.map((d) => d.count));
  const total = days.reduce((a, d) => a + d.count, 0);
  const done = finishedOn(features, today);
  return (
    <section className="activity" aria-labelledby="activity-title">
      <div className="activity-head">
        <h2 id="activity-title" className="section-title">
          Pace
        </h2>
        <p className="muted">
          <span className="num">{total}</span> tasks finished in the last {DAYS} days · <span className="num">{done.length}</span> today
        </p>
      </div>
      <div className="activity-body">
        <ol className="pace" aria-label={`Tasks finished per day, the last ${DAYS} days`}>
          {days.map((d) => (
            <li key={d.day} className={d.day === today ? 'is-today' : undefined}>
              <span className="pace-bar" aria-hidden="true">
                <span className="pace-fill" style={{ transform: `scaleY(${d.count / max})` }} />
              </span>
              <span className="num pace-count" aria-hidden="true">
                {d.count || ''}
              </span>
              <span className="pace-day" aria-hidden="true">
                {weekday(d.day)}
              </span>
              <span className="sr-only">
                {d.day}: {d.count} {d.count === 1 ? 'task' : 'tasks'}
              </span>
            </li>
          ))}
        </ol>
        <div className="activity-today">
          <h3>Finished today</h3>
          {done.length ? (
            <ul>
              {done.map((t) => (
                <li key={`${t.feature}/${t.id}`}>
                  <a href={href(`/feature/${t.feature}/board`, { q: t.id })}>
                    <span className="num">
                      {t.feature} {t.id}
                    </span>{' '}
                    <Md text={t.text} inline />
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Nothing yet today.</p>
          )}
        </div>
      </div>
    </section>
  );
}

/** A stop's age line: started and days so far, or the days it took; "quiet" after 7 days without a finished task. */
export function StopAge({ stop, today }: { stop: Stop; today: string }) {
  if (!stop.feature) return null;
  const age = featureAge(stop.feature, today);
  if (!age.started) return null;
  return (
    <span className="stop-age">
      {age.took !== null ? (
        <>
          Took <span className="num">{age.took}</span> {age.took === 1 ? 'day' : 'days'}
        </>
      ) : (
        <>
          Started {age.started} · <span className="num">{age.days}</span> {age.days === 1 ? 'day' : 'days'}
        </>
      )}
      {age.quiet && <span className="tag warn">Quiet</span>}
    </span>
  );
}
