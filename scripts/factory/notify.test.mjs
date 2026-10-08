// Notifications (402 §5, T053, AC-13): the command for each platform, the message for a loop's stop, and the
// fallback when the desktop notification can't be shown. Nothing here raises a real notification.
import { describe, expect, it } from 'vitest';
import { notify, notifyCommand, stateMessage } from './notify.mjs';

describe('notifyCommand', () => {
  it('Windows: a PowerShell NotifyIcon balloon, with the text passed in the environment, not the script', () => {
    const c = notifyCommand({ title: 'Factory 402', body: 'stopped: "retries"; $(rm -rf /)' }, 'win32');
    expect(c.cmd).toBe('powershell.exe');
    expect(c.args).toEqual(expect.arrayContaining(['-NoProfile', '-NonInteractive', '-Command']));
    const script = c.args.at(-1);
    expect(script).toContain('System.Windows.Forms.NotifyIcon');
    expect(script).toContain('ShowBalloonTip');
    expect(script).toContain('$env:CHITTHI_NOTIFY_TITLE');
    expect(script).not.toContain('rm -rf');
    expect(c.env).toEqual({
      CHITTHI_NOTIFY_TITLE: 'Factory 402',
      CHITTHI_NOTIFY_BODY: 'stopped: "retries"; $(rm -rf /)',
    });
  });

  it('clips the title to 63 and the text to 255 characters (the balloon limits)', () => {
    const c = notifyCommand({ title: 'T'.repeat(100), body: 'b'.repeat(400) }, 'win32');
    expect(c.env.CHITTHI_NOTIFY_TITLE).toHaveLength(63);
    expect(c.env.CHITTHI_NOTIFY_BODY).toHaveLength(255);
    expect(c.env.CHITTHI_NOTIFY_BODY.endsWith('…')).toBe(true);
  });

  it('empty text falls back to the title (ShowBalloonTip throws on empty text)', () => {
    const c = notifyCommand({ title: 'Factory test', body: '' }, 'win32');
    expect(c.env.CHITTHI_NOTIFY_BODY).toBe('Factory test');
    expect(notifyCommand({ title: 'Factory test' }, 'darwin').args.at(-1)).toBe('Factory test');
  });

  it('macOS: osascript with the text as arguments; elsewhere none', () => {
    const c = notifyCommand({ title: 'Factory', body: 'done' }, 'darwin');
    expect(c.cmd).toBe('osascript');
    expect(c.args.slice(-2)).toEqual(['Factory', 'done']);
    expect(notifyCommand({ title: 'Factory', body: 'done' }, 'linux')).toBeNull();
  });
});

describe('stateMessage', () => {
  it('a stop: feature, kind and reason', () => {
    const m = stateMessage({
      feature: '402',
      task: 'T060',
      phase: 'stopped',
      attempt: 3,
      costUsd: 1.234,
      turns: 52,
      stop: { kind: 'retries', reason: 'failed 3 times' },
    });
    expect(m.title).toBe('Factory 402 stopped: retries');
    expect(m.body).toContain('T060');
    expect(m.body).toContain('failed 3 times');
    expect(m.body).toContain('US$1.23');
  });

  it('a run that ended without a stop record names the last phase', () => {
    const m = stateMessage({ feature: '402', task: 'T060', phase: 'gates', attempt: 1, costUsd: 0, turns: 0 });
    expect(m.title).toBe('Factory 402 ended');
    expect(m.body).toMatch(/without a stop record.*gates/);
  });

  it('no state at all', () => {
    expect(stateMessage(null).body).toMatch(/no \.factory\/state\.json/);
  });
});

describe('notify', () => {
  const capture = () => {
    const out = [];
    const err = [];
    return { out, err, write: (s) => out.push(s), writeErr: (s) => err.push(s) };
  };

  it('desktop shown: the line still goes to stdout, the bell rings on a terminal', () => {
    const io = capture();
    const runs = [];
    const r = notify(
      { title: 'Factory 402 stopped: budget', body: 'spent' },
      { platform: 'win32', isTTY: true, run: (c) => (runs.push(c), { code: 0 }), ...io },
    );
    expect(r.channel).toBe('desktop');
    expect(runs).toHaveLength(1);
    expect(io.out.join('')).toContain('Factory 402 stopped: budget — spent');
    expect(io.err.join('')).toContain('\u0007');
  });

  it('desktop fails or is unavailable: stdout only, and it says so; no bell without a terminal', () => {
    const io = capture();
    const r = notify(
      { title: 'T', body: 'B' },
      { platform: 'win32', isTTY: false, run: () => ({ code: 1, err: 'no desktop' }), ...io },
    );
    expect(r.channel).toBe('stdout');
    expect(io.out.join('')).toMatch(/T — B/);
    expect(io.out.join('')).toMatch(/desktop notification failed: no desktop/);
    expect(io.err.join('')).toBe('');
    const io2 = capture();
    expect(notify({ title: 'T', body: 'B' }, { platform: 'linux', run: () => ({ code: 0 }), ...io2 }).channel).toBe(
      'stdout',
    );
  });

  it('CHITTHI_FACTORY_NOTIFY=off: stdout only, no command run', () => {
    const io = capture();
    let ran = false;
    const r = notify(
      { title: 'T', body: 'B' },
      { platform: 'win32', env: { CHITTHI_FACTORY_NOTIFY: 'off' }, run: () => ((ran = true), { code: 0 }), ...io },
    );
    expect(r.channel).toBe('stdout');
    expect(ran).toBe(false);
  });
});
