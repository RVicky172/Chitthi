import { useEffect, useState, type ReactNode } from 'react';
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

/**
 * Bytes as KB, MB or GB; a dash when unknown.
 * @param bytes the size
 * @returns the text
 */
function mb(bytes?: number): string {
  if (bytes === undefined) return '–';
  if (bytes >= 1024 * MB) return `${(bytes / 1024 / MB).toFixed(1)} GB`;
  if (bytes >= MB) return `${Math.round(bytes / MB)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

type Level = '' | 'warn' | 'bad';

/**
 * How worrying a value is.
 * @param value the value, or undefined
 * @param warn from where it warns
 * @param bad from where it is bad
 * @returns the level ('' when fine or unknown)
 */
function level(value: number | undefined, warn: number, bad: number): Level {
  if (value === undefined) return '';
  if (value >= bad) return 'bad';
  return value >= warn ? 'warn' : '';
}

/** The numeric fields of a sample. */
type NumericSample = {
  [Key in keyof PerfSample]-?: NonNullable<PerfSample[Key]> extends number ? Key : never;
}[keyof PerfSample];

/** A sparkline's values. */
interface SparkProps {
  values: (number | undefined)[];
  /** The top of the scale; else a little above the largest value. */
  max?: number;
}

/**
 * A small line chart of the last samples.
 * @param props the values and the top of the scale
 */
function Spark({ values, max }: Readonly<SparkProps>) {
  const filled = values.map((value) => value ?? 0);
  if (filled.length < 2) return <svg className="spark" viewBox="0 0 100 24" aria-hidden="true" />;
  const top = max ?? Math.max(1, ...filled) * 1.15;
  const points = filled
    .map(
      (value, index) =>
        `${((index / (filled.length - 1)) * 100).toFixed(1)},${(23 - (Math.min(value, top) / top) * 22).toFixed(1)}`,
    )
    .join(' ');
  return (
    <svg className="spark" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={`0,24 ${points} 100,24`} className="spark-fill" />
      <polyline points={points} className="spark-line" />
    </svg>
  );
}

/** One measurement. */
interface MetricProps {
  name: string;
  value: string;
  sub?: string;
  lv?: Level;
  spark?: ReactNode;
}

/**
 * A measurement's row: name, value, sparkline and a note, coloured by its level.
 * @param props the name, value, note, level and sparkline
 */
function Metric({ name, value, sub, lv = '', spark }: Readonly<MetricProps>) {
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

/**
 * The line shown when the panel is small.
 * @param last the latest sample, if any
 * @param desk whether this is the desktop app
 * @returns the headline
 */
function headlineOf(last: PerfSample | undefined, desk: boolean): string {
  if (!last) return 'Measuring…';
  return desk ? `CPU ${last.cpu ?? 0}% · ${last.fps} fps` : `Busy ${last.busy}% · ${last.fps} fps`;
}

/**
 * The CPU note on desktop: the share of each process type, of one core.
 * @param last the latest sample, if any
 * @param info what the monitor knows about the machine
 * @returns the note, or undefined
 */
function cpuNote(last: PerfSample | undefined, info: PerfInfo | null): string | undefined {
  if (!last?.cpuBy) return undefined;
  const parts = Object.entries(last.cpuBy)
    .map(([part, percent]) => `${part} ${percent}%`)
    .join(' · ');
  return `${parts} (of one core; ${info?.cores} cores)`;
}

/**
 * The photos note: decoded bytes and the undo history.
 * @param last the latest sample, if any
 * @returns the note
 */
function photosNote(last: PerfSample | undefined): string {
  const undoBytes = last?.undoBytes ? ` + ${mb(last.undoBytes)}` : '';
  return `${mb(last?.photoBytes)} decoded · undo ${last?.undoSteps ?? 0} steps${undoBytes}`;
}

/** The samples and what is known about the machine. */
interface PerfDetailsProps {
  samples: PerfSample[];
  info: PerfInfo | null;
}

/**
 * The panel's measurements: CPU or main-thread load, input delay, frames, memory, photos, elements and storage.
 * @param props the samples and the machine's info
 */
function PerfDetails({ samples, info }: Readonly<PerfDetailsProps>) {
  const last = samples.at(-1);
  const desk = info?.where === 'desktop';
  const series = (key: NumericSample) => samples.map((sample) => sample[key]);
  const heapShare = last?.heap && last.heapLimit ? (last.heap / last.heapLimit) * 100 : undefined;
  const memShare = last?.mem && info?.systemMemory ? (last.mem / info.systemMemory) * 100 : undefined;
  return (
    <div className="pm-body" aria-live="off">
      {desk ? (
        <Metric
          name="CPU (whole app)"
          value={`${last?.cpu ?? 0}%`}
          lv={level(last?.cpu, 40, 75)}
          spark={<Spark values={series('cpu')} max={100} />}
          sub={cpuNote(last, info)}
        />
      ) : (
        <Metric
          name="Main thread busy (estimate)"
          value={`${last?.busy ?? 0}%`}
          lv={level(last?.busy, 20, 50)}
          spark={<Spark values={series('busy')} max={100} />}
          sub={
            info?.longTaskSupported
              ? `${last?.longTasks ?? 0} long tasks this second · browsers don't report CPU use`
              : 'Long tasks aren’t reported by this browser; see input delay'
          }
        />
      )}
      <Metric
        name="Input delay (worst, last second)"
        value={`${last?.lag ?? 0} ms`}
        lv={level(last?.lag, 50, 200)}
        spark={<Spark values={series('lag')} />}
      />
      <Metric
        name="Frames per second"
        value={`${last?.fps ?? 0}`}
        spark={<Spark values={series('fps')} max={70} />}
        sub="How many frames the browser managed to draw; drops mean the page was busy"
      />
      {desk && (
        <Metric
          name="Memory (whole app)"
          value={mb(last?.mem)}
          lv={level(memShare, 25, 50)}
          spark={<Spark values={series('mem')} />}
          sub={info.systemMemory ? `of ${mb(info.systemMemory)} in this computer` : undefined}
        />
      )}
      <Metric
        name="JavaScript memory"
        value={info?.heapSupported ? mb(last?.heap) : 'not reported'}
        lv={level(heapShare, 60, 85)}
        spark={info?.heapSupported ? <Spark values={series('heap')} /> : undefined}
        sub={
          info?.heapSupported && last?.heapLimit ? `limit ${mb(last.heapLimit)}` : 'Only Chromium browsers report it'
        }
      />
      <div className="pm-grid">
        <Metric
          name="Photos"
          value={`${last?.photos ?? 0}`}
          sub={photosNote(last)}
          lv={level((last?.photoBytes ?? 0) + (last?.undoBytes ?? 0), 400 * MB, 900 * MB)}
        />
        <Metric name="Elements" value={`${last?.dom ?? 0}`} lv={level(last?.dom, 4000, 8000)} />
        <Metric
          name={desk ? 'Saved data' : 'Storage'}
          value={mb(info?.storageUsed)}
          sub={info?.storageQuota ? `of ${mb(info.storageQuota)}` : undefined}
        />
      </div>
      <p className="pm-note">
        Samples once a second while open; nothing is sent anywhere. Copy the report to compare two runs.
      </p>
    </div>
  );
}

/** The performance monitor: a floating panel with a headline, copy report and close, and the measurements. */
export function PerfMonitor() {
  const [samples, setSamples] = useState<PerfSample[]>([]),
    [info, setInfo] = useState<PerfInfo | null>(null),
    [small, setSmall] = useState(() => matchMedia('(max-width: 600px)').matches);
  useEffect(
    () =>
      watchPerf((sample, latest) => {
        setSamples(sample);
        setInfo({ ...latest });
      }),
    [],
  );
  const desk = info?.where === 'desktop';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(perfReport());
      toast(`Performance report copied (${samples.length} seconds of samples).`);
    } catch (error) {
      logError('handled', error);
      toast('Couldn’t copy: the browser blocked the clipboard.');
    }
  };

  return (
    <aside className={`pm${small ? ' small' : ''}`} aria-label="Performance monitor">
      <div className="pm-top">
        <button
          type="button"
          className="pm-title"
          aria-expanded={!small}
          title={small ? 'Show details' : 'Hide details'}
          onClick={() => setSmall(!small)}
        >
          <ActivityIcon />
          <span>{small ? headlineOf(samples.at(-1), desk) : 'Performance'}</span>
          {!small && <em>{desk ? 'desktop' : 'web'}</em>}
        </button>
        {!small && (
          <button
            type="button"
            className="pm-btn"
            onClick={() => void copy()}
            title="Copy a JSON report of the last two minutes"
          >
            Copy report
          </button>
        )}
        <button
          type="button"
          className="pm-btn icon"
          aria-label="Close the performance monitor"
          onClick={() => setPerf(false)}
        >
          <CloseIcon />
        </button>
      </div>
      {!small && <PerfDetails samples={samples} info={info} />}
    </aside>
  );
}
