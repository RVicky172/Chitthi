import type { VKind } from '../engine/videoFormats';
import { sizeText } from '../lib/mediaStore';
import type { ProjectEntry, Studio } from '../lib/projects';
import { deleteProject, listProjects, newProject, openProject, renameProject } from '../state/projects';
import { booleanSchema, objectSchema, ok, stringArg, stringSchema, ToolError, type AgentTool } from './common';

/*
 * Saved photo and video projects (408 §10, AC-13): list, new, open, rename and delete, through the same code as the
 * studio's Projects panel (state/projects.ts). Deleting can't be undone, so it needs confirm: true.
 */

const STUDIOS: readonly Studio[] = ['photo', 'video'];
const KINDS: readonly VKind[] = ['reel', 'vlog'];

/**
 * A studio an agent names.
 * @param value the argument
 * @returns the studio
 * @throws ToolError for anything else
 */
function studioArg(value: unknown): Studio {
  const studio = STUDIOS.find((candidate) => candidate === value);
  if (!studio) throw new ToolError('studio is "photo" (Instagram photo posts) or "video" (Reels and YouTube videos).');
  return studio;
}

/**
 * A video kind an agent names.
 * @param value the argument (missing: a Reel)
 * @returns the kind
 * @throws ToolError for anything else
 */
function kindArg(value: unknown): VKind {
  if (value === undefined) return 'reel';
  const kind = KINDS.find((candidate) => candidate === value);
  if (!kind) throw new ToolError('kind is "reel" (Reels and Shorts) or "vlog" (a YouTube video).');
  return kind;
}

/**
 * A project for the agent.
 * @param entry the project
 * @returns its fields, the time as ISO text
 */
const shown = (entry: ProjectEntry) => ({
  id: entry.id,
  studio: entry.studio,
  name: entry.name,
  kind: entry.kind,
  ...(entry.studio === 'video' ? { seconds: entry.length } : { photos: entry.photos }),
  changed: new Date(entry.changed).toISOString(),
  bytes: entry.bytes,
  canOpen: entry.readable,
});

/**
 * The saved project an agent names.
 * @param value the argument
 * @returns its entry
 * @throws ToolError when there is no such project
 */
async function projectArg(value: unknown): Promise<ProjectEntry> {
  if (typeof value !== 'string' || !value) throw new ToolError('Give the project’s id (from list_projects).');
  const entry = (await listProjects()).find((candidate) => candidate.id === value);
  if (!entry) throw new ToolError(`Unknown project “${value}”. Use list_projects.`);
  return entry;
}

const PROJECT_ARG = stringSchema('Project id from list_projects');

/** The project tools. */
export const PROJECT_TOOLS: AgentTool[] = [
  {
    name: 'list_projects',
    title: 'List saved projects',
    description:
      'The saved photo and video projects on this device, newest first: id, studio, name, kind (photo, reel or vlog), length or photo count, when it last changed, the space it takes, and whether it can be opened.',
    inputSchema: objectSchema({ studio: stringSchema('Only this studio: "photo" or "video" (default: both)', { enum: STUDIOS }) }),
    readOnly: true,
    run: async (args) => {
      const studio = args.studio === undefined ? undefined : studioArg(args.studio);
      const entries = (await listProjects(studio)).filter((entry) => !studio || entry.studio === studio);
      return ok(`${entries.length} saved project(s).`, entries.map(shown));
    },
  },
  {
    name: 'new_project',
    title: 'Start a new project',
    description:
      'Starts a new, empty project in a studio and opens it (the project open there is saved first). A video project is a Reel (also for Shorts) or a YouTube video. It is named after its kind and the time, and saved as it is edited.',
    inputSchema: objectSchema(
      { studio: stringSchema('"photo" or "video"', { enum: STUDIOS }), kind: stringSchema('For video: "reel" (default) or "vlog" (YouTube)', { enum: KINDS }) },
      ['studio'],
    ),
    run: async (args) => {
      const studio = studioArg(args.studio);
      const kind = kindArg(args.kind);
      const id = await newProject(studio, kind);
      const entry = await projectArg(id);
      return ok(`Started “${entry.name}”.`, shown(entry));
    },
  },
  {
    name: 'open_project',
    title: 'Open a saved project',
    description: 'Opens a saved project in its studio (the project open there is saved first). Undo history starts empty.',
    inputSchema: objectSchema({ project: PROJECT_ARG }, ['project']),
    run: async (args) => {
      const entry = await projectArg(args.project);
      const result = await openProject(entry.id);
      if ('error' in result) throw new ToolError(result.error);
      const notes = result.dropped.length ? ` Notes: ${result.dropped.join(' ')}` : '';
      return ok(`Opened “${entry.name}”.${notes}`, shown(entry));
    },
  },
  {
    name: 'rename_project',
    title: 'Rename a project',
    description: 'Renames a saved project (1 to 80 characters).',
    inputSchema: objectSchema({ project: PROJECT_ARG, name: stringSchema('The new name, 1 to 80 characters') }, ['project', 'name']),
    run: async (args) => {
      const entry = await projectArg(args.project);
      const why = await renameProject(entry.id, stringArg(args.name));
      if (why) throw new ToolError(why);
      return ok(`Renamed to “${stringArg(args.name).trim()}”.`);
    },
  },
  {
    name: 'delete_project',
    title: 'Delete a project',
    description:
      'Deletes a saved project and the stored media no other project uses. This can’t be undone, so it needs confirm: true. The user’s own files on disk are never deleted. Deleting the open project starts a new one.',
    inputSchema: objectSchema({ project: PROJECT_ARG, confirm: booleanSchema('Required: the project is deleted for good') }, ['project']),
    destructive: true,
    run: async (args) => {
      const entry = await projectArg(args.project);
      if (args.confirm !== true) throw new ToolError(`This deletes “${entry.name}” for good. Pass confirm: true to go ahead.`);
      const freed = await deleteProject(entry.id);
      return ok(`Deleted “${entry.name}”; ${sizeText(freed)} freed.`, { freed });
    },
  },
];
