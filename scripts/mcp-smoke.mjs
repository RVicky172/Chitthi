#!/usr/bin/env node
/*
 * End-to-end check of Chitthi's MCP server with the official MCP client: starts `npm run mcp` over stdio, lists tools,
 * resources and prompts, builds a calendar and a postcard through the tools, checks and previews them, and exports a
 * PDF. No AI calls (those need the user's keys). Run: node scripts/mcp-smoke.mjs  (exits 1 on any failure)
 * CHITTHI_MCP_APP=<path to Chitthi.exe> tests a packaged or installed app instead of the source.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { existsSync } from 'node:fs';

const app = process.env.CHITTHI_MCP_APP;
const transport = new StdioClientTransport(
  app ? { command: app, args: ['--mcp'], stderr: 'inherit' } : { command: process.execPath, args: ['scripts/mcp-dev.mjs'], stderr: 'inherit' },
);
const client = new Client({ name: 'chitthi-smoke', version: '1.0.0' });
const fails = [];
const check = (ok, what) => {
  console.log(`${ok ? '✓' : '✗'} ${what}`);
  if (!ok) fails.push(what);
};
const call = async (name, args = {}) => {
  const r = await client.callTool({ name, arguments: args });
  if (r.isError) throw new Error(`${name}: ${r.content?.[0]?.text}`);
  return r;
};
const textOf = (r) => r.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');

try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  check(tools.length >= 30, `${tools.length} tools listed`);
  check(tools.every((t) => t.inputSchema?.type === 'object'), 'every tool has an object input schema');
  check(tools.find((t) => t.name === 'check_design')?.annotations?.readOnlyHint === true, 'read-only tools are annotated');
  const { resources } = await client.listResources();
  check(resources.some((r) => r.uri === 'chitthi://rules/photos'), `${resources.length} resources listed`);
  const rules = await client.readResource({ uri: 'chitthi://rules/photos' });
  check(/Pexels/.test(rules.contents[0].text), 'photo rules resource reads');
  const { prompts } = await client.listPrompts();
  check(prompts.some((p) => p.name === 'year_calendar'), `${prompts.length} prompts listed`);
  const pr = await client.getPrompt({ name: 'year_calendar', arguments: { year: '2027' } });
  check(/list_festivals/.test(pr.messages[0].content.text), 'year_calendar prompt builds');

  await call('new_design', { product: 'calendar' });
  await call('set_calendar', { year: 2027, marks: 'all', style: 'modern', captions: { 1: 'Makar Sankranti', 11: 'Diwali' } });
  const d = JSON.parse(textOf(await call('get_design')).split('\n').slice(1).join('\n'));
  check(d.calendar.year === 2027 && d.calendar.captions[0] === 'Makar Sankranti' && d.calendar.grid === 'tiles', 'calendar set through tools');
  const fest = textOf(await call('list_festivals', { year: 2027 }));
  check(/Diwali/.test(fest), 'festivals listed');
  await call('set_calendar_page', { page: 11 });
  const prev = await call('render_preview', { maxPx: 512 });
  const img = prev.content.find((c) => c.type === 'image');
  check(img && img.mimeType === 'image/png' && img.data.length > 1000, 'render_preview returns a PNG');
  const issues = textOf(await call('check_design'));
  check(/photo/.test(issues), 'check_design reports the empty photo slot');

  await call('new_design', { product: 'postcard' });
  await call('set_theme', { themeId: 'holi' });
  await call('set_words', { greeting: 'Happy Holi', quote: 'Colours, laughter and gujiya!', signature: 'Love, Asha' });
  await call('set_back', { to: 'Nani Ma', address: '12 Gandhi Road\nJaipur', pin: '302001' });
  const out = textOf(await call('export_pdf', { format: 'pdf' }));
  const file = /Files written:\n(.+)/.exec(out)?.[1]?.trim();
  check(!!file && existsSync(file), `export_pdf wrote ${file}`);
  const bad = await client.callTool({ name: 'set_layout', arguments: { layout: 'nope' } });
  check(bad.isError === true, 'bad input returns a tool error, not a crash');
} catch (e) {
  fails.push(String(e && e.stack ? e.stack : e));
  console.error(e);
} finally {
  await client.close().catch(() => undefined);
}
console.log(fails.length ? `\n${fails.length} failed` : '\nMCP smoke test passed');
process.exit(fails.length ? 1 : 0);
