/*
 * Photo credits. A photo from Pexels carries its credit in its name, "Alt text (Pexels / Photographer #12345)", so the
 * credit travels with the photo everywhere a name already goes (library, saved designs, backups, .chitthi files)
 * without a new stored field. Older names without the "#id" still parse; they just have no link.
 *
 * Pexels asks apps to credit photographers where they can ("Photo by … on Pexels", linked) and to link to Pexels
 * wherever API results are shown. The Pexels license lets people print the photos, but not sell unaltered copies as
 * a poster, print or physical product. See docs/PEXELS.md.
 */

/** A Pexels photo's credit. */
export interface PhotoCredit {
  photographer: string;
  /** The photo's page on Pexels (it links to the photographer), or null for older names without an id. */
  url: string | null;
  /** The Pexels photo id, or null for older names without one. */
  id: number | null;
}

/** The credit at the end of a Pexels photo's name: photographer and, in newer names, the photo id. */
const PEXELS_CREDIT = /\(Pexels \/ (.+?)(?: #(\d+))?\)\s*$/;

/**
 * The stored name of a photo downloaded from Pexels.
 * @param alt Pexels' description of the photo (up to 60 characters are kept)
 * @param photographer the photographer's name
 * @param id the Pexels photo id
 * @returns "Alt text (Pexels / Photographer #12345)"
 */
export function pexelsName(alt: string, photographer: string, id: number): string {
  const description = (alt || 'Photo').replace(/\s+/g, ' ').trim().slice(0, 60);
  return `${description} (Pexels / ${photographer.replace(/[()#]/g, '').trim()} #${id})`;
}

/**
 * The photo id at the end of a Pexels photo page URL (".../photo/burning-candles-10182772/").
 * @param pageUrl the page URL
 * @returns the id, or 0 when the URL doesn't end in one
 */
export const pexelsIdOf = (pageUrl: string): number => Number(/(?<!\d)(\d+)\/?$/.exec(pageUrl)?.[1] ?? 0);

/**
 * The Pexels credit a photo's name carries.
 * @param name the photo's name
 * @returns its credit, or null for a photo not from Pexels
 */
export function creditOf(name: string): PhotoCredit | null {
  const match = PEXELS_CREDIT.exec(name);
  if (!match) return null;
  const [, photographer = '', idText] = match;
  const id = idText ? Number(idText) : null;
  return { photographer: photographer.trim(), id, url: id ? `https://www.pexels.com/photo/${id}/` : null };
}

/** AI pictures carry their provenance the same way: "Description (AI / Provider model)". */
const AI_CREDIT = /\(AI \/ ([^()]+)\)\s*$/;

/** How an AI picture was made. */
export interface AiCredit {
  /** "OpenAI gpt-image-1", "Google Gemini gemini-3.1-flash-image"… */
  made: string;
}

/**
 * The AI credit a picture's name carries.
 * @param name the picture's name
 * @returns its credit, or null for a picture not made with AI
 */
export const aiCreditOf = (name: string): AiCredit | null => {
  const made = AI_CREDIT.exec(name)?.[1];
  return made === undefined ? null : { made: made.trim() };
};

/**
 * Whether a picture was made with AI.
 * @param name the picture's name
 * @returns true when its name carries an AI credit
 */
export const isAi = (name: string): boolean => AI_CREDIT.test(name);

/**
 * The name without its credit, for labels: the credit is shown separately, as a link.
 * @param name the photo's name
 * @returns the name before its credit (the whole name when that would leave nothing)
 */
export const shortName = (name: string): string => name.replace(PEXELS_CREDIT, '').replace(AI_CREDIT, '').trim() || name;

/**
 * Whether a photo came from Pexels.
 * @param name the photo's name
 * @returns true when its name carries a Pexels credit
 */
export const isPexels = (name: string): boolean => PEXELS_CREDIT.test(name);

/** The licence notes under the Pexels credits. */
const PEXELS_TERMS = [
  'Pexels photos are free to use under the Pexels license (https://www.pexels.com/license/).',
  'You may print them, but not sell unaltered copies of a photo as a poster, print or other physical product:',
  'the design around it (layout, words, artwork, crop) must change it. Identifiable people must not be shown in',
  'a bad light or appear to endorse anything.',
];

/** The notes under the AI credits. */
const AI_TERMS = [
  'AI pictures were generated with the designer’s own account. Their use is governed by that provider’s terms.',
  'Disclose that they are AI-generated where the law or a marketplace requires it.',
];

/**
 * One line crediting a Pexels photo.
 * @param credit the photo's credit
 * @returns "Photo by X on Pexels", with the photo's link when known
 */
const pexelsLine = (credit: PhotoCredit): string => `Photo by ${credit.photographer} on Pexels${credit.url ? '  ' + credit.url : ''}`;

/**
 * Credits for every distinct Pexels photo ("Photo by X on Pexels") and AI picture ("AI-generated with …") in a list
 * of names.
 * @param names the photos' names
 * @returns the credits as text, or null when there are none
 */
export function creditsText(names: string[]): string | null {
  const pexelsCredits = new Map<string, PhotoCredit>();
  const aiMakers = new Set<string>();
  for (const name of names) {
    const credit = creditOf(name);
    if (credit) pexelsCredits.set(credit.url ?? credit.photographer, credit);
    const aiCredit = aiCreditOf(name);
    if (aiCredit) aiMakers.add(aiCredit.made);
  }
  if (!pexelsCredits.size && !aiMakers.size) return null;
  const lines = ['PHOTO CREDITS', '='.repeat(60), ''];
  if (pexelsCredits.size) lines.push(...[...pexelsCredits.values()].map(pexelsLine), '', ...PEXELS_TERMS);
  if (aiMakers.size)
    lines.push(...(pexelsCredits.size ? [''] : []), ...[...aiMakers].map((made) => `AI-generated picture: made with ${made}`), '', ...AI_TERMS);
  return lines.join('\n');
}
