import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import type { Id } from "@convexpress-website/backend/generated/dataModel";

import type { AlbumShortcodeAttrs } from "@/lib/gallery/shortcodes";
import { GalleryEmbed } from "./GalleryEmbed";

interface GalleryShortcodeEmbedProps {
  attrs: AlbumShortcodeAttrs;
}

export function GalleryShortcodeEmbed({ attrs }: GalleryShortcodeEmbedProps) {
  const album = useQuery(api.gallery.queries.getEmbed, {
    albumId: attrs.id as Id<"gallery_albums"> | undefined,
    slug: attrs.slug,
    limit: attrs.limit,
    layoutPreset: attrs.layout,
    columns: attrs.columns,
    showTitle: attrs.showTitle,
    showDescription: attrs.showDescription,
  });

  if (album === undefined) {
    return <div className="h-48 animate-pulse rounded-[1.5rem] bg-muted/50" />;
  }

  if (!album) {
    return null;
  }

  return <GalleryEmbed album={album as any} className="my-3" />;
}
