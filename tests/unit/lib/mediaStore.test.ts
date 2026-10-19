import { describe, expect, it } from 'vitest';
import { noRoomMessage, sizeText } from '@/lib/mediaStore';
import { mediaContract } from '../../support/mediaContract';
import { memoryMedia } from '../../support/memoryMedia';

/* 408 T040: the media store contract on the in-memory stand-in, as the browser keeps media and as the desktop app does. */

mediaContract('in memory, copies (as the browser)', (room) => memoryMedia('copies', room).underTest);
mediaContract('in memory, references (as the desktop app)', (room) => memoryMedia('references', room).underTest);

describe('sizes for people', () => {
  it('in bytes, KB, MB, GB', () => {
    expect([0, 999, 12_345, 300_000, 1_200_000_000, 15_000_000_000].map(sizeText)).toEqual(['0 bytes', '999 bytes', '12 KB', '300 KB', '1.2 GB', '15 GB']);
    expect(noRoomMessage('a.mp4', 2_500_000, 900_000)).toBe('There isn’t room for “a.mp4”: it needs 2.5 MB, and 900 KB is left on this device.');
  });
});
