// A small, safe Markdown renderer for the generated spec, plan and tasks documents (no dependency). Every character
// from the text is escaped before any formatting is applied, so no HTML from a file reaches the page. Supported:
// headings (shifted down one level), paragraphs, nested lists with checkboxes, GitHub tables, fenced code, block
// quotes, rules, inline code, bold, italic, links. HTML comments are dropped.

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (s: string) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

interface Opts {
  featureId?: string;
}

const TAB: Record<string, string> = { spec: 'spec', plan: 'plan', tasks: 'board' };
const FEATURE_DOC = /(?:^|\/)features\/(\d{3})-[a-z0-9-]+\/(spec|plan|tasks)\.md(?:#.*)?$/;
const LOCAL_DOC = /^(?:\.\/)?(spec|plan|tasks)\.md(?:#.*)?$/;
const LIST = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const FENCE = /^\s*(```|~~~)/;

function emphasis(s: string) {
  return s
    .replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^\w*])\*([^*\s][^*]*?)\*(?![\w*])/g, '$1<em>$2</em>')
    .replace(/(^|[^\w])_([^_\s][^_]*?)_(?!\w)/g, '$1<em>$2</em>');
}

function link(label: string, url: string, featureId?: string) {
  if (/^https?:\/\//i.test(url)) return `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  let m = FEATURE_DOC.exec(url);
  if (m) return `<a href="#/feature/${m[1]}/${TAB[m[2]]}">${label}</a>`;
  m = LOCAL_DOC.exec(url);
  if (m && featureId) return `<a href="#/feature/${featureId}/${TAB[m[1]]}">${label}</a>`;
  // Other repository files aren't served; javascript: and the like never become links.
  return `<span class="ref" title="${url}">${label}</span>`;
}

/** One line of text → safe HTML. */
export function renderInline(text: string, { featureId }: Opts = {}): string {
  const slots: string[] = [];
  // Finished HTML waits in slots behind a private-use character that can't occur in the docs.
  const hold = (html: string) => `${slots.push(html) - 1}`;
  let s = String(text).replace(/`([^`\n]+)`/g, (_m, code: string) => hold(`<code>${escapeHtml(code)}</code>`));
  s = escapeHtml(s);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, url: string) => hold(link(emphasis(label), url, featureId)));
  s = emphasis(s);
  while (/\d+/.test(s)) s = s.replace(/(\d+)/g, (_m, i: string) => slots[Number(i)]);
  return s;
}

const indentOf = (line: string) => /^\s*/.exec(line)![0].length;
const isRule = (l: string) => /^\s*([-*_])(\s*\1){2,}\s*$/.test(l);
const isTableStart = (lines: string[], i: number) =>
  /^\s*\|/.test(lines[i]) && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1]);
const isBlockStart = (lines: string[], i: number) => {
  const l = lines[i];
  return FENCE.test(l) || /^#{1,6}\s/.test(l) || LIST.test(l) || /^\s*>/.test(l) || isTableStart(lines, i) || isRule(l);
};

function dedent(lines: string[]) {
  const n = Math.min(...lines.filter((l) => l.trim()).map(indentOf));
  return lines.map((l) => l.slice(Math.min(n, indentOf(l))));
}

/** Splits a table row on | outside code spans; "\|" is a literal pipe. */
function cells(line: string) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const out: string[] = [];
  let cur = '';
  let inCode = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\' && s[i + 1] === '|') {
      cur += '|';
      i++;
    } else if (c === '`') {
      inCode = !inCode;
      cur += c;
    } else if (c === '|' && !inCode) {
      out.push(cur.trim());
      cur = '';
    } else cur += c;
  }
  out.push(cur.trim());
  return out;
}

function renderList(block: string[], opts: Opts) {
  const base = indentOf(block[0]);
  const ordered = /^\s*\d+[.)]/.test(block[0]);
  const items: { first: string; rest: string[] }[] = [];
  for (const line of block) {
    const m = LIST.exec(line);
    if (m && indentOf(line) <= base + 1) items.push({ first: m[3], rest: [] });
    else items.at(-1)!.rest.push(line);
  }
  const lis = items.map(({ first, rest }) => {
    const text = [first];
    let j = 0;
    while (j < rest.length && rest[j].trim() && !LIST.test(rest[j]) && !FENCE.test(rest[j])) text.push(rest[j++].trim());
    const sub = rest.slice(j);
    let content = text.join(' ');
    let open = '<li>';
    const box = /^\[( |x|X)\]\s+(.*)$/.exec(content);
    if (box) {
      const done = box[1] !== ' ';
      open = `<li class="task"><input type="checkbox" disabled${done ? ' checked' : ''} aria-label="${done ? 'Done' : 'Not done'}"> `;
      content = box[2];
    }
    const nested = sub.some((l) => l.trim()) ? '\n' + blocks(dedent(sub), opts).join('\n') : '';
    return `${open}${renderInline(content, opts)}${nested}</li>`;
  });
  const tag = ordered ? 'ol' : 'ul';
  return `<${tag}>\n${lis.join('\n')}\n</${tag}>`;
}

function blocks(lines: string[], opts: Opts): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const fence = FENCE.exec(line);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) body.push(lines[i++]);
      i++;
      out.push(`<pre tabindex="0"><code>${escapeHtml(body.join('\n'))}</code></pre>`); // focusable: it may scroll
      continue;
    }
    const heading = /^(#{1,6})\s+(.*?)\s*$/.exec(line);
    if (heading) {
      const n = Math.min(6, heading[1].length + 1);
      out.push(`<h${n}>${renderInline(heading[2], opts)}</h${n}>`);
      i++;
      continue;
    }
    if (isRule(line)) {
      out.push('<hr>');
      i++;
      continue;
    }
    if (isTableStart(lines, i)) {
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(cells(lines[i++]));
      const tr = (cs: string[], tag: string) => `<tr>${cs.map((c) => `<${tag}>${renderInline(c, opts)}</${tag}>`).join('')}</tr>`;
      out.push(
        ['<div class="table-wrap" tabindex="0"><table>', `<thead>${tr(head, 'th')}</thead>`, '<tbody>', ...rows.map((r) => tr(r, 'td')), '</tbody></table></div>'].join('\n'),
      );
      continue;
    }
    if (/^\s*>/.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) quoted.push(lines[i++].replace(/^\s*>\s?/, ''));
      out.push(`<blockquote>${blocks(quoted, opts).join('\n')}</blockquote>`);
      continue;
    }
    if (LIST.test(line)) {
      const base = indentOf(line);
      const ordered = /^\s*\d+[.)]/.test(line);
      const block = [line];
      i++;
      while (i < lines.length) {
        const l = lines[i];
        if (!l.trim()) {
          let k = i;
          while (k < lines.length && !lines[k].trim()) k++;
          const next = lines[k];
          const sibling = next !== undefined && LIST.test(next) && indentOf(next) <= base + 1 && /^\s*\d+[.)]/.test(next) === ordered;
          if (next === undefined || !(indentOf(next) > base || sibling)) break;
          block.push(l);
          i++;
          continue;
        }
        const m = LIST.exec(l);
        if (indentOf(l) > base + 1 || (m && /^\s*\d+[.)]/.test(l) === ordered)) {
          block.push(l);
          i++;
        } else break;
      }
      out.push(renderList(block, opts));
      continue;
    }
    const para = [line.trim()];
    i++;
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines, i)) para.push(lines[i++].trim());
    out.push(`<p>${renderInline(para.join(' '), opts)}</p>`);
  }
  return out;
}

/** A Markdown document → safe HTML. */
export function renderMarkdown(text: string | null | undefined, opts: Opts = {}): string {
  const src = String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/<!--[\s\S]*?-->/g, '');
  return blocks(src.split('\n'), opts).join('\n');
}
