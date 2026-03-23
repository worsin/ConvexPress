/**
 * Rich Text Widget - Website Renderer
 *
 * Displays formatted text content. Renders HTML safely using DOMPurify.
 * Uses isomorphic-dompurify which works in both SSR and client environments.
 */

import { useMemo } from "react";
import DOMPurify from "isomorphic-dompurify";

interface RichTextWidgetConfig {
  content?: string;
}

/**
 * Escape HTML entities in plain text to prevent injection
 * when wrapping text in <p> tags.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function RichTextWidget({
  config,
}: {
  config: RichTextWidgetConfig;
}) {
  const content = useMemo(() => {
    if (!config.content) return "";
    // If content looks like HTML, sanitize it with DOMPurify
    if (config.content.includes("<")) {
      return DOMPurify.sanitize(config.content);
    }
    // Plain text - escape HTML entities first, then wrap in paragraphs
    return config.content
      .split("\n\n")
      .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br />")}</p>`)
      .join("");
  }, [config.content]);

  if (!content) {
    return null;
  }

  return (
    <div
      className="prose prose-sm max-w-none"
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
}
