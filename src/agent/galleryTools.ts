import { isRecord } from '../engine/guards';
import { db } from '../lib/db';
import { openDesign, saveDesign } from '../state/actions';
import { getState, setDesign } from '../state/store';
import { booleanSchema, objectSchema, ok, stringArg, stringSchema, ToolError, type AgentTool } from './common';
import { designSummary } from './designSummary';

/* The gallery: saved designs to list, open and save. */

/** The gallery tools. */
export const GALLERY_TOOLS: AgentTool[] = [
  {
    name: 'list_saved',
    title: 'List saved designs',
    description: 'Designs saved in the Chitthi gallery (id, name, size, last change).',
    inputSchema: objectSchema(),
    readOnly: true,
    run: async () =>
      ok(
        'Saved designs',
        (await db.all()).map((saved) => ({
          id: saved.id,
          name: saved.name,
          size: saved.size,
          updated: new Date(saved.updated).toISOString(),
          // Older saves can lack a readable design.
          product: isRecord(saved.design) ? saved.design.product : undefined,
        })),
      ),
  },
  {
    name: 'open_saved',
    title: 'Open a saved design',
    description: 'Opens a saved design by id (from list_saved). The current design is replaced (Undo brings it back); save it first if needed.',
    inputSchema: objectSchema({ id: stringSchema('Design id from list_saved') }, ['id']),
    run: async (args) => {
      await openDesign(stringArg(args.id));
      return ok('Opened.', designSummary());
    },
  },
  {
    name: 'save_design',
    title: 'Save to the gallery',
    description:
      'Saves the current design to the gallery, optionally under a new name or as a copy. Saving over an existing design needs confirm: true.',
    inputSchema: objectSchema({
      name: stringSchema('Name for the design'),
      copy: booleanSchema('Save as a new copy'),
      confirm: booleanSchema('Required to overwrite the design already saved'),
    }),
    destructive: true,
    run: async (args) => {
      if (typeof args.name === 'string' && args.name.trim()) setDesign({ designName: args.name.trim() });
      const existing = getState().designId;
      if (existing && !args.copy && args.confirm !== true)
        throw new ToolError('This would overwrite the saved design. Pass confirm: true, or copy: true to save a new one.');
      await saveDesign(args.copy === true || !existing);
      return ok(`Saved “${getState().design.designName || 'design'}”.`);
    },
  },
];
