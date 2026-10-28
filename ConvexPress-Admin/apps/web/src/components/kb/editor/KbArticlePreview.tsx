/**
 * The article exactly as readers will see it: the editor's document goes
 * through the backend's own normalizer and renderer (kb/content), so the
 * preview can't drift from the published page.
 */
import { useMemo } from "react";
import { useQuery } from "convex-helpers/react/cache";

import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { kbMediaIds } from "@backend/convex/kb/content/derive";
import { normalizeKbDoc } from "@backend/convex/kb/content/normalize";
import { renderKbDoc } from "@backend/convex/kb/content/render";

export function KbArticlePreview({ doc }: { doc: unknown }) {
  const normalized = useMemo(() => {
    try {
      return normalizeKbDoc(doc);
    } catch {
      return null;
    }
  }, [doc]);
  const mediaIds = useMemo(() => (normalized ? kbMediaIds(normalized).slice(0, 100) : []), [normalized]);
  const media = useQuery(api.media.queries.getByIds, mediaIds.length ? { mediaIds: mediaIds as Id<"media">[] } : "skip");
  const html = useMemo(() => {
    if (!normalized) return "";
    const byId = new Map((media ?? []).flatMap((item) => (item ? [[item._id as string, item] as const] : [])));
    return renderKbDoc(normalized, {
      media: (id) => {
        const item = byId.get(id);
        if (!item || (item.status !== "active" && item.status !== "processing")) return null;
        return { url: item.url, mimeType: item.mimeType, width: item.width, height: item.height, altText: item.altText };
      },
      articleHref: (id, anchor) => `/kb/${id}/edit${anchor ? `#${anchor}` : ""}`,
    });
  }, [normalized, media]);
  if (normalized === null) return <p className="text-sm text-destructive">This document can't be previewed. Undo your last change and try again.</p>;
  if (!html) return <p className="text-sm italic text-foreground/50">Nothing to preview yet.</p>;
  // The renderer escapes every value and emits a fixed tag set (backend kb/content/render.ts).
  return <div className="kb-doc" dangerouslySetInnerHTML={{ __html: html }} />;
}
