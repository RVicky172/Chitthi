import type { JsonSchema } from '../types';

/*
 * Prompt templates for words (versioned: change VERSION when the wording changes, so results can be compared).
 * Shared by the studio's "Write with AI", the agent tools and the MCP prompts. Each template turns a plain context
 * object into a system prompt, a user prompt and the JSON schema of the answer.
 */

export const WORDS_VERSION = 'words-2026-10-1';

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

export function wordsPrompt(c: WordsContext): { system: string; prompt: string; schema: JsonSchema; schemaName: string } {
  const lines = [
    `Write ${c.count} different options for a ${c.product} for: ${c.occasion}.`,
    `Language: ${c.language}. Tone: ${c.tone}.`,
    c.recipient ? `It is for: ${c.recipient}.` : '',
    c.sender ? `From: ${c.sender}.` : '',
    c.notes ? `Mention if it fits: ${c.notes}.` : '',
    `Each option has a greeting (the headline, at most ${c.budget.greeting} characters), a quote or wish (one or two sentences, at most ${c.budget.quote} characters) and a signature line (at most ${c.budget.signature} characters, e.g. "With love").`,
    'Make the options clearly different from each other in idea, not just wording.',
  ];
  return { system: SYSTEM, prompt: lines.filter(Boolean).join('\n'), schema: WORDS_SCHEMA, schemaName: 'card_words' };
}

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

export function captionsPrompt(c: CaptionsContext): { system: string; prompt: string; schema: JsonSchema; schemaName: string } {
  const list = c.months
    .map((m, i) => `${i + 1}. ${m.name}${m.festivals.length ? ` (festivals: ${m.festivals.join(', ')})` : ''}${m.photo ? ` (photo: ${m.photo})` : ''}`)
    .join('\n');
  return {
    system: SYSTEM,
    prompt: [
      `Write one caption for each page of a ${c.year} wall calendar with the theme "${c.theme}".`,
      `Language: ${c.language}. Tone: ${c.tone}. At most ${c.budget} characters each.`,
      'Name the month’s main festival when there is one; otherwise write about the season or the photo. Don’t repeat the month name.',
      c.notes ? `Also consider: ${c.notes}.` : '',
      `Pages, in order:\n${list}`,
      `Return exactly ${c.months.length} captions in the same order.`,
    ]
      .filter(Boolean)
      .join('\n'),
    schema: CAPTIONS_SCHEMA,
    schemaName: 'calendar_captions',
  };
}
export const CAPTIONS_SCHEMA: JsonSchema = {
  type: 'object',
  properties: { captions: { type: 'array', items: { type: 'string' } } },
  required: ['captions'],
  additionalProperties: false,
};

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

export function messagePrompt(c: MessageContext): { system: string; prompt: string; schema: JsonSchema; schemaName: string } {
  return {
    system: SYSTEM,
    prompt: [
      `Write ${c.count} different short handwritten-style messages for the back of a postcard for: ${c.occasion}.`,
      `Language: ${c.language}. Tone: ${c.tone}. At most ${c.budget} characters each, 2–4 short lines, starting with a greeting to the reader.`,
      c.recipient ? `To: ${c.recipient}.` : '',
      c.sender ? `From: ${c.sender} (don’t sign it; the card has a From line).` : '',
      c.notes ? `Mention if it fits: ${c.notes}.` : '',
    ]
      .filter(Boolean)
      .join('\n'),
    schema: MESSAGES_SCHEMA,
    schemaName: 'card_messages',
  };
}
export const MESSAGES_SCHEMA: JsonSchema = {
  type: 'object',
  properties: { messages: { type: 'array', items: { type: 'string' } } },
  required: ['messages'],
  additionalProperties: false,
};
