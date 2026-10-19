import { desktop } from '../platform/desktop';
import { desktopMedia } from './mediaDesktop';
import type { MediaStore } from './mediaStore';
import { webMedia } from './mediaWeb';

/*
 * The device's media store, chosen once (408 §4, as lib/projectLibrary.ts chooses the project library): the user's
 * files referenced where they are in the desktop app, copies in the browser's private file system elsewhere.
 */

/** Where this device keeps saved projects' media. */
export const media: MediaStore = desktop?.media ? desktopMedia(desktop.media) : webMedia();
