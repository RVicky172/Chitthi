// The pace of the work (405): tasks finished per day and today, and how long each feature has been moving. Dates are
// local YYYY-MM-DD, as the CLI writes them (localToday), so day arithmetic runs on calendar dates, not clock times.
import type { FeatureSummary } from '../types';

const toNum = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
};
const toDay = (n: number) => new Date(n * 86_400_000).toISOString().slice(0, 10);
/** Whole days from `a` to `b`. */
export const daysBetween = (a: string, b: string) => Math.round(toNum(b) - toNum(a));

/** Local today as YYYY-MM-DD. */
export function localToday(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** Finished tasks per day for the `days` days ending `today`, oldest first; days with none count 0. */
export function perDay(features: Record<string, FeatureSummary>, today: string, days: number): { day: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const f of Object.values(features)) for (const t of f.progress?.finished ?? []) counts.set(t.doneOn, (counts.get(t.doneOn) ?? 0) + 1);
  const end = toNum(today);
  return Array.from({ length: days }, (_, i) => {
    const day = toDay(end - (days - 1 - i));
    return { day, count: counts.get(day) ?? 0 };
  });
}

/** The tasks finished on `day`, with their feature. */
export function finishedOn(features: Record<string, FeatureSummary>, day: string): { feature: string; id: string; text: string }[] {
  return Object.values(features).flatMap((f) =>
    (f.progress?.finished ?? []).filter((t) => t.doneOn === day).map((t) => ({ feature: f.id, id: t.id, text: t.text })),
  );
}

/** Days without a finished task after which a feature in progress is "quiet". */
export const QUIET_DAYS = 7;

/**
 * How long a feature has been moving: its start, days since, days it took (done features) and whether it is quiet (in
 * progress, nothing finished for 7 days; a feature started less than 7 days ago counts from its start).
 */
export function featureAge(f: FeatureSummary, today: string): { started: string | null; days: number | null; took: number | null; quiet: boolean } {
  const started = f.dates?.started ?? null;
  const done = f.dates?.done ?? null;
  const last = [started, ...(f.progress?.finished ?? []).map((t) => t.doneOn)].filter((d): d is string => Boolean(d)).sort().at(-1);
  return {
    started,
    days: started ? daysBetween(started, today) : null,
    took: f.status === 'implemented' && started && done ? daysBetween(started, done) : null,
    quiet: f.status === 'in-progress' && Boolean(last) && daysBetween(last!, today) >= QUIET_DAYS,
  };
}
