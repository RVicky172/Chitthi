import { AI_LANGUAGES } from '../data/aiProviders';
import { MONTHS } from '../data/products';
import { putOnCard, storePhotos } from '../state/library';
import { selectSlot } from '../state/photoSlots';
import { getState, setDesign } from '../state/store';
import { booleanSchema, numberSchema, objectSchema, ok, stringArg, stringSchema, ToolError, type AgentTool } from './common';

/* AI tools: the user's own provider, chosen in Settings → AI (the service loads only when one is used). */

const ART_STYLES = ['photo', 'watercolour', 'illustration', 'papercut', 'pattern', 'madhubani'] as const;

/**
 * The style an agent names.
 * @param value the argument
 * @returns the style, or photo when none or an unknown one is given
 */
const artStyle = (value: unknown): (typeof ART_STYLES)[number] => ART_STYLES.find((style) => style === value) ?? 'photo';

/**
 * The language, tone and notes an agent gives for words.
 * @param args the tool's arguments
 * @returns them, with English and warm as the defaults
 */
const wordsBrief = (args: Record<string, unknown>) => ({
  language: stringArg(args.language, 'en'),
  tone: stringArg(args.tone, 'warm'),
  notes: stringArg(args.notes) || undefined,
});

/** The AI tools. */
export const AI_TOOLS: AgentTool[] = [
  {
    name: 'write_words',
    title: 'Write words with AI',
    description:
      'Asks the AI service chosen in Chitthi’s settings for greeting, quote and signature options that fit the layout. Set apply to an option index to use it. Languages: ' +
      AI_LANGUAGES.map((language) => language.id).join(', '),
    inputSchema: objectSchema({
      language: stringSchema('Language id', { enum: AI_LANGUAGES.map((language) => language.id) }),
      tone: stringSchema('warm, playful, formal, poetic, short and sweet'),
      notes: stringSchema('Anything to mention'),
      apply: numberSchema('Index of the option to use'),
    }),
    run: async (args) => {
      const { writeWords } = await import('../ai/service');
      const options = await writeWords(getState().design, wordsBrief(args));
      const chosen = typeof args.apply === 'number' ? options[args.apply] : undefined;
      if (chosen)
        setDesign({ heading: chosen.greeting, quote: chosen.quote, sig: chosen.signature, showHeading: true, showQuote: true, showSig: true });
      const text = typeof args.apply === 'number' ? `Applied option ${args.apply}.` : `${options.length} options. Call again with apply, or use set_words.`;
      return ok(text, options);
    },
  },
  {
    name: 'write_calendar_captions',
    title: 'Write calendar captions with AI',
    description:
      'Calendars: asks the AI service for one caption per month using that month’s festivals and photo, and applies them unless apply is false.',
    inputSchema: objectSchema({
      language: stringSchema('Language id'),
      tone: stringSchema('Tone'),
      notes: stringSchema('Anything to mention'),
      apply: booleanSchema('Apply the captions (default true)'),
    }),
    run: async (args) => {
      const { design, photos } = getState();
      if (design.product !== 'calendar') throw new ToolError('The current design isn’t a calendar.');
      const { writeCaptions } = await import('../ai/service');
      const written = await writeCaptions(design, photos, wordsBrief(args));
      if (args.apply !== false)
        setDesign((current) => {
          const captions = [...current.cal.captions];
          for (const { month, caption } of written) captions[month] = caption;
          return { cal: { ...current.cal, captions, text: current.cal.text === 'off' ? 'caption' : current.cal.text } };
        });
      return ok(
        args.apply === false ? 'Captions written (not applied).' : 'Captions written and applied.',
        written.map(({ month, caption }) => ({ month: MONTHS[month], caption })),
      );
    },
  },
  {
    name: 'generate_image',
    title: 'Create a picture with AI',
    description:
      'Asks the image service chosen in Chitthi’s settings for a picture shaped for a photo slot (no lettering, no real people), and puts it on the design. It is marked as AI-generated in the library and print credits.',
    inputSchema: objectSchema(
      {
        subject: stringSchema('What the picture shows'),
        style: stringSchema('Style', { enum: ART_STYLES }),
        slot: numberSchema('Photo slot index, 0-based (default: the selected slot)'),
        people: booleanSchema('Allow people (never a real person); default false'),
      },
      ['subject'],
    ),
    run: async (args) => {
      const { generateArt, aiPhotoName, blobToJpegDataUrl } = await import('../ai/service');
      const { design } = getState();
      const slot = typeof args.slot === 'number' ? Math.max(0, Math.round(args.slot)) : getState().ui.slot;
      selectSlot(slot);
      const subject = stringArg(args.subject);
      const art = await generateArt(design, slot, { subject, style: artStyle(args.style), people: args.people === true, n: 1 });
      const picture = art.blobs.at(0);
      if (!picture) throw new ToolError('The image service gave no picture.');
      const photo = { name: aiPhotoName(subject, art.provider, art.model), url: await blobToJpegDataUrl(picture) };
      await storePhotos([photo]);
      await putOnCard({ id: '', added: Date.now(), ...photo });
      return ok(`Picture made with ${art.provider} ${art.model} and placed in slot ${slot + 1}.`);
    },
  },
];
