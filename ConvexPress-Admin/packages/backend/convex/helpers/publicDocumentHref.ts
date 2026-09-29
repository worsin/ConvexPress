/** Stored page paths do not include the Website's /page route prefix. These
 * functions construct destinations only; callers still enforce current access. */
export interface PublicDocumentAddress { type: 'page' | 'post'; slug: string; path?: string }
export function publicDocumentHref(document: PublicDocumentAddress): string {
  if (document.type === 'post') return `/blog/${encodeURIComponent(document.slug)}`;
  const path = document.path && /^\/(?!\/)/.test(document.path) && !/[\\\u0000-\u0020]/.test(document.path)
    ? document.path : `/${encodeURIComponent(document.slug)}`;
  return `/page${path}`;
}
/** Preserve the existing menu adapter's historic explicit homepage and already
 * served paths. Ordinary stored paths use the same canonical destination. */
export function publicMenuDocumentHref(document: PublicDocumentAddress): string {
  if (document.type === 'post') return publicDocumentHref(document);
  const path = document.path ? (document.path.startsWith('/') ? document.path : `/${document.path}`) : undefined;
  if (path === '/' || path?.startsWith('/page/')) return path;
  return publicDocumentHref({...document,path});
}
