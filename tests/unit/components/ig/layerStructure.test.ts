import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * 506 AC-3: the Layers panel shows the list only; the selected layer's properties are in the inspector, in the photo,
 * Reel and YouTube modes alike (Reel and YouTube share VideoWorkspace). Read from the sources, so a later change
 * can't quietly put the properties back in the panel.
 */

/**
 * A component's source.
 * @param file its path under src/components
 * @returns its text
 */
const source = (file: string): string => fs.readFileSync(path.join('src', 'components', file), 'utf8');

/**
 * A function's body in a source: from its declaration to the next top-level declaration.
 * @param text the source
 * @param name the function's name
 * @returns its text
 */
function functionBody(text: string, name: string): string {
  const start = text.indexOf(`function ${name}(`);
  expect(start, `function ${name}`).toBeGreaterThan(-1);
  const end = text.slice(start + 1).search(/\n(?:export )?(?:function|const|interface|type) /);
  return end < 0 ? text.slice(start) : text.slice(start, start + 1 + end);
}

describe('506: the Layers panel holds the list only', () => {
  it('the list never shows properties', () => {
    expect(source('ig/LayerList.tsx')).not.toMatch(/LayerProperties|LayerProps\b/);
  });

  it('no all-in-one layer panel (adding, list and properties in one column) is left', () => {
    expect(source('ig/LayerPanel.tsx')).not.toMatch(/export function LayerPanel\(/);
  });

  it.each([
    ['studio/PhotoWorkspace.tsx', /return <LayersPanel /, /<LayerList \{\.\.\.layerProps\}/],
    ['studio/VideoWorkspace.tsx', /return <LayerList \{\.\.\.layerProps\} \/>;/, null],
  ])('%s: the Layers tool shows the list, the inspector the selected layer', (file, toolPanel, layersPanel) => {
    const text = source(file);
    const panel = functionBody(text, 'ToolPanel');
    expect(panel).toMatch(toolPanel);
    expect(panel).not.toMatch(/LayerProps\b|LayerProperties/);
    if (layersPanel) expect(functionBody(text, 'LayersPanel')).toMatch(layersPanel);
    expect(functionBody(text, 'useInspector')).toMatch(/kind: 'layer', content: <LayerProps \{\.\.\.layerProps\} \/>/);
  });
});
