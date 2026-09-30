/*
 * Prompt templates for pictures (versioned like the word templates). The picture fills a photo slot on a printed
 * piece, so the prompt asks for print-friendly art with no lettering (the card adds its own words), leaves calm space
 * where the words sit, and by default shows no people: no real person's likeness, no brands or logos.
 */

export const ART_VERSION = 'art-2026-10-1';

export const ART_STYLES = [
  ['photo', 'Photograph'],
  ['watercolour', 'Watercolour'],
  ['illustration', 'Flat illustration'],
  ['papercut', 'Paper-cut art'],
  ['pattern', 'Festive pattern'],
  ['madhubani', 'Madhubani folk art'],
] as const;
export type ArtStyle = (typeof ART_STYLES)[number][0];

export interface ArtContext {
  subject: string;
  style: ArtStyle;
  /** Where the words go, so the picture keeps that area calm: 'top', 'bottom', 'left', 'right' or none. */
  space?: 'top' | 'bottom' | 'left' | 'right';
  people: boolean;
  mood?: string;
  /** Theme colours to lean towards, as names or hex. */
  colours?: string[];
}

const STYLE_WORDS: Record<ArtStyle, string> = {
  photo: 'a high-resolution photograph, natural light, sharp detail, shallow depth of field',
  watercolour: 'a watercolour painting on textured paper, soft washes, gentle edges',
  illustration: 'a flat vector illustration, clean shapes, limited palette, no gradients mesh',
  papercut: 'layered paper-cut art with soft shadows between the layers',
  pattern: 'a seamless decorative pattern of festive motifs, evenly spaced',
  madhubani: 'Madhubani folk painting style, fine line work, natural pigments, decorative borders',
};

export function artPrompt(c: ArtContext): string {
  return [
    `${c.subject}, as ${STYLE_WORDS[c.style]}.`,
    c.mood ? `Mood: ${c.mood}.` : '',
    c.colours?.length ? `Colour palette leaning towards ${c.colours.join(', ')}.` : '',
    c.space ? `Keep the ${c.space} part of the picture calm and uncluttered: words will be printed there.` : '',
    c.people ? 'People may appear, but not any real or famous person.' : 'No people, faces or hands.',
    'No text, letters, numbers, logos, watermarks or brand names anywhere in the image.',
    'Suitable for printing on a greeting card: rich but not oversaturated colours, nothing important near the edges.',
  ]
    .filter(Boolean)
    .join(' ');
}
