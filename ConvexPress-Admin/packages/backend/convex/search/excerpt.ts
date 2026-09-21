/** Plain text for React-rendered search cards. Input has already been projected
 * for the visitor; this window is presentation only, never a match/access gate. */
export function plainSearchExcerpt(content: string, query: string): string {
  const text = content.replace(/\s+/gu, " ").trim(), limit = 240;
  if (text.length <= limit) return text;
  const requested = query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const lower = text.toLowerCase();
  const matches = requested.map(term => lower.indexOf(term)).filter(index => index >= 0);
  const match = matches.length ? Math.min(...matches) : 0;
  let start = Math.max(0, match - 60);
  // Begin on a word boundary when it still leaves the matched word in view.
  const nextSpace = text.indexOf(" ", start);
  if (start > 0 && nextSpace >= start && nextSpace < match) start = nextSpace + 1;
  if (/[\uDC00-\uDFFF]/u.test(text[start])) start++;
  let end = Math.min(text.length, start + limit);
  const lastSpace = text.lastIndexOf(" ", end);
  if (end < text.length && lastSpace > start + limit / 2) end = lastSpace;
  // A single unusually long token must still fit without splitting a surrogate.
  if (end < text.length && /[\uD800-\uDBFF]/u.test(text[end - 1])) end--;
  const excerpt = text.slice(start, end).trim();
  return `${start ? "…" : ""}${excerpt}${end < text.length ? "…" : ""}`;
}
