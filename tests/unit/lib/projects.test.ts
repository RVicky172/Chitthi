import { describe, expect, it } from 'vitest';
import { memoryProjects } from '../../support/memoryProjects';
import { entry, libraryContract, videoDoc } from '../../support/projectsContract';

/* 408 T030, T031: the project library contract on the in-memory library, and its quota. */

libraryContract('in memory', () => {
  const memory = memoryProjects();
  return { library: memory, breakWrites: () => memory.faults.breakWrites(), spoil: (id) => memory.faults.spoil(id) };
});

describe('the in-memory library’s quota (for the autosave tests)', () => {
  it('a write that doesn’t fit is refused as storage full, and the last save stays', async () => {
    const memory = memoryProjects({ quota: 400 });
    await memory.write('p1', videoDoc('Hills'), entry('p1'));
    const big = { ...videoDoc('Hills'), name: 'x'.repeat(500) };
    await expect(memory.write('p1', big, entry('p1'))).rejects.toMatchObject({ name: 'QuotaExceededError' });
    expect(await memory.read('p1')).toMatchObject({ name: 'Hills' });
    expect(await memory.usage()).toMatchObject({ allowed: 400, persisted: null });
  });
});
