/*
 * Guardrails (402 plan §3): what an agent may edit and run. Pure functions; the Claude Code hooks in .claude/hooks/
 * call them. Each answer is { ok, reason? }, and the reason is what the agent is told.
 */

const norm = (p) => String(p).replace(/\\/g, '/').replace(/^\.\//, '');

/**
 * Code under src/ or electron/ needs the branch's feature (feat/NNN-*) to have an approved spec (Constitution I).
 * Branches that name no feature (main, fix/…, chore/…) may change code without one: bug fixes don't need a spec.
 */
export function editAllowed(path, branch, statusOf) {
  const p = norm(path);
  if (p.startsWith('../') || p.startsWith('/') || /^[A-Za-z]:\//.test(p)) return { ok: true };
  if (!/^(src|electron)\//.test(p)) return { ok: true };
  const nnn = /^feat\/(\d{3})-/.exec(branch ?? '')?.[1];
  if (!nnn) return { ok: true };
  const status = statusOf(nnn);
  if (!status) return { ok: false, reason: `no spec for ${nnn}: write specs/features/${nnn}-*/spec.md and have it Approved before changing ${p} (Constitution I)` };
  if (/^(Approved|In Progress|Implemented)$/i.test(status.trim())) return { ok: true };
  return { ok: false, reason: `spec ${nnn} is ${status}: code under src/ and electron/ waits until it is Approved (Constitution I)` };
}

/** Drops heredoc bodies (`<<'EOF' … EOF`): they are data, such as a commit message. */
function stripHeredocs(cmd) {
  const out = [];
  let end = null;
  for (const line of cmd.split(/\r?\n/)) {
    if (end) {
      if (line.trim() === end) end = null;
      continue;
    }
    const m = /<<-?\s*(['"]?)(\w+)\1/.exec(line);
    if (m) end = m[2];
    out.push(line);
  }
  return out.join('\n');
}

/** Replaces quoted strings with placeholders, so `git commit -m "… git push --force …"` isn't read as a command. */
function hideQuotes(cmd) {
  const quoted = [];
  // U+E000 (private use) marks a placeholder: it never appears in a command, and it isn't a control character.
  const hide = (s) => `\uE000${quoted.push(s) - 1}\uE000`;
  const text = cmd.replace(/"(?:\\.|[^"\\])*"/g, hide).replace(/'[^']*'/g, hide);
  return { text, show: (s) => s.replace(/\uE000(\d+)\uE000/g, (_, i) => quoted[Number(i)]) };
}

const tokens = (s) => s.replace(/[{}()]/g, ' ').trim().split(/\s+/).filter(Boolean);
const DISCARD = 'discards work in the tree: stash it instead (git stash push -u -m "…")';

function checkGit(words) {
  let i = 1;
  while (i < words.length && words[i].startsWith('-')) i += /^-(C|c)$/.test(words[i]) ? 2 : 1;
  const sub = words[i];
  const args = words.slice(i + 1);
  const shortHas = (flag) => args.some((a) => /^-[a-zA-Z]+$/.test(a) && a.includes(flag));
  if (sub === 'push' && (args.some((a) => a.startsWith('--force') || (a.startsWith('+') && a.length > 1)) || shortHas('f')))
    return 'a force push is never done by an agent (402 §3)';
  if (sub === 'tag' && args.length && !args.some((a) => a === '-l' || a.startsWith('--list'))) return "git tag is the maintainer's step (specs/release.md); listing tags (-l) is fine";
  if (sub === 'reset' && args.includes('--hard')) return `git reset --hard ${DISCARD}`;
  if (sub === 'clean' && (shortHas('f') || args.some((a) => a.startsWith('--force')))) return `git clean -f ${DISCARD}`;
  if (sub === 'restore' && !args.includes('--staged') && args.some((a) => a === '.' || a === ':/')) return `git restore . ${DISCARD}`;
  if (sub === 'checkout' && args.includes('--') && args.slice(args.indexOf('--') + 1).some((a) => a === '.' || a === ':/'))
    return `git checkout -- . ${DISCARD}`;
  return null;
}

function checkSegment(segment, show) {
  for (const m of segment.matchAll(/\b(git|sed|prettier|npm)\b/g)) {
    const words = tokens(segment.slice(m.index));
    if (m[1] === 'git') {
      const r = checkGit(words);
      if (r) return r;
    } else if (m[1] === 'sed' && words.slice(1).some((a) => /^-[a-zA-Z]*i/.test(a) || a.startsWith('--in-place')))
      return 'sed -i rewrites whole files and their line endings (memory/learnings.md): use the Edit tool';
    else if (m[1] === 'prettier' && words.some((a) => a === '--write' || a === '-w')) {
      const targets = words.slice(1).filter((a) => !a.startsWith('-')).map(show);
      if (targets.some((t) => /^["']?(\.\/)?src(\/|["']?$)/.test(t)))
        return 'Prettier on src/ rewrites whole old files (memory/learnings.md): format only files you created';
    } else if (m[1] === 'npm' && words[1] === 'run' && words[2] === 'format') return 'npm run format rewrites every file in src/ (memory/learnings.md)';
  }
  return null;
}

/** Bash or PowerShell command lines: each part of a chain (`;`, `&&`, `||`, `|`, new lines) is checked. */
export function commandAllowed(command) {
  const { text, show } = hideQuotes(stripHeredocs(String(command)));
  for (const segment of text.split(/\n|;|&&|\|\||\|/)) {
    const reason = checkSegment(segment, show);
    if (reason) return { ok: false, reason };
  }
  return { ok: true };
}

/** `git status --porcelain` (v1) → the changed paths: renames give the new name, quoted paths are unquoted. */
export function changedPaths(porcelain) {
  return String(porcelain)
    .split(/\r?\n/)
    .filter((l) => l.length > 3)
    .map((l) => {
      const xy = l.slice(0, 2);
      let path = l.slice(3);
      if (path.includes(' -> ')) path = path.split(' -> ').pop();
      if (path.startsWith('"') && path.endsWith('"')) path = path.slice(1, -1).replace(/\\"/g, '"');
      return { path, untracked: xy === '??', deleted: xy.includes('D') };
    });
}

/** Stop hook, before running anything: only code that changed since the last green check is checked again. */
export function stopAction({ codeChanged, hash, passedHash }) {
  if (!codeChanged) return 'pass';
  return hash && hash === passedHash ? 'pass' : 'check';
}

/** Stop hook, after `npm run check`: a red check blocks the turn once; the second time the turn ends, recorded. */
export function afterCheck({ ok, active }) {
  if (ok) return 'pass';
  return active ? 'give-up' : 'block';
}
