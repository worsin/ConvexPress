/**
 * The body of a knowledge-base article.
 *
 * The backend renders every article document to HTML with one renderer
 * (kb/content/render.ts) and returns it as `html`; packs never parse article
 * documents themselves. This component sanitizes that HTML once more and
 * styles it through the shared `.kb-doc` rules (kb-doc.css, imported by index.css), which follow the
 * site's theme tokens. Packs add their own typography with `className`.
 */
import { useMemo } from "react";

import { cn } from "@/lib/utils";
import { sanitizeKbArticleHtml } from "@/templates/sdk/block-data/portable/html";

export function KbArticleBody({ html, className }: { html: string | undefined; className?: string }) {
  const safe = useMemo(() => (html ? sanitizeKbArticleHtml(html) : ""), [html]);
  if (!safe) return <p className="text-muted-foreground italic">This article has no content yet.</p>;
  // eslint-disable-next-line react/no-danger -- sanitized above; the server renderer escapes every value
  return <div className={cn("kb-doc", className)} dangerouslySetInnerHTML={{ __html: safe }} />;
}
