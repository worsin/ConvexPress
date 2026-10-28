/**
 * Knowledge Base System - what search reads
 *
 * `searchText` is the one field the article search index covers: the title,
 * the keywords and the body's plain text. A reader who types an article's
 * name finds it even when the body never repeats it. It is derived on every
 * write that changes any of the three.
 *
 * `matchingPassage` is the result snippet: the stretch of body text around
 * the first word of the query it contains.
 */

const MAX_SEARCH_TEXT = 900_000;

export function articleSearchText(title: string, keywords: readonly string[], plainText: string): string {
  return [title, keywords.join(" "), plainText].filter((part) => part.trim()).join("\n").slice(0, MAX_SEARCH_TEXT);
}

export function matchingPassage(plainText: string, query: string, length = 180): string | null {
  const terms = query.toLowerCase().split(/[\s,.;:!?"'()]+/).filter((term) => term.length >= 2);
  if (!terms.length) return null;
  const haystack = plainText.toLowerCase();
  let at = -1;
  for (const term of terms) {
    const index = haystack.indexOf(term);
    if (index !== -1 && (at === -1 || index < at)) at = index;
  }
  if (at === -1) return null;
  const text = plainText.replace(/\n/g, " ");
  let start = Math.max(0, at - Math.floor(length / 3));
  if (start > 0) {
    const space = text.indexOf(" ", start);
    start = space !== -1 && space < at ? space + 1 : start;
  }
  let end = Math.min(text.length, start + length);
  if (end < text.length) {
    const space = text.lastIndexOf(" ", end);
    end = space > at ? space : end;
  }
  return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
}
