/* Light/dark choice: stamped on <html data-theme> and remembered; no choice means follow the system. */
export const isDark = () =>
  document.documentElement.dataset.theme
    ? document.documentElement.dataset.theme === 'dark'
    : matchMedia('(prefers-color-scheme: dark)').matches;

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
