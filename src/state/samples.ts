import { SAMPLE_BASE_URL, type SampleCredit, type SampleDef } from '../data/samples';
import { isRecord } from '../engine/guards';
import { productDesign } from '../engine/design';
import { loadImage, makePhoto } from '../engine/photo';
import { pexelsIdOf, pexelsName } from '../lib/credits';
import type { Design, Photo } from '../types';

/*
 * Loading the sample designs of data/samples.ts: the photo set's manifest (samples.json, written by
 * `npm run fetch:samples`) and each sample's photos, decoded and named with their Pexels credit.
 */

/** A sample ready to show or open: its design, its photos in slot order and the credits it uses. */
export interface BuiltSample {
  design: Design;
  photos: Photo[];
  /** The photos' credits, each once. */
  credits: SampleCredit[];
}

/** The manifest's load, made once per session. */
let manifestLoad: Promise<SampleCredit[] | null> | null = null;

/**
 * Whether a manifest entry has every field a credit needs.
 * @param value one entry of samples.json's `photos`
 * @returns true for a usable credit
 */
function isSampleCredit(value: unknown): value is SampleCredit {
  if (!isRecord(value)) return false;
  return ['id', 'file', 'alt', 'photographer', 'photographerUrl', 'pexelsUrl'].every((field) => typeof value[field] === 'string');
}

/**
 * The credits listed in samples.json.
 * @param manifest the parsed file
 * @returns its usable credits, or null when it lists none
 */
function creditsIn(manifest: unknown): SampleCredit[] | null {
  if (!isRecord(manifest) || !Array.isArray(manifest.photos)) return null;
  const credits = manifest.photos.filter(isSampleCredit);
  return credits.length ? credits : null;
}

/**
 * The downloaded photo set (loaded once).
 * @returns its credits, or null when `npm run fetch:samples` hasn't been run
 */
export function sampleCredits(): Promise<SampleCredit[] | null> {
  manifestLoad ??= fetch(`${SAMPLE_BASE_URL}samples.json`)
    .then((response): Promise<unknown> | null => (response.ok ? response.json() : null))
    .then(creditsIn)
    .catch(() => null);
  return manifestLoad;
}

// Loads in flight, so two samples sharing a photo decode it once. Finished photos are not kept: a decoded
// 1600 px photo is ~7 MB, and the gallery keeps only its small rendered thumbnails (the browser's HTTP cache makes
// reloading a sample's photos for "Use this" quick).
const photoLoads = new Map<string, Promise<Photo>>();

/**
 * A sample photo, decoded and named with its credit.
 * @param credit the photo's manifest entry
 * @returns the photo
 */
function loadSamplePhoto(credit: SampleCredit): Promise<Photo> {
  let photoLoad = photoLoads.get(credit.id);
  if (!photoLoad) {
    const url = SAMPLE_BASE_URL + credit.file;
    photoLoad = loadImage(url)
      .then((image) => makePhoto(image, pexelsName(credit.alt, credit.photographer, pexelsIdOf(credit.pexelsUrl)), url))
      .finally(() => photoLoads.delete(credit.id));
    photoLoads.set(credit.id, photoLoad);
  }
  return photoLoad;
}

/**
 * A sample's full design plus its loaded photos, ready for replaceCard() or renderCard().
 * @param sample the sample
 * @param credits the downloaded photo set (sampleCredits())
 * @returns the design, its photos (those found in the set) and their credits
 */
export async function buildSample(sample: SampleDef, credits: SampleCredit[]): Promise<BuiltSample> {
  const used = sample.photos.map((id) => credits.find((credit) => credit.id === id)).filter((credit) => credit !== undefined);
  const photos = await Promise.all(used.map(loadSamplePhoto));
  const design = { ...sample.build(productDesign(sample.product)), designName: sample.title };
  // unique credits (a calendar reuses nothing, but keep the list tidy)
  const seen = new Set<string>();
  const unique = used.filter((credit) => {
    if (seen.has(credit.id)) return false;
    seen.add(credit.id);
    return true;
  });
  return { design, photos, credits: unique };
}
