#!/usr/bin/env node
/*
 * Desktop notifications for the software factory (402 plan §5, Q6, AC-13). No module to install:
 *   Windows  a NotifyIcon balloon through PowerShell (shown as a toast on Windows 10 / 11)
 *   macOS    osascript `display notification`
 *   always   one line on stdout (the fallback, and the log), plus the terminal bell when stderr is a terminal
 *
 *   node scripts/factory/notify.mjs "<title>" "<text>"
 *   node scripts/factory/notify.mjs --state [path]     the loop's stop, from .factory/state.json (run.mjs)
 * CHITTHI_FACTORY_NOTIFY=off keeps it to stdout. Exit code 0 even when the desktop notification fails: a missing
 * toast must never turn a finished run red.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const TITLE_MAX = 63; // NotifyIcon.BalloonTipTitle
const BODY_MAX = 255; // NotifyIcon.BalloonTipText
const clip = (s, n) => {
  const t = String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t;
};

// The text reaches PowerShell through the environment, never through the script, so nothing in it is ever code.
const BALLOON = [
  'Add-Type -AssemblyName System.Windows.Forms, System.Drawing',
  '$n = New-Object System.Windows.Forms.NotifyIcon',
  '$n.Icon = [System.Drawing.SystemIcons]::Information',
  '$n.Text = "Chitthi Factory"',
  '$n.Visible = $true',
  '$n.ShowBalloonTip(10000, $env:CHITTHI_NOTIFY_TITLE, $env:CHITTHI_NOTIFY_BODY, [System.Windows.Forms.ToolTipIcon]::Info)',
  // The balloon lives only as long as its icon: keep the process a moment, then remove the tray icon.
  'Start-Sleep -Seconds 6',
  '$n.Dispose()',
].join('; ');

/** The command that shows { title, body } on this platform, or null where there is none (stdout only). */
export function notifyCommand({ title, body }, platform = process.platform) {
  const t = clip(title, TITLE_MAX);
  const b = clip(body, BODY_MAX) || t; // ShowBalloonTip throws on empty text, yet -Command may still exit 0
  if (platform === 'win32')
    return {
      cmd: 'powershell.exe',
      args: [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-WindowStyle',
        'Hidden',
        '-Command',
        BALLOON,
      ],
      env: { CHITTHI_NOTIFY_TITLE: t, CHITTHI_NOTIFY_BODY: b },
    };
  if (platform === 'darwin')
    return {
      cmd: 'osascript',
      args: [
        '-e',
        'on run argv',
        '-e',
        'display notification (item 2 of argv) with title (item 1 of argv)',
        '-e',
        'end run',
        t,
        b,
      ],
      env: {},
    };
  return null;
}

/** The notification for the loop's last state (.factory/state.json): its stop, or how it ended without one. */
export function stateMessage(state) {
  if (!state) return { title: 'Factory', body: 'The run ended; there is no .factory/state.json to say how.' };
  const where = [
    state.task,
    state.attempt ? `attempt ${state.attempt}` : '',
    `US$${(Number(state.costUsd) || 0).toFixed(2)}`,
    `${state.turns ?? 0} turns`,
  ]
    .filter(Boolean)
    .join(' · ');
  if (state.stop)
    return { title: `Factory ${state.feature} stopped: ${state.stop.kind}`, body: `${state.stop.reason} (${where})` };
  return {
    title: `Factory ${state.feature} ended`,
    body: `It ended without a stop record; last phase ${state.phase ?? '?'} (${where}). See its output.`,
  };
}

function runForReal({ cmd, args, env }) {
  const r = spawnSync(cmd, args, {
    env: { ...process.env, ...env },
    encoding: 'utf8',
    windowsHide: true,
    timeout: 30_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return { code: r.error ? 1 : (r.status ?? 1), err: String(r.error ?? r.stderr ?? '').trim() };
}

/**
 * Shows { title, body }: desktop when it can, always a stdout line, the bell on a terminal.
 * deps: { platform, env, isTTY, run(command) → { code, err }, write, writeErr }. Resolves { channel: desktop | stdout }.
 */
export function notify(msg, deps = {}) {
  const {
    platform = process.platform,
    env = process.env,
    isTTY = Boolean(process.stderr.isTTY),
    run = runForReal,
  } = deps;
  const write = deps.write ?? ((s) => process.stdout.write(s));
  const writeErr = deps.writeErr ?? ((s) => process.stderr.write(s));
  if (isTTY) writeErr('\u0007');
  let channel = 'stdout';
  let note = '';
  const command = env.CHITTHI_FACTORY_NOTIFY === 'off' ? null : notifyCommand(msg, platform);
  if (command) {
    const r = run(command);
    if (r.code === 0) channel = 'desktop';
    else note = ` (desktop notification failed: ${clip(r.err || `exit ${r.code}`, 200)})`;
  }
  write(`🔔 ${msg.title} — ${msg.body}${note}\n`);
  return { channel };
}

function main(argv) {
  if (argv[0] === '--state') {
    const p = argv[1] ?? join(process.cwd(), '.factory/state.json');
    let state = null;
    try {
      state = JSON.parse(readFileSync(p, 'utf8'));
    } catch {
      // no state or half-written: stateMessage says so
    }
    notify(stateMessage(state));
    return 0;
  }
  if (!argv.length) {
    console.error('usage: node scripts/factory/notify.mjs "<title>" "<text>"  |  --state [path]');
    return 2;
  }
  notify({ title: argv[0], body: argv.slice(1).join(' ') });
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exit(main(process.argv.slice(2)));
