// The dashboard's tests use the specs-index mini fixture, synced in a temp copy (roadmap.md written).
import { syncRepo } from '../../specs-index/lib/sync.mjs';
import { tempMini } from '../../specs-index/test/helpers.mjs';

export { MINI, editJson, editText } from '../../specs-index/test/helpers.mjs';

export function syncedMini() {
  const dir = tempMini();
  syncRepo(dir);
  return dir;
}
