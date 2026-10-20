import { describe, expect, it } from 'vitest';
import { DEFAULT_EDIT } from '@/engine/instagram';
import type { Layer } from '@/engine/layers';
import {
  toDocument,
  videoDocument,
  videoFromDocument,
  type DocMedia,
  type EditorVideo,
  type ProjectDoc,
} from '@/engine/projectDoc';
import { mergeProject } from '@/engine/projectGate';
import { defaultTracks } from '@/engine/tracks';
import { codeUnitOrder } from '../../support/codeUnitOrder';
import { defined } from '../../support/defined';
import { legacyDoc, legacyFixtures } from '../../support/timeline.testkit';

/*
 * 408 T010 (AC-2): the video editor's project → its saved document → the editor again → the same document, byte for
 * byte, for the 201 fixtures (2.x projects) and a project using everything 202–208 added.
 */

/** A file as the tests hold it: its size and type, and the media id it was kept under. */
interface TestFile {
  id: string;
  size: number;
  type: string;
}

const idOf = (file: TestFile): string => file.id;
const fileFor = (media: DocMedia): TestFile => ({ id: media.id, size: media.size, type: media.type });

/**
 * The editor's project for a 201 fixture: the 2.x document through the gate, then opened.
 * @param name the fixture's name
 * @returns the editor's project
 */
function fromLegacy(name: string): EditorVideo<TestFile> {
  const merged = mergeProject(JSON.parse(JSON.stringify(legacyDoc(defined(legacyFixtures()[name], name)))), true);
  expect(merged.dropped).toEqual([]);
  return videoFromDocument(merged.doc, fileFor).video;
}

const clipFile: TestFile = { id: 'clipA', size: 48_000_000, type: 'video/mp4' };
const photoFile: TestFile = { id: 'photoB', size: 2_400_000, type: 'image/jpeg' };
const songFile: TestFile = { id: 'song', size: 7_000_000, type: 'audio/mpeg' };
const voiceFile: TestFile = { id: 'voice', size: 900_000, type: 'audio/wav' };
const logo: DocMedia = { id: 'img1', kind: 'image', name: 'logo.png', type: 'image/png', size: 20_000, w: 400, h: 200, srcDur: 0 };

const textLayer: Layer = {
  id: 'l1',
  kind: 'text',
  x: 0.5,
  y: 0.2,
  w: 0.6,
  rot: 0,
  opacity: 1,
  text: 'Hills',
  font: 'Poppins',
  size: 0.08,
  color: '#ffffff',
  align: 'center',
  bg: '',
  bold: false,
  italic: false,
  outline: '',
  shadow: false,
  start: 1,
  end: 6,
  keys: { opacity: [{ t: 0, v: 0, ease: 'linear' }, { t: 1, v: 1, ease: 'ease-out' }] },
};
const imageLayer: Layer = { id: 'l2', kind: 'image', image: 'img1', name: 'logo.png', x: 0.85, y: 0.1, w: 0.2, h: 0.1, rot: 0, opacity: 0.9 };

/** A YouTube project with everything 202–208 added: gaps, an overlay with a box and keys, a transition, every speed,
 * three audio tracks with roles, ducking and Solo, sounds with fades and keys, loudness, layers, view settings.
 * @returns the project
 */
function everything(): EditorVideo<TestFile> {
  const [main, music] = defaultTracks();
  const video = { edit: { ...DEFAULT_EDIT }, motion: 'none' as const, fade: false, volume: 1, w: 1920, h: 1080, srcDur: 20, name: 'trip.mp4', file: clipFile };
  return {
    kind: 'vlog',
    format: 'yt1080',
    fps: 60,
    quality: 'high',
    fadeOut: false,
    magnetic: false,
    loudness: -14,
    t: 3.25,
    trackView: { V1: 'large', A2: 'small' },
    tracks: [
      main,
      { id: 'O1', kind: 'overlay', name: 'Overlay 1', hidden: false, muted: false, locked: true },
      { ...music, volume: 0.8, duck: { amount: 15, threshold: -45 } },
      { id: 'A2', kind: 'audio', name: 'Voice', hidden: false, muted: false, locked: false, role: 'voice' },
      { id: 'A3', kind: 'audio', name: 'Effects', hidden: false, muted: true, locked: false, role: 'effects', solo: true, voice: false },
    ],
    clips: [
      { id: 'c1', kind: 'photo', track: 'V1', start: 0, dur: 2, in: 0, out: 0, edit: { ...DEFAULT_EDIT }, motion: 'zoom-in', fade: true, volume: 0, w: 4000, h: 3000, srcDur: 0, name: 'hill.jpg', file: photoFile, transition: { kind: 'dissolve', dur: 0.5, to: 'c2' } },
      { ...video, id: 'c2', kind: 'video', track: 'V1', start: 2, dur: 0, in: 1, out: 5, speed: 2 },
      { ...video, id: 'c3', kind: 'video', track: 'V1', start: 6, dur: 0, in: 5, out: 8, reverse: true },
      { ...video, id: 'c4', kind: 'video', track: 'V1', start: 9, dur: 0, in: 8, out: 12, ramp: [{ at: 0, v: 1 }, { at: 1, v: 2 }] },
      { ...video, id: 'c5', kind: 'video', track: 'V1', start: 13, dur: 1.5, in: 12, out: 14, freeze: 13 },
      {
        ...video,
        id: 'o1',
        kind: 'video',
        track: 'O1',
        start: 1,
        dur: 0,
        in: 0,
        out: 3,
        volume: 0.5,
        tf: { x: 0.7, y: 0.3, w: 0.4, rot: 10, opacity: 0.9, radius: 0.1 },
        keys: { x: [{ t: 0, v: 0.7, ease: 'linear' }, { t: 2, v: 0.3, ease: 'ease-in-out' }] },
      },
    ],
    sounds: [
      { id: 's1', track: 'A1', start: 0, in: 5, volume: 0.8, fadeIn: 1, name: 'song.mp3', toEnd: true, srcDur: 180, file: songFile },
      {
        id: 's2',
        track: 'A2',
        start: 2,
        in: 0,
        out: 4,
        volume: 1.2,
        fadeOut: 0.5,
        keys: { volume: [{ t: 0, v: 1.2, ease: 'linear' }, { t: 2, v: 0.6, ease: 'hold' }] },
        name: 'voice.wav',
        toEnd: false,
        srcDur: 10,
        file: voiceFile,
      },
    ],
    layers: [textLayer, imageLayer],
    pool: [],
  };
}

/**
 * Saves a project, reads the JSON back through the gate and opens it.
 * @param video the editor's project
 * @param name its name
 * @returns the saved JSON, the gate's reasons, the reopened project and its name
 */
function roundTrip(video: EditorVideo<TestFile>, name: string) {
  const json = JSON.stringify(videoDocument(video, name, idOf, [logo]));
  const merged = mergeProject(JSON.parse(json), true);
  const opened = videoFromDocument(merged.doc, fileFor);
  return { json, dropped: merged.dropped, opened };
}

const legacyNames = Object.keys(legacyFixtures());

describe('408 AC-2: project → document → project → document, identical', () => {
  it.each(legacyNames)('201 fixture %s', (name) => {
    const video = fromLegacy(name);
    const first = roundTrip(video, `Reel ${name}`);
    expect(first.dropped).toEqual([]);
    expect(first.opened.name).toBe(`Reel ${name}`);
    expect(JSON.stringify(videoDocument(first.opened.video, first.opened.name, idOf, [logo]))).toBe(first.json);
  });

  it('a project with everything 202–208 added comes back as it was', () => {
    const video = everything();
    const first = roundTrip(video, 'Trip to the hills');
    expect(first.dropped).toEqual([]);
    expect(first.opened.video).toEqual(video);
    expect(JSON.stringify(videoDocument(first.opened.video, first.opened.name, idOf, [logo]))).toBe(first.json);
  });

  it('keeps the name, the playhead, the track heights and every export setting', () => {
    const { opened } = roundTrip(everything(), 'Trip to the hills');
    expect(opened.name).toBe('Trip to the hills');
    const { kind, format, fps, quality, fadeOut, magnetic, loudness, t, trackView } = opened.video;
    expect({ kind, format, fps, quality, fadeOut, magnetic, loudness, t, trackView }).toEqual({
      kind: 'vlog',
      format: 'yt1080',
      fps: 60,
      quality: 'high',
      fadeOut: false,
      magnetic: false,
      loudness: -14,
      t: 3.25,
      trackView: { V1: 'large', A2: 'small' },
    });
  });

  it('loudness Off and an empty view are left out of the document', () => {
    const doc = videoDocument({ ...everything(), loudness: 'off', trackView: {} }, 'Plain', idOf);
    expect(doc).not.toHaveProperty('loudness');
    expect(doc).not.toHaveProperty('trackView');
    expect(videoFromDocument(doc, fileFor).video).toMatchObject({ loudness: 'off', trackView: {} });
  });
});

describe('408: media in the document', () => {
  it('lists each file once, however many clips use it, in the order of first use', () => {
    const doc = videoDocument(everything(), 'Trip', idOf, [logo]);
    expect(doc.media.map((media) => media.id)).toEqual(['photoB', 'clipA', 'song', 'voice', 'img1']);
    expect(doc.media.find((media) => media.id === 'clipA')).toEqual({
      id: 'clipA',
      kind: 'video',
      name: 'trip.mp4',
      type: 'video/mp4',
      size: 48_000_000,
      w: 1920,
      h: 1080,
      srcDur: 20,
    });
    expect(doc.media.find((media) => media.id === 'song')).toMatchObject({ kind: 'audio', name: 'song.mp3', w: 0, h: 0, srcDur: 180 });
  });

  it('a reopened clip gets its file, name, size and length from its media entry', () => {
    const doc = videoDocument(everything(), 'Trip', idOf);
    const opened: DocMedia[] = [];
    const { video } = videoFromDocument(doc, (media) => (opened.push(media), fileFor(media)));
    expect(opened.map((media) => media.id).sort(codeUnitOrder)).toEqual(['clipA', 'photoB', 'song', 'voice']);
    expect(video.clips.find((clip) => clip.id === 'c3')).toMatchObject({ name: 'trip.mp4', w: 1920, h: 1080, srcDur: 20, file: clipFile });
  });
});

describe('504: the media pool in the document', () => {
  const spare: TestFile = { id: 'spare', size: 5_000_000, type: 'video/mp4' };
  const still: TestFile = { id: 'still', size: 1_000_000, type: 'image/jpeg' };
  const take: TestFile = { id: 'take', size: 300_000, type: 'audio/webm' };
  /**
   * `everything()` with unused files in its pool (and one that a clip uses), and its voice clip a recorded take.
   * @returns the project
   */
  function withPool(): EditorVideo<TestFile> {
    const video = everything();
    return {
      ...video,
      sounds: video.sounds.map((sound) => (sound.id === 's2' ? { ...sound, recorded: true as const } : sound)),
      pool: [
        { kind: 'video', name: 'spare.mp4', file: spare, w: 1280, h: 720, srcDur: 8 },
        { kind: 'video', name: 'trip.mp4', file: clipFile, w: 1920, h: 1080, srcDur: 20 },
        { kind: 'photo', name: 'still.jpg', file: still, w: 3000, h: 2000, srcDur: 0 },
        { kind: 'audio', name: 'Voice 3', file: take, w: 0, h: 0, srcDur: 4, recorded: true },
      ],
    };
  }

  it('lists the unused files after the used ones, each file once', () => {
    const doc = videoDocument(withPool(), 'Trip', idOf, [logo]);
    expect(doc.media.map((media) => media.id)).toEqual(['photoB', 'clipA', 'song', 'voice', 'img1', 'spare', 'still', 'take']);
    expect(doc.media.find((media) => media.id === 'still')).toEqual({ id: 'still', kind: 'photo', name: 'still.jpg', type: 'image/jpeg', size: 1_000_000, w: 3000, h: 2000, srcDur: 0 });
  });

  it('marks a recorded take on its media entry, not on its sound clip', () => {
    const doc = videoDocument(withPool(), 'Trip', idOf, [logo]);
    expect(doc.media.filter((media) => media.recorded).map((media) => media.id)).toEqual(['voice', 'take']);
    expect(doc.audio.find((sound) => sound.id === 's2')).not.toHaveProperty('recorded');
  });

  it('gives back the files no clip, sound or image layer uses as the pool, and the takes as recorded', () => {
    const { dropped, opened } = roundTrip(withPool(), 'Trip');
    expect(dropped).toEqual([]);
    expect(opened.video.pool).toEqual([
      { kind: 'video', name: 'spare.mp4', file: spare, w: 1280, h: 720, srcDur: 8 },
      { kind: 'photo', name: 'still.jpg', file: still, w: 3000, h: 2000, srcDur: 0 },
      { kind: 'audio', name: 'Voice 3', file: take, w: 0, h: 0, srcDur: 4, recorded: true },
    ]);
    expect(opened.video.sounds.find((sound) => sound.id === 's2')).toMatchObject({ recorded: true });
    expect(opened.video.sounds.find((sound) => sound.id === 's1')).not.toHaveProperty('recorded');
  });

  it('saves the same bytes again after reopening', () => {
    const first = roundTrip(withPool(), 'Trip');
    expect(JSON.stringify(videoDocument(first.opened.video, first.opened.name, idOf, [logo]))).toBe(first.json);
  });

  it.each(legacyNames)('a project from before 504 (%s) opens with an empty pool', (name) => {
    expect(fromLegacy(name).pool).toEqual([]);
  });
});

describe('408: documents from before 408 stay as they were', () => {
  it.each(legacyNames)('%s: the gate and toDocument add no name, playhead or track heights', (name) => {
    const once: ProjectDoc = toDocument(mergeProject(legacyDoc(defined(legacyFixtures()[name], name)), true).doc);
    const again = toDocument(mergeProject(JSON.parse(JSON.stringify(once)), true).doc);
    expect(again).not.toHaveProperty('name');
    expect(again).not.toHaveProperty('playhead');
    expect(again).not.toHaveProperty('trackView');
    expect(JSON.stringify(again)).toBe(JSON.stringify(once));
  });
});
