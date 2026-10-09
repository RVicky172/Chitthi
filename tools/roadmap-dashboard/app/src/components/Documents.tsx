// The Spec, Plan and Documents tabs of a feature.
import { useState } from 'react';
import { href, replaceParams } from '../route';
import type { FeatureData } from '../types';
import { Md } from './bits';

/** The spec as data: criteria with the tasks that prove them, questions, and the other sections. */
export function SpecTab({ data }: { data: FeatureData }) {
  const f = data.feature!;
  const s = f.spec;
  const crit = s.criteria.order.map((id) => [id, s.criteria.byId[id]] as const).filter(([, c]) => c);
  const questions = s.questions.order.map((id) => [id, s.questions.byId[id]] as const).filter(([, q]) => q);
  const open = questions.filter(([, q]) => q.open);
  let lastGroup: string | null | undefined;
  return (
    <div className="spec">
      <section className="doc-block">
        <h2>Summary</h2>
        <Md text={s.summary} featureId={f.id} />
      </section>

      {s.stories.order.length > 0 && (
        <section className="doc-block">
          <h2>User stories</h2>
          <ul className="plain">
            {s.stories.order.map((id) => (
              <li key={id}>
                <span className="num muted">{id}</span> <Md text={s.stories.byId[id]?.text} featureId={f.id} inline />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="doc-block">
        <h2>
          Acceptance criteria <span className="num muted">{crit.filter(([, c]) => c.done).length}/{crit.length}</span>
        </h2>
        <ul className="checks">
          {crit.map(([id, c]) => {
            const heading = c.group && c.group !== lastGroup ? c.group : null;
            lastGroup = c.group;
            const tasks = data.coverage[id] ?? [];
            return (
              <li key={id} className={heading ? 'has-group' : undefined}>
                {heading && <h3 className="group">{heading}</h3>}
                <div className="check">
                  <span className={`state ${c.done ? 'done' : 'open'}`}>{c.done ? '✓ Proven' : 'Open'}</span>
                  <div>
                    <p>
                      <strong className="num">{id}</strong> <Md text={c.text} featureId={f.id} inline />
                    </p>
                    <p className="sub">
                      {c.proof && <span>Proof: {c.proof}</span>}
                      {tasks.length ? (
                        <span>
                          Proved by{' '}
                          {tasks.map((t, i) => (
                            <span key={t}>
                              {i > 0 && ', '}
                              <span className="num">{t}</span>
                            </span>
                          ))}{' '}
                          · <a href={href(`/feature/${f.id}/board`, { criterion: id })}>on the board</a>
                        </span>
                      ) : (
                        <span className="warn-text">No task proves it yet</span>
                      )}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {questions.length > 0 && (
        <section className="doc-block">
          <h2>
            Questions <span className="num muted">{open.length} open</span>
          </h2>
          <ul className="checks">
            {[...open, ...questions.filter(([, q]) => !q.open)].map(([id, q]) => (
              <li key={id}>
                <div className="check">
                  <span className={`state ${q.open ? 'ask' : 'done'}`}>{q.open ? 'Open' : 'Resolved'}</span>
                  <p>
                    <strong className="num">{id}</strong> <Md text={q.text} featureId={f.id} inline />
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {s.sections
        .filter((x) => x.kind === 'markdown')
        .map((x) => (
          <section key={x.title} className="doc-block">
            <h2>{x.title}</h2>
            <Md text={x.markdown} featureId={f.id} />
          </section>
        ))}

      {s.changelog.length > 0 && (
        <section className="doc-block">
          <h2>Changelog</h2>
          <ol className="timeline">
            {s.changelog.map((c, i) => (
              <li key={i}>
                <span className="num muted">{c.date}</span> <Md text={c.text} featureId={f.id} inline />
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

const withoutTitle = (md: string | null) => (md ?? '').replace(/^<!--[\s\S]*?-->\s*/, '').replace(/^# .*\n+/, '');

export function PlanTab({ data }: { data: FeatureData }) {
  if (!data.docs.plan) return <p className="empty card-like">No plan yet: it is written with /spec-plan.</p>;
  return (
    <div className="doc-block">
      <Md text={withoutTitle(data.docs.plan)} featureId={data.id} />
    </div>
  );
}

const DOCS = [
  ['spec', 'spec.md'],
  ['plan', 'plan.md'],
  ['tasks', 'tasks.md'],
] as const;

/** The generated Markdown, as it is in the repository. */
export function DocsTab({ data, params }: { data: FeatureData; params: URLSearchParams }) {
  const [doc, setDoc] = useState<(typeof DOCS)[number][0]>(() => {
    const d = params.get('doc');
    return d === 'plan' || d === 'tasks' ? d : 'spec';
  });
  const text = data.docs[doc];
  return (
    <div>
      <div className="segmented" role="group" aria-label="Document">
        {DOCS.map(([key, name]) => (
          <button
            key={key}
            type="button"
            aria-pressed={doc === key}
            onClick={() => {
              setDoc(key);
              replaceParams({ doc: key });
            }}
          >
            {name}
          </button>
        ))}
      </div>
      <p className="muted small">
        Generated from <code>specs/features/{data.folder}/feature.json</code>; never edited by hand.
      </p>
      {text ? (
        <div className="doc-block">
          <Md text={withoutTitle(text)} featureId={data.id} />
        </div>
      ) : (
        <p className="empty card-like">No {doc} yet.</p>
      )}
    </div>
  );
}
