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
