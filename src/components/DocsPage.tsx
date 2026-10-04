import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { DOC_PAGES, docPage, type DocBlock, type DocPage } from '../data/docs';
import { SiteNav } from './SiteNav';

/*
 * The website's documentation (#/docs, #/docs/<page>, #/docs/<page>/<section>): what each studio does, and how
 * developers use, host and extend Chitthi. The content is data (src/data/docs.ts); this renders it, with the pages in a
 * side list (a select on phones) and the page's sections in an "On this page" list. Lazy-loaded like the other pages.
 */

const parse = (hash: string): { page?: string; section?: string } => {
  const [, page, section] = /^#\/docs(?:\/([\w-]+))?(?:\/([\w-]+))?/.exec(hash) ?? [];
  return { page, section };
};

/** **bold**, `code` and [text](href) inside a block's text, as React nodes (never as HTML). */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0,
    m: RegExpExecArray | null,
    k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) out.push(<strong key={k++}>{m[1]}</strong>);
    else if (m[2]) out.push(<code key={k++}>{m[2]}</code>);
    else {
      const href = m[4],
        external = /^https?:/.test(href);
      out.push(
        <a key={k++} href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
          {m[3]}
        </a>,
      );
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function Block({ b }: { b: DocBlock }) {
  if ('p' in b) return <p>{inline(b.p)}</p>;
  if ('note' in b) return <p className="docs-note">{inline(b.note)}</p>;
  if ('list' in b)
    return (
      <ul>
        {b.list.map((t, i) => (
          <li key={i}>{inline(t)}</li>
        ))}
      </ul>
    );
  if ('steps' in b)
    return (
      <ol className="docs-steps">
        {b.steps.map((t, i) => (
          <li key={i}>{inline(t)}</li>
        ))}
      </ol>
    );
  if ('code' in b)
    return (
      <pre className="docs-code" tabIndex={0}>
        <code>{b.code}</code>
      </pre>
    );
  return (
    <div className="docs-table" tabIndex={0} role="region" aria-label="Table">
      <table>
        <thead>
          <tr>
            {b.table.head.map((h, i) => (
              <th key={i} scope="col">
                {inline(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {b.table.rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (j === 0 ? <th key={j} scope="row">{inline(c)}</th> : <td key={j}>{inline(c)}</td>))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const GROUPS = [...new Set(DOC_PAGES.map((p) => p.group))];

export function DocsPage() {
  const [route, setRoute] = useState(() => parse(location.hash));
  useEffect(() => {
    const on = () => setRoute(parse(location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const page: DocPage = docPage(route.page);
  // A new page starts at its top; a section link scrolls to that section.
  useEffect(() => {
    if (route.section) document.getElementById(`doc-${route.section}`)?.scrollIntoView({ block: 'start' });
    else window.scrollTo(0, 0);
  }, [page.id, route.section]);
  const i = DOC_PAGES.indexOf(page),
    prev = DOC_PAGES[i - 1],
    next = DOC_PAGES[i + 1];
  const href = (p: DocPage, section?: string) => `#/docs/${p.id}${section ? `/${section}` : ''}`;

  return (
    <div className="landing docs">
      <SiteNav current="docs" />
      <div className="docs-body">
        <nav className="docs-side" aria-label="Documentation">
          <label className="docs-pick">
            <span>Page</span>
            <select aria-label="Documentation page" value={page.id} onChange={(e) => (location.hash = href(docPage(e.target.value)))}>
              {GROUPS.map((g) => (
                <optgroup key={g} label={g}>
                  {DOC_PAGES.filter((p) => p.group === g).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          {GROUPS.map((g) => (
            <Fragment key={g}>
              <h2>{g}</h2>
              <ul>
                {DOC_PAGES.filter((p) => p.group === g).map((p) => (
                  <li key={p.id}>
                    <a href={href(p)} aria-current={p === page ? 'page' : undefined}>
                      {p.title}
                    </a>
                  </li>
                ))}
              </ul>
            </Fragment>
          ))}
        </nav>
        <main className="docs-main">
          <header className="docs-head">
            <p className="docs-group">{page.group}</p>
            <h1>{page.title}</h1>
            <p className="lsec-sub">{page.summary}</p>
            {page.sections.length > 1 && (
              <nav className="docs-toc" aria-label="On this page">
                {page.sections.map((s) => (
                  <a key={s.id} href={href(page, s.id)}>
                    {s.title}
                  </a>
                ))}
              </nav>
            )}
          </header>
          {page.sections.map((s) => (
            <section key={s.id} id={`doc-${s.id}`} className="docs-sec" aria-labelledby={`doch-${s.id}`}>
              <h2 id={`doch-${s.id}`}>{s.title}</h2>
              {s.blocks.map((b, k) => (
                <Block key={k} b={b} />
              ))}
            </section>
          ))}
          <nav className="docs-pager" aria-label="More documentation">
            {prev ? (
              <a href={href(prev)}>
                <small>Previous</small>
                {prev.title}
              </a>
            ) : (
              <span />
            )}
            {next && (
              <a href={href(next)} className="next">
                <small>Next</small>
                {next.title}
              </a>
            )}
          </nav>
        </main>
      </div>
    </div>
  );
}
