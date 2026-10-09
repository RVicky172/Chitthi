import { describe, expect, it } from 'vitest';
import { escapeHtml, renderInline, renderMarkdown } from './markdown';

describe('renderInline', () => {
  it('formats code, bold, italic and links', () => {
    expect(renderInline('a `b <c>` **d** _e_ *f*')).toBe('a <code>b &lt;c&gt;</code> <strong>d</strong> <em>e</em> <em>f</em>');
    expect(renderInline('a_b_c `**x**`')).toBe('a_b_c <code>**x**</code>');
  });

  it('links: web in a new tab, feature documents inside the dashboard, others as text', () => {
    expect(renderInline('[site](https://example.com/a?b=1&c=2)')).toBe(
      '<a href="https://example.com/a?b=1&amp;c=2" target="_blank" rel="noopener noreferrer">site</a>',
    );
    expect(renderInline('[plan](features/202-edit-operations/plan.md)')).toBe('<a href="#/feature/202/plan">plan</a>');
    expect(renderInline('[tasks](./tasks.md)', { featureId: '102' })).toBe('<a href="#/feature/102/board">tasks</a>');
    expect(renderInline('[spec](spec.md)', { featureId: '102' })).toBe('<a href="#/feature/102/spec">spec</a>');
    expect(renderInline('[doc](../docs/AI.md)')).toBe('<span class="ref" title="../docs/AI.md">doc</span>');
    expect(renderInline('[x](javascript:alert(1))')).toBe('<span class="ref" title="javascript:alert(1">x</span>)');
  });
});

describe('renderMarkdown', () => {
  it('escapes everything from the file and drops HTML comments', () => {
    const html = renderMarkdown('<script>alert(1)</script>\n\n<!-- note -->text');
    expect(html).not.toMatch(/<script|note/);
    expect(html).toContain('&lt;script&gt;');
    expect(escapeHtml(`<&>"'`)).toBe('&lt;&amp;&gt;&quot;&#39;');
  });

  it('renders headings (one level down), lists with checkboxes, tables, code and quotes', () => {
    const md = [
      '# Title',
      '',
      '- [x] **T001** — one',
      '      continued',
      '  - **Result:** fine',
      '- [ ] **T002** — two',
      '',
      '| a | b |',
      '| --- | --- |',
      '| x \\| y | `p | q` |',
      '',
      '```',
      'if (a < b) {}',
      '```',
      '',
      '> quoted',
    ].join('\n');
    expect(renderMarkdown(md)).toBe(
      [
        '<h2>Title</h2>',
        '<ul>',
        '<li class="task"><input type="checkbox" disabled checked aria-label="Done"> <strong>T001</strong> — one continued',
        '<ul>',
        '<li><strong>Result:</strong> fine</li>',
        '</ul></li>',
        '<li class="task"><input type="checkbox" disabled aria-label="Not done"> <strong>T002</strong> — two</li>',
        '</ul>',
        '<div class="table-wrap" tabindex="0"><table>',
        '<thead><tr><th>a</th><th>b</th></tr></thead>',
        '<tbody>',
        '<tr><td>x | y</td><td><code>p | q</code></td></tr>',
        '</tbody></table></div>',
        '<pre tabindex="0"><code>if (a &lt; b) {}</code></pre>',
        '<blockquote><p>quoted</p></blockquote>',
      ].join('\n'),
    );
  });
});
