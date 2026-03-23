/**
 * Custom HTML Widget - Website Renderer
 *
 * Renders raw HTML content with DOMPurify sanitization.
 * Strips scripts, event handlers, and javascript: URLs
 * while preserving layout HTML and CSS.
 *
 * Uses isomorphic-dompurify which works in both SSR and client environments.
 */

import { useMemo } from "react";
import DOMPurify from "isomorphic-dompurify";

interface CustomHtmlWidgetConfig {
  content?: string;
}

/**
 * DOMPurify configuration: allow layout HTML and CSS,
 * strip scripts and event handlers.
 */
const PURIFY_CONFIG = {
  ALLOWED_TAGS: [
    "a", "abbr", "address", "article", "aside", "b", "bdi", "bdo",
    "blockquote", "br", "caption", "cite", "code", "col", "colgroup",
    "data", "dd", "del", "details", "dfn", "div", "dl", "dt", "em",
    "figcaption", "figure", "footer", "h1", "h2", "h3", "h4", "h5", "h6",
    "header", "hgroup", "hr", "i", "img", "ins", "kbd", "li", "main",
    "mark", "nav", "ol", "p", "picture", "pre", "q", "rp", "rt", "ruby",
    "s", "samp", "section", "small", "source", "span", "strong", "sub",
    "summary", "sup", "table", "tbody", "td", "tfoot", "th", "thead",
    "time", "tr", "u", "ul", "var", "wbr",
  ],
  ALLOWED_ATTR: [
    "href", "src", "alt", "title", "class", "id", "style", "target",
    "rel", "width", "height", "loading", "decoding", "srcset", "sizes",
    "colspan", "rowspan", "scope", "headers", "datetime", "lang", "dir",
    "role", "aria-label", "aria-hidden", "aria-describedby", "aria-labelledby",
    "data-*",
  ],
  ALLOW_DATA_ATTR: true,
};

export function CustomHtmlWidget({
  config,
}: {
  config: CustomHtmlWidgetConfig;
}) {
  const sanitized = useMemo(() => {
    if (!config.content) return "";
    return DOMPurify.sanitize(config.content, PURIFY_CONFIG);
  }, [config.content]);

  if (!sanitized) {
    return null;
  }

  return (
    <div
      className="widget-custom-html prose prose-sm max-w-none"
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}
