import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { FoldGroup, FoldSection } from '@/components/panel';

/*
 * 503 AC-1, AC-4: a group's sections render one open, each title a native button that says whether it is open and
 * which body it controls, in order; the tests run in node, so the markup is checked as text.
 */

/**
 * A section of the test group.
 * @param id its id
 * @param extra more props (note, actions)
 * @returns the element
 */
const section = (id: string, extra: { note?: ReactNode; actions?: ReactNode } = {}) =>
  createElement(FoldSection, { key: id, id, title: `Title ${id}`, ...extra, children: createElement('p', null, `Body ${id}`) });

/** The group as rendered: three sections, the second the default, the first with a note, the third with an action. */
const html = renderToStaticMarkup(
  createElement(FoldGroup, {
    id: 'test:panel',
    defaultOpen: 'fm-b',
    children: [
      section('fm-a', { note: 'Music · 2 tracks' }),
      section('fm-b'),
      section('fm-c', { actions: createElement('button', { type: 'button', className: 'kf-nav' }, 'Next key') }),
    ],
  }),
);

/** Each section's markup, in order. */
const sections = html.split('<section').slice(1);

/**
 * A section's title button.
 * @param markup the section's markup
 * @returns the opening tag of the button that toggles it
 */
const titleButton = (markup: string) => /<h3[^>]*>\s*<button[^>]*>/.exec(markup)?.[0] ?? '';

describe('folding section markup (AC-4)', () => {
  it('renders the three sections in order', () => {
    expect(sections).toHaveLength(3);
    expect(sections.map((markup) => /Title (fm-\w)/.exec(markup)?.[1])).toEqual(['fm-a', 'fm-b', 'fm-c']);
  });

  it.each([0, 1, 2])('section %i titles itself with a native button naming its body', (index) => {
    const markup = sections[index] ?? '';
    const button = titleButton(markup);
    expect(button).toMatch(/type="button"/);
    expect(button).toMatch(/aria-expanded="(true|false)"/);
    const controls = /aria-controls="([^"]+)"/.exec(button)?.[1];
    expect(controls).toBeTruthy();
    expect(markup).toContain(`id="${controls ?? ''}"`);
  });

  it('opens only the default section (AC-1)', () => {
    expect(sections.map((markup) => /aria-expanded="(true|false)"/.exec(titleButton(markup))?.[1])).toEqual(['false', 'true', 'false']);
    expect(sections.map((markup) => /<div[^>]*class="sec-body"[^>]*hidden/.test(markup))).toEqual([true, false, true]);
  });

  it('shows the summary in a closed section’s title row', () => {
    const row = /<h3[^>]*>[\s\S]*?<\/h3>/.exec(sections[0] ?? '')?.[0] ?? '';
    expect(row).toContain('Music · 2 tracks');
  });

  it('draws actions beside the title button, not inside it', () => {
    const markup = sections[2] ?? '';
    const button = /<button[^>]*class="sec-h"[^>]*>[\s\S]*?<\/button>/.exec(markup)?.[0] ?? '';
    expect(button).not.toContain('Next key');
    expect(markup).toContain('Next key');
  });

  it('opens a section outside any group', () => {
    const alone = renderToStaticMarkup(section('fm-alone'));
    expect(titleButton(alone)).toMatch(/aria-expanded="true"/);
  });
});

describe('onOpened: only the user’s own open (505 D4)', () => {
  it('isn’t called when a section renders open by itself (the default, or the only one)', () => {
    const opened = vi.fn();
    const props = { title: 'Record voice', onOpened: opened, children: createElement('p', null, 'Controls') };
    const markup = renderToStaticMarkup(
      createElement(FoldGroup, { id: 'test:opened', defaultOpen: 'fm-rec', children: createElement(FoldSection, { id: 'fm-rec', ...props }) }),
    );
    expect(titleButton(markup)).toMatch(/aria-expanded="true"/);
    renderToStaticMarkup(createElement(FoldSection, { id: 'fm-rec-alone', ...props }));
    expect(opened).not.toHaveBeenCalled();
  });
});
