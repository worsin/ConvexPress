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
    transformTags: {
      a: (_tagName, attrs) => ({ tagName: "a", attribs: attrs.target === "_blank" ? { ...attrs, rel: "noopener noreferrer" } : attrs }),
    },
  });
}
export default { sanitize };
