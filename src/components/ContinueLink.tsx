import { useEffect, useState } from 'react';

/*
 * The home screen's Continue (408 §9, Q6): the most recent saved project, opened in its studio. The project library is
 * loaded with import() to find it (none of it is in the entry chunk), the editors' code only on a click; with no saved
 * project nothing is shown.
 */

/** Continue: <the most recent project>. */
export function ContinueLink() {
  const [recent, setRecent] = useState<{ id: string; name: string } | null>(null);
  useEffect(() => {
    let live = true;
    // Only the library (a few KB) to find it; the editors' code loads when Continue is clicked.
    import('../lib/projectLibrary')
      .then(({ projects }) => projects.list())
      .then((entries) => {
        const entry = entries.find((candidate) => candidate.readable);
        if (live && entry) setRecent({ id: entry.id, name: entry.name });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  if (!recent) return null;
  return (
    <button
      type="button"
      className="btn big"
      title={`Open ${recent.name} where you left it`}
      onClick={() => {
        void import('../state/projects').then(({ openProject }) => openProject(recent.id));
      }}
    >
      Continue: {recent.name}
    </button>
  );
}
