import { useEffect, useState } from 'react';
import { perfReport, watchPerf, type PerfInfo, type PerfSample } from '../lib/perf';
import { toast } from '../lib/toast';
import { setPerf } from '../state/store';
import { ActivityIcon, CloseIcon } from './icons';
import { logError } from '../lib/errors';

/*
 * Performance monitor: a small floating panel with the app's CPU (desktop) or main-thread load (web), frame rate,
 * memory, photos held in memory, page size and storage. Open it from More → Performance monitor, Find a feature, or
 * View → Performance monitor on desktop. It samples once a second only while it is open (lib/perf.ts).
 */

const MB = 1024 * 1024;
const mb = (b?: number) =>
  b === undefined ? '–' : b >= 1024 * MB ? `${(b / 1024 / MB).toFixed(1)} GB` : b >= MB ? `${Math.round(b / MB)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;
type Level = '' | 'warn' | 'bad';
const level = (v: number | undefined, warn: number, bad: number): Level => (v === undefined ? '' : v >= bad ? 'bad' : v >= warn ? 'warn' : '');

function Spark({ values, max }: { values: (number | undefined)[]; max?: number }) {
  const v = values.map((x) => x ?? 0);
  if (v.length < 2) return <svg className="spark" viewBox="0 0 100 24" aria-hidden="true" />;
  const top = max ?? Math.max(1, ...v) * 1.15;
  const pts = v.map((x, i) => `${((i / (v.length - 1)) * 100).toFixed(1)},${(23 - (Math.min(x, top) / top) * 22).toFixed(1)}`).join(' ');
  return (
    <svg className="spark" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={`0,24 ${pts} 100,24`} className="spark-fill" />
      <polyline points={pts} className="spark-line" />
    </svg>
  );
}

function Metric({ name, value, sub, lv = '', spark }: { name: string; value: string; sub?: string; lv?: Level; spark?: React.ReactNode }) {
  return (
    <div className={`pm-row ${lv}`}>
      <div className="pm-head">
        <span className="pm-name">{name}</span>
        <b className="pm-val">{value}</b>
      </div>
      {spark}
      {sub && <small className="pm-sub">{sub}</small>}
    </div>
  );
}

export function PerfMonitor() {
  const [samples, setSamples] = useState<PerfSample[]>([]),
    [info, setInfo] = useState<PerfInfo | null>(null),
    [small, setSmall] = useState(() => matchMedia('(max-width: 600px)').matches);
  useEffect(
    () =>
      watchPerf((s, i) => {
        setSamples(s);
        setInfo({ ...i });
      }),
    [],
  );
  const last = samples[samples.length - 1];
  const desk = info?.where === 'desktop';
  const series = <K extends keyof PerfSample>(k: K) => samples.map((s) => s[k] as number | undefined);
  const heapShare = last?.heap && last.heapLimit ? (last.heap / last.heapLimit) * 100 : undefined;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(perfReport());
      toast(`Performance report copied (${samples.length} seconds of samples).`);
    } catch (e) {
      logError('handled', e);
      toast('Couldn’t copy: the browser blocked the clipboard.');
    }
  };

  const headline = !last ? 'Measuring…' : desk ? `CPU ${last.cpu ?? 0}% · ${last.fps} fps` : `Busy ${last.busy}% · ${last.fps} fps`;
  return (
    <aside className={`pm${small ? ' small' : ''}`} aria-label="Performance monitor">
      <div className="pm-top">
        <button type="button" className="pm-title" aria-expanded={!small} title={small ? 'Show details' : 'Hide details'} onClick={() => setSmall(!small)}>
          <ActivityIcon />
          <span>{small ? headline : 'Performance'}</span>
          {!small && <em>{desk ? 'desktop' : 'web'}</em>}
        </button>
        {!small && (
          <button type="button" className="pm-btn" onClick={() => void copy()} title="Copy a JSON report of the last two minutes">
            Copy report
          </button>
        )}
        <button type="button" className="pm-btn icon" aria-label="Close the performance monitor" onClick={() => setPerf(false)}>
          <CloseIcon />
        </button>
      </div>
      {!small && (
        <div className="pm-body" aria-live="off">
          {desk ? (
            <Metric
              name="CPU (whole app)"
              value={`${last?.cpu ?? 0}%`}
              lv={level(last?.cpu, 40, 75)}
              spark={<Spark values={series('cpu')} max={100} />}
              sub={
                last?.cpuBy
                  ? Object.entries(last.cpuBy)
                      .map(([k, v]) => `${k} ${v}%`)
                      .join(' · ') + ` (of one core; ${info?.cores} cores)`
                  : undefined
              }
            />
          ) : (
            <Metric
              name="Main thread busy (estimate)"
              value={`${last?.busy ?? 0}%`}
              lv={level(last?.busy, 20, 50)}
              spark={<Spark values={series('busy')} max={100} />}
              sub={info?.longTaskSupported ? `${last?.longTasks ?? 0} long tasks this second · browsers don't report CPU use` : 'Long tasks aren’t reported by this browser; see input delay'}
            />
          )}
          <Metric name="Input delay (worst, last second)" value={`${last?.lag ?? 0} ms`} lv={level(last?.lag, 50, 200)} spark={<Spark values={series('lag')} />} />
          <Metric name="Frames per second" value={`${last?.fps ?? 0}`} spark={<Spark values={series('fps')} max={70} />} sub="How many frames the browser managed to draw; drops mean the page was busy" />
          {desk && (
            <Metric
              name="Memory (whole app)"
              value={mb(last?.mem)}
              lv={level(last?.mem && info?.systemMemory ? (last.mem / info.systemMemory) * 100 : undefined, 25, 50)}
              spark={<Spark values={series('mem')} />}
              sub={info?.systemMemory ? `of ${mb(info.systemMemory)} in this computer` : undefined}
            />
          )}
          <Metric
            name="JavaScript memory"
            value={info?.heapSupported ? mb(last?.heap) : 'not reported'}
            lv={level(heapShare, 60, 85)}
            spark={info?.heapSupported ? <Spark values={series('heap')} /> : undefined}
            sub={info?.heapSupported && last?.heapLimit ? `limit ${mb(last.heapLimit)}` : 'Only Chromium browsers report it'}
          />
          <div className="pm-grid">
            <Metric
              name="Photos"
              value={`${last?.photos ?? 0}`}
              sub={`${mb(last?.photoBytes)} decoded · undo ${last?.undoSteps ?? 0} steps${last?.undoBytes ? ` + ${mb(last.undoBytes)}` : ''}`}
              lv={level((last?.photoBytes ?? 0) + (last?.undoBytes ?? 0), 400 * MB, 900 * MB)}
            />
            <Metric name="Elements" value={`${last?.dom ?? 0}`} lv={level(last?.dom, 4000, 8000)} />
            <Metric name={desk ? 'Saved data' : 'Storage'} value={mb(info?.storageUsed)} sub={info?.storageQuota ? `of ${mb(info.storageQuota)}` : undefined} />
          </div>
          <p className="pm-note">Samples once a second while open; nothing is sent anywhere. Copy the report to compare two runs.</p>
        </div>
      )}
    </aside>
  );
}
