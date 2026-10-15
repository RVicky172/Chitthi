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
    match: RegExpExecArray | null,
    key = 0;
  while ((match = re.exec(text))) {
    if (match.index > last) out.push(text.slice(last, match.index));
    if (match[1]) out.push(<strong key={key++}>{match[1]}</strong>);
    else if (match[2]) out.push(<code key={key++}>{match[2]}</code>);
    else {
      const href = match[4],
        external = /^https?:/.test(href);
      out.push(
        <a key={key++} href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
          {match[3]}
        </a>,
      );
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function Block({ b }: Readonly<{ b: DocBlock }>) {
  if ('p' in b) return <p>{inline(b.p)}</p>;
  if ('note' in b) return <p className="docs-note">{inline(b.note)}</p>;
  if ('list' in b)
    return (
      <ul>
        {b.list.map((item, index) => (
          <li key={index}>{inline(item)}</li>
        ))}
      </ul>
    );
  if ('steps' in b)
    return (
      <ol className="docs-steps">
        {b.steps.map((step, index) => (
          <li key={index}>{inline(step)}</li>
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
            {b.table.head.map((heading, index) => (
              <th key={index} scope="col">
                {inline(heading)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {b.table.rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, column) =>
                column === 0 ? (
                  <th key={column} scope="row">
                    {inline(cell)}
                  </th>
                ) : (
                  <td key={column}>{inline(cell)}</td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const GROUPS = [...new Set(DOC_PAGES.map((page) => page.group))];

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
  const index = DOC_PAGES.indexOf(page),
    prev = DOC_PAGES[index - 1],
    next = DOC_PAGES[index + 1];
  const href = (target: DocPage, section?: string) => `#/docs/${target.id}${section ? `/${section}` : ''}`;

  return (
    <div className="landing docs">
      <SiteNav current="docs" />
      <div className="docs-body">
        <nav className="docs-side" aria-label="Documentation">
          <label className="docs-pick">
            <span>Page</span>
            <select
              aria-label="Documentation page"
              value={page.id}
              onChange={(event) => (location.hash = href(docPage(event.target.value)))}
            >
              {GROUPS.map((group) => (
                <optgroup key={group} label={group}>
                  {DOC_PAGES.filter((candidate) => candidate.group === group).map((groupPage) => (
                    <option key={groupPage.id} value={groupPage.id}>
                      {groupPage.title}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          {GROUPS.map((group) => (
            <Fragment key={group}>
              <h2>{group}</h2>
              <ul>
                {DOC_PAGES.filter((candidate) => candidate.group === group).map((groupPage) => (
                  <li key={groupPage.id}>
                    <a href={href(groupPage)} aria-current={groupPage === page ? 'page' : undefined}>
                      {groupPage.title}
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
                {page.sections.map((section) => (
                  <a key={section.id} href={href(page, section.id)}>
                    {section.title}
                  </a>
                ))}
              </nav>
            )}
          </header>
          {page.sections.map((section) => (
            <section
              key={section.id}
              id={`doc-${section.id}`}
              className="docs-sec"
              aria-labelledby={`doch-${section.id}`}
            >
              <h2 id={`doch-${section.id}`}>{section.title}</h2>
              {section.blocks.map((block, index) => (
                <Block key={index} b={block} />
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
