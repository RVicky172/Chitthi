import { DEFAULT_ADJUST } from '../engine/adjust';
import { isOneOf } from '../engine/guards';
import { aiTargets, MASK_COMBINES, MASK_LIMITS, maskActive, newMask, newPart, type Mask } from '../engine/masks';
import { setMasks } from '../state/instagram';
import { booleanSchema, objectSchema, ok, recordArg, stringArg, stringSchema, ToolError, type AgentTool } from './common';
import { adjustSchema, cleanAdjust, findAi, ignoredNote, needLut, PART_KINDS, PART_SETTINGS, PHOTO_ARG, putMask, shapePart } from './photoEdits';
import { currentItem, maskInfo, maskOf, targetOf } from './photoStudioInfo';

/* Masks: local adjustments made of parts (brush, gradients, colour and brightness ranges, AI subject or sky). */

/**
 * A mask's parts after an agent adds or changes one.
 * @param mask the mask
 * @param args the set_mask_part arguments
 * @returns the parts, the changed or new one unchecked
 * @throws ToolError for an unknown part or kind, or a mask that is full
 */
function partsWith(mask: Mask, args: Record<string, unknown>): unknown[] {
  const settings = recordArg(args.settings);
  if (typeof args.part === 'string') {
    const part = mask.parts.find((candidate) => candidate.id === args.part);
    if (!part) throw new ToolError(`Mask ${mask.id} has no part “${args.part}”.`);
    return mask.parts.map((candidate) => (candidate === part ? shapePart(part, settings, args.combine, args.invert) : candidate));
  }
  if (!isOneOf(PART_KINDS, args.kind)) throw new ToolError('Give the kind of the new part, or the id of a part to change.');
  if (mask.parts.length >= MASK_LIMITS.parts) throw new ToolError(`The mask already has ${MASK_LIMITS.parts} parts, the most it can have.`);
  return [...mask.parts, shapePart(newPart(args.kind, !mask.parts.length), settings, args.combine, args.invert)];
}

/** The mask tools. */
export const MASK_TOOLS: AgentTool[] = [
  {
    name: 'add_mask',
    title: 'Add a mask to a photo',
    description: `Adds a local adjustment: a mask with one part (brush, linear or radial gradient, colour or brightness range) and its own colour settings, applied only where the mask is (up to ${MASK_LIMITS.masks} masks, ${MASK_LIMITS.parts} parts each). Add more parts with set_mask_part; look at it with render_photo_preview and its mask argument. ${PART_SETTINGS}`,
    inputSchema: objectSchema(
      {
        photo: PHOTO_ARG,
        kind: stringSchema('Kind of the first part', { enum: PART_KINDS }),
        name: stringSchema('Name, e.g. "Sky"'),
        part: { type: 'object', description: 'Settings of the first part (see the description); left out = a ready-made shape' },
        adjust: adjustSchema('Colour settings applied where the mask is, e.g. {"exposure": -0.5}'),
        invert: booleanSchema('Apply everywhere except the mask'),
      },
      ['kind'],
    ),
    run: async (args) => {
      const item = targetOf(args.photo);
      if (item.edit.masks.length >= MASK_LIMITS.masks) throw new ToolError(`The photo already has ${MASK_LIMITS.masks} masks, the most it can have.`);
      if (!isOneOf(PART_KINDS, args.kind)) throw new ToolError(`Unknown part kind “${stringArg(args.kind)}”.`);
      const given = recordArg(args.adjust);
      await needLut(given);
      const mask = newMask(stringArg(args.name).trim() || `Mask ${item.edit.masks.length + 1}`, args.kind);
      const stored = putMask(item, {
        ...mask,
        parts: mask.parts.map((part) => shapePart(part, recordArg(args.part))),
        adjust: { ...DEFAULT_ADJUST, ...cleanAdjust(DEFAULT_ADJUST, given).patch },
        invert: args.invert === true,
      });
      const note = await findAi(currentItem(item.id));
      const hint = maskActive(stored) ? '' : ' It changes nothing yet: give it settings with edit_mask.';
      return ok(`Mask ${stored.id} added.${hint}${note}`, maskInfo(stored));
    },
  },
  {
    name: 'edit_mask',
    title: 'Change a mask',
    description:
      'Changes a mask’s name, whether it is on, inverted, and its colour settings (only the settings given change; resetAdjust: true starts from the defaults).',
    inputSchema: objectSchema(
      {
        photo: PHOTO_ARG,
        mask: stringSchema('Mask id'),
        name: stringSchema('New name'),
        on: booleanSchema('Apply the mask (false keeps it but leaves it out)'),
        invert: booleanSchema('Apply everywhere except the mask'),
        adjust: adjustSchema('Colour settings applied where the mask is'),
        resetAdjust: booleanSchema('Start the mask’s colour settings from the defaults'),
      },
      ['mask'],
    ),
    run: async (args) => {
      const item = targetOf(args.photo);
      const mask = maskOf(item, args.mask);
      const given = recordArg(args.adjust);
      await needLut(given);
      const base = args.resetAdjust === true ? DEFAULT_ADJUST : mask.adjust;
      const { patch, ignored } = cleanAdjust(base, given);
      const stored = putMask(item, {
        ...mask,
        name: stringArg(args.name).trim() || mask.name,
        on: typeof args.on === 'boolean' ? args.on : mask.on,
        invert: typeof args.invert === 'boolean' ? args.invert : mask.invert,
        adjust: { ...base, ...patch },
      });
      return ok(`Mask changed.${ignoredNote(ignored)}`, maskInfo(stored));
    },
  },
  {
    name: 'set_mask_part',
    title: 'Add or change a mask part',
    description: `Adds a part to a mask (give kind) or changes one (give part). Parts combine in order: add, subtract, or intersect (only where both are; range parts usually narrow a gradient down, e.g. a linear sky fade intersected with a blue colour range). ${PART_SETTINGS}`,
    inputSchema: objectSchema(
      {
        photo: PHOTO_ARG,
        mask: stringSchema('Mask id'),
        part: stringSchema('Id of the part to change; leave out to add one'),
        kind: stringSchema('Kind of a new part', { enum: PART_KINDS }),
        combine: stringSchema('How the part joins the parts before it (the first always adds)', { enum: MASK_COMBINES }),
        invert: booleanSchema('Invert this part'),
        settings: { type: 'object', description: 'Part settings (see the description)' },
      },
      ['mask'],
    ),
    run: async (args) => {
      const item = targetOf(args.photo);
      const mask = maskOf(item, args.mask);
      const stored = putMask(item, { ...mask, parts: partsWith(mask, args) });
      return ok(`Mask part set.${await findAi(currentItem(item.id))}`, maskInfo(stored));
    },
  },
  {
    name: 'remove_mask',
    title: 'Remove a mask or one of its parts',
    description: 'Removes a mask from a photo, or only one of its parts (give part). Undo brings it back in the open studio.',
    inputSchema: objectSchema(
      { photo: PHOTO_ARG, mask: stringSchema('Mask id'), part: stringSchema('Part id (leave out to remove the whole mask)') },
      ['mask'],
    ),
    destructive: true,
    run: (args) => {
      const item = targetOf(args.photo);
      const mask = maskOf(item, args.mask);
      if (typeof args.part === 'string') {
        if (!mask.parts.some((part) => part.id === args.part)) throw new ToolError(`Mask ${mask.id} has no part “${args.part}”.`);
        return ok('Part removed.', maskInfo(putMask(item, { ...mask, parts: mask.parts.filter((part) => part.id !== args.part) })));
      }
      setMasks(
        item.id,
        item.edit.masks.filter((candidate) => candidate.id !== mask.id),
      );
      return ok(`Mask removed; ${item.edit.masks.length - 1} left.`);
    },
  },
  {
    name: 'find_with_ai',
    title: 'Find the subject or sky with AI',
    description:
      'Runs the on-device AI model for every AI mask part of a photo (subject, sky), so the masks follow what it finds. The sky model needs a one-time download of about 176 MB from Hugging Face: pass allowDownload: true only after the user agreed. Photos never leave the device.',
    inputSchema: objectSchema({ photo: PHOTO_ARG, allowDownload: booleanSchema('The user agreed to download a model that isn’t on the device yet') }),
    run: async (args) => {
      const item = targetOf(args.photo);
      if (!aiTargets(item.edit.masks).length) throw new ToolError('This photo has no AI mask parts. Add one with add_mask (kind "ai").');
      const note = await findAi(item, args.allowDownload === true);
      return ok(note ? note.trim() : `Found ${aiTargets(item.edit.masks).join(' and ')}.`);
    },
  },
];
