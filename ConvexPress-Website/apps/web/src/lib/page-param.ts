/** A listing's page number from the URL. It is present only past the first
 * page: a route whose validated search always held `page: 1` made the router
 * redirect `/blog` to `/blog?page=1`, so page one never had the clean URL its
 * pagination links and canonical tag use. */
export function pageParam(value: unknown): { page?: number } {
  const page = Math.floor(Number(value));
  return Number.isFinite(page) && page > 1 ? { page } : {};
}
