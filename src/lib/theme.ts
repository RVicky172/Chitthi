/* Light/dark choice: stamped on <html data-theme> and remembered; no choice means follow the system. */

/**
 * Whether the app shows dark.
 * @returns the user's choice, else the system's
 */
export const isDark = (): boolean =>
  document.documentElement.dataset.theme
    ? document.documentElement.dataset.theme === 'dark'
    : matchMedia('(prefers-color-scheme: dark)').matches;

/** Switches between light and dark, remembers the choice and tells the app (event chitthi:theme). */
export function toggleTheme(): void {
  const theme = isDark() ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem('chitthi-theme', theme);
  } catch {
    /* storage blocked */
  }
  window.dispatchEvent(new Event('chitthi:theme'));
}
