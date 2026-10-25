// Webpack magic constant from Electron Forge
declare const MAIN_WINDOW_WEBPACK_ENTRY: string;

// Whether a URL is the app's own page. Compared as parsed URLs, ignoring the
// hash, so an install path with spaces (percent-encoded in loaded URLs) still
// matches.
export function isAppUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const page = new URL(url);
    const app = new URL(MAIN_WINDOW_WEBPACK_ENTRY);
    page.hash = '';
    app.hash = '';
    return page.href === app.href;
  } catch {
    return false;
  }
}
