// The "Now" panel: the Current State section of memory/MEMORY.md and the newest entry of memory/progress.md.

/** Level-2 sections outside code fences: [{ title, lines }]. */
function sections(text) {
  const out = [];
  let inFence = false;
  let current = null;
  for (const line of String(text ?? '').split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    const h = !inFence && /^##\s+(.*?)\s*$/.exec(line);
    if (h) out.push((current = { title: h[1], lines: [] }));
    else if (/^#\s/.test(line) && !inFence) current = null;
    else if (current) current.lines.push(line);
  }
  return out;
}

/** Trims blank lines and closing --- rules around a section body. */
function body(lines) {
  const l = [...lines];
  while (l.length && (!l[0].trim() || /^-{3,}\s*$/.test(l[0]))) l.shift();
  while (l.length && (!l.at(-1).trim() || /^-{3,}\s*$/.test(l.at(-1)))) l.pop();
  return l.join('\n');
}

export function currentState(text) {
  const s = sections(text).find((x) => /^Current State\b/i.test(x.title));
  return s ? { title: s.title, markdown: body(s.lines) } : null;
}

export function latestProgress(text) {
  const s = sections(text)[0];
  return s ? { title: s.title, markdown: body(s.lines) } : null;
}
