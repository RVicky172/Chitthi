import type { JsonSchema } from '../types';

/*
 * Prompt templates for words (versioned: change VERSION when the wording changes, so results can be compared).
 * Shared by the studio's "Write with AI", the agent tools and the MCP prompts. Each template turns a plain context
 * object into a system prompt, a user prompt and the JSON schema of the answer.
 */

/** The words templates' version. */
export const WORDS_VERSION = 'words-2026-10-1';

/** What front words are written for. */
export interface WordsContext {
  product: 'postcard' | 'calendar' | 'frame' | 'magnet';
  occasion: string;
  /** Language name as shown to the user, e.g. "Hinglish (Hindi in English letters)". */
  language: string;
  tone: string;
  /** Character budgets from the layout's text area, so the words fit without shrinking. */
  budget: { greeting: number; quote: number; signature: number };
  recipient?: string;
  sender?: string;
  /** Anything the user wants mentioned ("her 80th birthday", "first Diwali in the new house"). */
  notes?: string;
  count: number;
}

const SYSTEM = `You write the words printed on greeting cards, postcards, calendars and photo gifts made in India with an app called Chitthi.
Write like a thoughtful person, not an advert: specific, warm and natural. Respect the festival's traditions and wish the reader well without preaching.
Never use real people's names unless given, never invent facts, and never include hashtags, emojis, quotation marks around the text, or placeholders.
Write every piece in the requested language and script. Hinglish means Hindi written in English letters.
Keep each piece within its character budget: it is printed at a fixed size.`;

/**
 * The prompt for front-word options.
 * @param context the card, language, tone, budgets and names
 * @returns the system prompt, user prompt and answer schema
 */
export function wordsPrompt(context: WordsContext): { system: string; prompt: string; schema: JsonSchema; schemaName: string } {
  const lines = [
    `Write ${context.count} different options for a ${context.product} for: ${context.occasion}.`,
    `Language: ${context.language}. Tone: ${context.tone}.`,
    context.recipient ? `It is for: ${context.recipient}.` : '',
    context.sender ? `From: ${context.sender}.` : '',
    context.notes ? `Mention if it fits: ${context.notes}.` : '',
    `Each option has a greeting (the headline, at most ${context.budget.greeting} characters), a quote or wish (one or two sentences, at most ${context.budget.quote} characters) and a signature line (at most ${context.budget.signature} characters, e.g. "With love").`,
    'Make the options clearly different from each other in idea, not just wording.',
  ];
  return { system: SYSTEM, prompt: lines.filter(Boolean).join('\n'), schema: WORDS_SCHEMA, schemaName: 'card_words' };
}

/** The answer's schema: options of greeting, quote and signature. */
export const WORDS_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    options: {
      type: 'array',
      items: {
        type: 'object',
        properties: { greeting: { type: 'string' }, quote: { type: 'string' }, signature: { type: 'string' } },
        required: ['greeting', 'quote', 'signature'],
        additionalProperties: false,
      },
    },
  },
  required: ['options'],
  additionalProperties: false,
};

/** What calendar captions are written for. */
export interface CaptionsContext {
  year: number;
  /** The 12 months shown, in page order, with the festivals marked in each. */
  months: { name: string; festivals: string[]; photo?: string }[];
  language: string;
  tone: string;
  theme: string;
  budget: number;
  notes?: string;
}

/**
 * One page of the calendar in the captions prompt.
 * @param month the page's month, festivals and photo
 * @param index its place
 * @returns "3. March 2027 (festivals: Holi) (photo: …)"
 */
function pageLine(month: CaptionsContext['months'][number], index: number): string {
  const festivals = month.festivals.length ? ' (festivals: ' + month.festivals.join(', ') + ')' : '';
  const photo = month.photo ? ' (photo: ' + month.photo + ')' : '';
  return `${index + 1}. ${month.name}${festivals}${photo}`;
}

/**
 * The prompt for calendar captions.
 * @param context the year, pages, language, tone, theme and budget
 * @returns the system prompt, user prompt and answer schema
 */
export function captionsPrompt(context: CaptionsContext): { system: string; prompt: string; schema: JsonSchema; schemaName: string } {
  const list = context.months.map(pageLine).join('\n');
  return {
    system: SYSTEM,
    prompt: [
      `Write one caption for each page of a ${context.year} wall calendar with the theme "${context.theme}".`,
      `Language: ${context.language}. Tone: ${context.tone}. At most ${context.budget} characters each.`,
      'Name the month’s main festival when there is one; otherwise write about the season or the photo. Don’t repeat the month name.',
      context.notes ? `Also consider: ${context.notes}.` : '',
      `Pages, in order:\n${list}`,
      `Return exactly ${context.months.length} captions in the same order.`,
    ]
      .filter(Boolean)
      .join('\n'),
    schema: CAPTIONS_SCHEMA,
    schemaName: 'calendar_captions',
  };
}
/** The answer's schema: the captions in page order. */
export const CAPTIONS_SCHEMA: JsonSchema = {
  type: 'object',
  properties: { captions: { type: 'array', items: { type: 'string' } } },
  required: ['captions'],
  additionalProperties: false,
};

/** What back messages are written for. */
export interface MessageContext {
  occasion: string;
  language: string;
  tone: string;
  recipient?: string;
  sender?: string;
  notes?: string;
  budget: number;
  count: number;
}

/**
 * The prompt for back messages.
 * @param context the occasion, language, tone, names, budget and how many
 * @returns the system prompt, user prompt and answer schema
 */
export function messagePrompt(context: MessageContext): { system: string; prompt: string; schema: JsonSchema; schemaName: string } {
  return {
    system: SYSTEM,
    prompt: [
      `Write ${context.count} different short handwritten-style messages for the back of a postcard for: ${context.occasion}.`,
      `Language: ${context.language}. Tone: ${context.tone}. At most ${context.budget} characters each, 2–4 short lines, starting with a greeting to the reader.`,
      context.recipient ? `To: ${context.recipient}.` : '',
      context.sender ? `From: ${context.sender} (don’t sign it; the card has a From line).` : '',
      context.notes ? `Mention if it fits: ${context.notes}.` : '',
    ]
      .filter(Boolean)
      .join('\n'),
    schema: MESSAGES_SCHEMA,
    schemaName: 'card_messages',
  };
}
/** The answer's schema: the messages. */
export const MESSAGES_SCHEMA: JsonSchema = {
  type: 'object',
  properties: { messages: { type: 'array', items: { type: 'string' } } },
  required: ['messages'],
  additionalProperties: false,
};
