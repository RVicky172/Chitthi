import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { TEXT_STYLES } from '@/data/layers';
import { LayerList } from '@/components/ig/LayerList';
import { layerName, newText, type Layer } from '@/engine/layers';
import { readDeclarations } from '../../../support/cssDeclarations';
import { defined } from '../../../support/defined';

/*
 * 506 AC-1, AC-4: each layer is a ListRow (thumbnail · name · controls) whose full name is its accessible name and
 * tooltip; the row's CSS lets the name shorten first and keeps the controls on the row. Node has no layout, so the
 * markup and the stylesheets are checked as text (the fit itself is 590's e2e check).
 */

/** 40 text layers with 80-character first lines, back first; the third is hidden. */
const layers: Layer[] = Array.from({ length: 40 }, (_, index) => ({
  ...newText(defined(TEXT_STYLES[0])),
  id: `t${String(index)}`,
  text: `${String(index).padStart(2, '0')}${'A'.repeat(78)}\nsecond line`,
  hidden: index === 2,
  start: index,
  end: index + 2.5,
}));

/**
 * The list as rendered.
 * @param timing the video's timing, or none for a photo
 * @param list the layers
 * @returns its markup
 */
const render = (timing?: { duration: number; now: number }, list: Layer[] = layers): string =>
  renderToStaticMarkup(
    createElement(LayerList, {
      layers: list,
      selected: 't5',
      onSelect: vi.fn(),
      onUpdate: vi.fn(),
      onRestack: vi.fn(),
      onRemove: vi.fn(),
      onMove: vi.fn(),
      timing,
    }),
  );

const photo = render();
/** Each row's markup, front first. */
const rows = photo.split('<li').slice(1);

/**
 * The opening tag of a row's main button.
 * @param row the row's markup
 * @returns the tag
 */
const mainButton = (row: string): string => /<button[^>]*class="list-row-main"[^>]*>/.exec(row)?.[0] ?? '';

/**
 * Unescapes the markup's attribute text.
 * @param text an attribute's value as rendered
 * @returns the text
 */
const unescape = (text: string): string => text.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');

describe('506: the layer rows', () => {
  it('draws one list row per layer, front first', () => {
    expect(rows).toHaveLength(40);
    expect(rows.every((row) => /^[^>]*class="list-row/.test(row))).toBe(true);
    expect(mainButton(defined(rows[0]))).toContain('data-id="t39"');
    expect(mainButton(defined(rows[39]))).toContain('data-id="t0"');
  });

  it('lays a row out as thumbnail, name, then the four controls in order', () => {
    for (const row of rows) {
      const lead = row.indexOf('list-row-lead'),
        name = row.indexOf('list-row-name'),
        controls = row.indexOf('list-row-controls');
      expect(lead).toBeGreaterThan(-1);
      expect(name).toBeGreaterThan(lead);
      expect(controls).toBeGreaterThan(name);
      const labels = [...row.slice(controls).matchAll(/aria-label="([^"]*)"/g)].map((match) => unescape(match[1]));
      expect(labels).toHaveLength(4);
      expect(labels[0]).toMatch(/^(Show|Hide) Text: /);
      expect(labels[1]).toMatch(/^Bring Text: .* forward$/);
      expect(labels[2]).toMatch(/^Send Text: .* back$/);
      expect(labels[3]).toMatch(/^Delete Text: /);
    }
  });

  it('gives each row its full name as the accessible name and tooltip', () => {
    rows.forEach((row, fromFront) => {
      const name = layerName(defined(layers[39 - fromFront]));
      expect(name.length).toBeGreaterThan(80);
      const tag = mainButton(row);
      expect(unescape(/aria-label="([^"]*)"/.exec(tag)?.[1] ?? '')).toBe(name);
      expect(unescape(/title="([^"]*)"/.exec(tag)?.[1] ?? '')).toBe(name);
    });
  });

  it('marks the selected row, and says Hidden on a hidden one', () => {
    expect(rows.filter((row) => mainButton(row).includes('aria-pressed="true"'))).toHaveLength(1);
    expect(mainButton(defined(rows[34]))).toContain('data-id="t5"');
    expect(mainButton(defined(rows[34]))).toContain('aria-pressed="true"');
    expect(defined(rows[37])).toMatch(/list-row-detail[^>]*>Hidden</);
    expect(defined(rows[37])).toContain('aria-label="Show ');
  });

  it('shows a video layer\'s times on its detail line, not in its name', () => {
    const video = render({ duration: 30, now: 0 }).split('<li').slice(1);
    expect(defined(video[39])).toMatch(/list-row-detail[^>]*>0:00\.0–0:02\.5</);
    expect(defined(video[37])).toMatch(/list-row-detail[^>]*>0:02\.0–0:04\.5 · Hidden</);
    expect(rows.some((row) => row.includes('–'))).toBe(false);
  });

  it('shows its hint when there are no layers', () => {
    expect(render(undefined, [])).toContain('Nothing added yet.');
  });
});

describe('506: the row CSS lets the name shorten first', () => {
  const panel = readDeclarations('42-panel.css');
  /**
   * A declaration of a rule in 42-panel.css.
   * @param rule the rule's selector
   * @param property the property
   * @returns its value, or undefined
   */
  const value = (rule: string, property: string): string | undefined =>
    panel.find((declaration) => declaration.rule.split(',').map((part) => part.trim()).includes(rule) && declaration.property === property)?.value;

  it('the main button grows and may shrink to nothing', () => {
    expect(value('.list-row-main', 'flex')).toBe('1');
    expect(value('.list-row-main', 'min-width')).toBe('0');
  });
  it('the name keeps to one line and ends with an ellipsis', () => {
    expect(value('.list-row-name', 'white-space')).toBe('nowrap');
    expect(value('.list-row-name', 'text-overflow')).toBe('ellipsis');
    expect(value('.list-row-name', 'overflow')).toBe('hidden');
  });
  it('the controls keep their size and never wrap', () => {
    expect(value('.list-row-controls', 'flex')).toBe('none');
    expect(value('.list-row-controls', 'flex-wrap')).toBeUndefined();
  });
  it('a finger drags a row by its thumbnail only, so swiping the names still scrolls (D3)', () => {
    const instagram = readDeclarations('35-instagram.css');
    /**
     * A declaration of a rule in 35-instagram.css.
     * @param rule the rule's selector
     * @param property the property
     * @returns its value, or undefined
     */
    const own = (rule: string, property: string): string | undefined =>
      instagram.find((declaration) => declaration.rule.split(',').map((part) => part.trim()).includes(rule) && declaration.property === property)?.value;
    expect(own('.lp-thumb', 'touch-action')).toBe('none');
    expect(own('.lp-list .list-row-main', 'touch-action')).toBeUndefined();
    expect(own('.lp-list .lp-drop-before', 'box-shadow')).toBeDefined();
    expect(own('.lp-list .lp-drop-after', 'box-shadow')).toBeDefined();
  });
  it('the layer list keeps no row rules of its own', () => {
    const rules = readDeclarations('35-instagram.css').flatMap((declaration) => declaration.rule.split(',').map((part) => part.trim()));
    expect(rules).not.toContain('.lp-list li');
    expect(rules).not.toContain('.lp-name');
    expect(rules).not.toContain('.lp-list .pbtn');
  });
});
