/*
 * Photo credits. A photo from Pexels carries its credit in its name, "Alt text (Pexels / Photographer #12345)", so the
 * credit travels with the photo everywhere a name already goes (library, saved designs, backups, .chitthi files)
 * without a new stored field. Older names without the "#id" still parse; they just have no link.
 *
 * Pexels asks apps to credit photographers where they can ("Photo by … on Pexels", linked) and to link to Pexels
 * wherever API results are shown. The Pexels license lets people print the photos, but not sell unaltered copies as
 * a poster, print or physical product. See docs/PEXELS.md.
 */

export interface PhotoCredit {
  photographer: string;
  /** The photo's page on Pexels (it links to the photographer), or null for older names without an id. */
  url: string | null;
  id: number | null;
}

const RE = /\s*\(Pexels \/ (.+?)(?: #(\d+))?\)\s*$/;

/** The stored name of a photo downloaded from Pexels. */
export function pexelsName(alt: string, photographer: string, id: number): string {
  const a = (alt || 'Photo').replace(/\s+/g, ' ').trim().slice(0, 60);
  return `${a} (Pexels / ${photographer.replace(/[()#]/g, '').trim()} #${id})`;
}

/** The photo id at the end of a Pexels photo page URL (".../photo/burning-candles-10182772/"). */
export const pexelsIdOf = (pageUrl: string): number => +(/(\d+)\/?$/.exec(pageUrl)?.[1] ?? 0);

export function creditOf(name: string): PhotoCredit | null {
  const m = RE.exec(name);
  if (!m) return null;
  const id = m[2] ? +m[2] : null;
  return { photographer: m[1].trim(), id, url: id ? `https://www.pexels.com/photo/${id}/` : null };
}

/** The name without its credit, for labels: the credit is shown separately, as a link. */
export const shortName = (name: string): string => name.replace(RE, '').trim() || name;

export const isPexels = (name: string): boolean => RE.test(name);

/** "Photo by X on Pexels" lines for every distinct Pexels photo in a list of names, or null when there are none. */
export function creditsText(names: string[]): string | null {
  const seen = new Map<string, PhotoCredit>();
  for (const n of names) {
    const c = creditOf(n);
    if (c) seen.set(c.url ?? c.photographer, c);
  }
  if (!seen.size) return null;
  const L = [
    'PHOTO CREDITS',
    '='.repeat(60),
    '',
    ...[...seen.values()].map((c) => `Photo by ${c.photographer} on Pexels${c.url ? `  ${c.url}` : ''}`),
    '',
    'Pexels photos are free to use under the Pexels license (https://www.pexels.com/license/).',
    'You may print them, but not sell unaltered copies of a photo as a poster, print or other physical product:',
    'the design around it (layout, words, artwork, crop) must change it. Identifiable people must not be shown in',
    'a bad light or appear to endorse anything.',
  ];
  return L.join('\n');
}
