import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PROJECT_TOOLS } from '@/agent/projectTools';
import { ToolError, type AgentTool, type ToolResult } from '@/agent/common';
import { startAutosave, type Autosave } from '@/state/projectSave';
import { configureProjects, openIO } from '@/state/projects';
import { getVideo } from '@/state/videoStore';
import { memoryMedia } from '../../support/memoryMedia';
import { memoryProjects } from '../../support/memoryProjects';

/*
 * 408 T072 (AC-13, Constitution XI): the project tools agents use, through the same code as the Projects panel
 * (state/projects.ts), here over in-memory stores. Arguments are checked before anything happens; deleting needs
 * confirm: true. The self-test and test:mcp run them in the app (290).
 */

let autosave: Autosave;
let routes: string[];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 19, 14, 2));
  const library = memoryProjects();
  const media = memoryMedia('copies', 1e9).store;
  autosave = startAutosave({ library, media, onHide: () => () => undefined });
  routes = [];
  configureProjects({ library, media, autosave, desktop: false, storage: null, navigate: (hash) => routes.push(hash) });
  vi.spyOn(openIO, 'look').mockResolvedValue({ thumb: '', strip: [], still: null });
  vi.spyOn(openIO, 'preview').mockResolvedValue({} as HTMLCanvasElement);
});
afterEach(() => {
  configureProjects(null);
  autosave.stop();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/**
 * A project tool by name.
 * @param name its name
 * @returns the tool
 */
function tool(name: string): AgentTool {
  const found = PROJECT_TOOLS.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`no tool ${name}`);
  return found;
}

/**
 * Runs a project tool.
 * @param name its name
 * @param args its arguments
 * @returns its result
 */
const run = async (name: string, args: Record<string, unknown> = {}): Promise<ToolResult> => tool(name).run(args, {});

/**
 * The projects list_projects gives.
 * @param args its arguments
 * @returns the entries
 */
const listed = async (args: Record<string, unknown> = {}) => (await run('list_projects', args)).json as { id: string; name: string; studio: string; kind: string }[];

describe('project tools (408 T072, AC-13)', () => {
  it('are registered with the other tools; listing reads only, deleting is destructive', async () => {
    // The registry loads every tool module; one reads the page's location as it loads.
    vi.stubGlobal('location', { hash: '', href: 'http://localhost/', origin: 'http://localhost' });
    const { TOOLS_BY_NAME } = await import('@/agent/tools');
    vi.unstubAllGlobals();
    for (const name of ['list_projects', 'new_project', 'open_project', 'rename_project', 'delete_project']) expect(TOOLS_BY_NAME[name]).toBe(tool(name));
    expect(tool('list_projects').readOnly).toBe(true);
    expect(tool('delete_project').destructive).toBe(true);
  });

  it('new_project makes and opens a project of a studio and kind; list_projects lists it', async () => {
    const made = await run('new_project', { studio: 'video', kind: 'vlog' });
    expect(made.json).toMatchObject({ studio: 'video', kind: 'vlog', name: 'YouTube · 19 Oct 14:02' });
    expect(getVideo().kind).toBe('vlog');
    expect(routes.at(-1)).toBe('#/instagram/youtube');
    await run('new_project', { studio: 'photo' });
    expect((await listed()).map((entry) => entry.studio).sort((first, second) => first.localeCompare(second))).toEqual(['photo', 'video']);
    expect((await listed({ studio: 'photo' })).map((entry) => entry.kind)).toEqual(['photo']);
  });

  it('refuses arguments that aren’t right, before anything happens', async () => {
    await expect(run('new_project', { studio: 'audio' })).rejects.toThrow(ToolError);
    await expect(run('new_project', { studio: 'video', kind: 'tiktok' })).rejects.toThrow(/reel|vlog/);
    await expect(run('list_projects', { studio: 7 })).rejects.toThrow(ToolError);
    await expect(run('open_project', {})).rejects.toThrow(/list_projects/);
    await expect(run('open_project', { project: 'nope' })).rejects.toThrow(/Unknown project/);
    await expect(run('rename_project', { project: 'nope', name: 'x' })).rejects.toThrow(/Unknown project/);
    expect(await listed()).toEqual([]);
  });

  it('open_project and rename_project work by id', async () => {
    const first = (await run('new_project', { studio: 'video' })).json as { id: string };
    await run('new_project', { studio: 'video' });
    expect((await run('open_project', { project: first.id })).text).toMatch(/Opened/);
    await expect(run('rename_project', { project: first.id, name: '   ' })).rejects.toThrow(/1 to 80/);
    await run('rename_project', { project: first.id, name: 'Trip' });
    expect((await listed()).find((entry) => entry.id === first.id)?.name).toBe('Trip');
  });

  it('delete_project needs confirm: true, and says the space freed', async () => {
    const made = (await run('new_project', { studio: 'photo' })).json as { id: string };
    await expect(run('delete_project', { project: made.id })).rejects.toThrow(/confirm: true/);
    await expect(run('delete_project', { project: made.id, confirm: 'yes' })).rejects.toThrow(/confirm: true/);
    expect((await listed()).map((entry) => entry.id)).toContain(made.id);
    expect((await run('delete_project', { project: made.id, confirm: true })).text).toMatch(/Deleted .* freed/);
    expect((await listed()).map((entry) => entry.id)).not.toContain(made.id);
  });
});
