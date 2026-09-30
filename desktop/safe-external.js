/**
 * Guards for the desktop shell (SECURITY_AUDIT.md H4).
 *
 * shell.openExternal hands a URL to the OS, and the OS runs whatever handler
 * the scheme maps to. On Windows some of those (ms-msdt:, search-ms:, file:
 * shares, …) have been turned into code execution, so a link or window.open
 * from the page must only ever reach the browser or mail client.
 */
const EXTERNAL_SCHEMES = new Set(["https:", "http:", "mailto:"]);

/** Whether `url` may be passed to shell.openExternal. */
function isSafeExternalUrl(url) {
  try {
    return EXTERNAL_SCHEMES.has(new URL(url).protocol);
  } catch {
    return false;
  }
}

/** Opens `url` in the default app if its scheme is allowed; otherwise does nothing. */
function openExternalSafely(shell, url) {
  if (!isSafeExternalUrl(url)) {
    console.warn("Blocked opening an external URL with a disallowed scheme");
    return false;
  }
  shell.openExternal(url);
  return true;
}

/** Whether `url` is on the site the app wraps (same scheme, host and port). */
function isSiteOrigin(url, siteUrl) {
  try {
    return new URL(url).origin === new URL(siteUrl).origin;
  } catch {
    return false;
  }
}

module.exports = { isSafeExternalUrl, openExternalSafely, isSiteOrigin };
