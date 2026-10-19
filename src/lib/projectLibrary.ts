import { desktop } from '../platform/desktop';
import type { ProjectLibrary } from './projects';
import { desktopProjects } from './projectsDesktop';
import { webProjects } from './projectsWeb';

/*
 * The device's project library, chosen once (408 §3, as lib/db.ts does for the print gallery): files in the data
 * folder in the desktop app, the browser's own database elsewhere.
 */

/** Where this device keeps saved projects. */
export const projects: ProjectLibrary = desktop?.projects ? desktopProjects(desktop.projects) : webProjects();
