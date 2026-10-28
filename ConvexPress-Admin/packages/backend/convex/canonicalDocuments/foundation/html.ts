import sanitizeHtml from "sanitize-html";

/** One parser and policy for browser, Node SSR and edge SSR. A DOM emulator
 * cannot run in Workers; using an identical pure-JS sanitizer also keeps
 * hydrated markup identical to the server output. Never permit executable
 * tags/attributes even if a caller accidentally asks for them.
 */
export interface HtmlSanitizerOptions {
  ALLOWED_TAGS?: readonly string[];
  ALLOWED_ATTR?: readonly string[];
}
const tags = [...sanitizeHtml.defaults.allowedTags, "img", "details", "summary"];
const safeAttributes = ["href", "target", "rel", "src", "alt", "title", "class", "id", "width", "height", "colspan", "rowspan", "scope", "datetime", "role", "aria-label", "aria-hidden", "aria-describedby", "loading", "decoding"];
export function sanitize(html: string, options: HtmlSanitizerOptions = {}): string {
  const allowedTags = options.ALLOWED_TAGS ? options.ALLOWED_TAGS.filter(tag => tags.includes(tag)) : tags;
  const allowedAttributes = options.ALLOWED_ATTR ? options.ALLOWED_ATTR.filter(attr => safeAttributes.includes(attr)) : safeAttributes;
  return sanitizeHtml(html, {
    allowedTags, allowedAttributes: { "*": [...allowedAttributes] },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowProtocolRelative: false,
    disallowedTagsMode: "discard",
    enforceHtmlBoundary: true,
    parseStyleAttributes: false,
    transformTags: {
      a: (_tagName, attrs) => ({ tagName: "a", attribs: attrs.target === "_blank" ? { ...attrs, rel: "noopener noreferrer" } : attrs }),
    },
  });
}
export default { sanitize };

const blockTags = ["p", "br", "hr", "h2", "h3", "h4", "h5", "h6", "strong", "em", "s", "u", "code", "pre", "blockquote", "ul", "ol", "li", "dl", "dt", "dd", "a", "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption"] as const;
export function sanitizeBlockHtml(html: string): string {
 return sanitize(html, { ALLOWED_TAGS: blockTags, ALLOWED_ATTR: ["href", "title", "target", "rel", "colspan", "rowspan", "scope"] });
}
/** Parse and sanitize first. Only then remove known-safe markup and decode the
 * sanitizer's text escapes once. Inline runs join; block boundaries separate. */
export function blockHtmlText(html: string): string {
 return sanitizeBlockHtml(html)
  .replace(/<\/?(?:p|br|hr|h[2-6]|pre|blockquote|ul|ol|li|dl|dt|dd|table|thead|tbody|tfoot|tr|th|td|caption)(?:\s[^>]*)?\s*\/?>/giu, " ")
  .replace(/<[^>]*>/gu, "")
  .replace(/&(amp|lt|gt);/gu, (_, name: string) => ({amp:"&",lt:"<",gt:">"})[name]!)
  .replace(/\s+/gu," ").trim();
}

/** Exactly what the knowledge-base renderer (backend kb/content/render.ts)
 * emits. The server already escapes every value; this is the second gate, so a
 * rendering bug or a tampered response still can't introduce script, styles,
 * event handlers or foreign classes. */
const kbTags = ["p", "h2", "h3", "h4", "ul", "ol", "li", "blockquote", "aside", "figure", "img", "video", "figcaption", "pre", "code", "hr", "div", "table", "thead", "tbody", "tr", "th", "td", "details", "summary", "strong", "em", "u", "s", "kbd", "span", "a", "br"];
export function sanitizeKbArticleHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: kbTags,
    allowedAttributes: {
      a: ["href", "rel", "target", "data-kb-article", "data-kb-anchor"],
      img: ["src", "alt", "width", "height", "loading", "decoding"],
      video: ["src", "controls", "preload", "playsinline", "width", "height", "aria-label"],
      ol: ["start", "class"], h2: ["id"], h3: ["id"], h4: ["id"],
      th: ["colspan", "rowspan", "scope"], td: ["colspan", "rowspan"],
      details: ["open", "class"], aside: ["class", "role"], figure: ["class"], div: ["class"], span: ["class"], kbd: ["class"], p: ["class"], pre: ["class"], code: ["class"],
    },
    allowedClasses: { "*": ["kb-*", "language-*"] },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: { img: ["http", "https"], video: ["http", "https"] },
    allowProtocolRelative: false,
    disallowedTagsMode: "discard",
    enforceHtmlBoundary: true,
    parseStyleAttributes: false,
    transformTags: {
      a: (_tagName, attrs) => ({ tagName: "a", attribs: attrs.target === "_blank" ? { ...attrs, rel: "noopener noreferrer" } : attrs }),
    },
  });
}
