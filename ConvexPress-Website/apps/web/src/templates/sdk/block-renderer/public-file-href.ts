/** Only public storage capabilities from this site's configured backend are
 * rewritten. Other media sources retain their existing provider semantics. */
export function publicStorageDownloadHref(src: string, filename: string | undefined, backendOrigin: string | null): string {
  if (!backendOrigin) return src;
  try {
    const url = new URL(src), backend = new URL(backendOrigin);
    if (!['http:', 'https:'].includes(backend.protocol) || url.origin !== backend.origin || url.username || url.password || url.search || url.hash) return src;
    const match = /^\/api\/storage\/([a-zA-Z0-9_-]{1,128})$/.exec(url.pathname);
    if (!match) return src;
    return `/api/public-files/${match[1]}?filename=${encodeURIComponent(filename || 'download')}`;
  } catch { return src; }
}
