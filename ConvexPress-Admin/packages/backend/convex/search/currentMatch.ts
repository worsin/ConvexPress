/** Search indexes choose candidates, never authorize an association with old or
 * restricted text. Recheck the query against current, visitor-visible fields.
 * Convex uses lowercase alphanumeric terms (up to32 characters), OR matching,
 * and prefix matching on the last term. Keep field metadata and excerpts out
 * unless they are an actual indexed field for this search surface.
 * https://docs.convex.dev/search/text-search
 */
function terms(value: string): string[] {
  return (value.match(/[\p{L}\p{N}]+/gu) ?? [])
    .filter(term => Array.from(term).length <= 32)
    .map(term => term.toLowerCase());
}

export function matchesCurrentSearchText(query: string, ...visibleFields: string[]): boolean {
  const requested = terms(query);
  if (!requested.length) return false;
  const exact = new Set(requested.slice(0, -1));
  const prefix = requested[requested.length - 1];
  return visibleFields.some(field => terms(field).some(term => exact.has(term) || term.startsWith(prefix)));
}
