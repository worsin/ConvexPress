import { useState } from "react";
import { Link } from "@tanstack/react-router";

import { MediaImage } from "@/components/media/MediaImage";
import { cn } from "@/lib/utils";
import { GalleryLightbox } from "./GalleryLightbox";

interface GalleryItem {
  _id: string;
  mediaId: string;
  caption?: string;
  altText?: string;
  media: {
    _id: string;
    title?: string;
    url: string;
  };
}

interface GalleryEmbedProps {
  album: {
    _id: string;
    title: string;
    slug: string;
    excerpt?: string;
    layoutPreset?: "grid" | "masonry";
    columnsDesktop?: number;
    lightboxEnabled?: boolean;
    captionsEnabled?: boolean;
    downloadEnabled?: boolean;
    items: GalleryItem[];
    embedSettings?: {
      layoutPreset?: "grid" | "masonry";
      columns?: number;
      showTitle?: boolean;
      showDescription?: boolean;
    };
  };
  className?: string;
}

export function GalleryEmbed({ album, className }: GalleryEmbedProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const layout = album.embedSettings?.layoutPreset ?? album.layoutPreset ?? "grid";
  const columns = Math.max(
    1,
    Math.min(6, album.embedSettings?.columns ?? album.columnsDesktop ?? 3),
  );
  const showTitle = album.embedSettings?.showTitle ?? true;
  const showDescription = album.embedSettings?.showDescription ?? true;

  return (
    <section className={cn("flex flex-col gap-5", className)}>
      {(showTitle || (showDescription && album.excerpt)) && (
        <div className="flex flex-col gap-2">
          {showTitle && (
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                {album.title}
              </h2>
              <Link
                to="/gallery/$slug"
                params={{ slug: album.slug }}
                className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground"
              >
                Open album
              </Link>
            </div>
          )}
          {showDescription && album.excerpt && (
            <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
              {album.excerpt}
            </p>
          )}
        </div>
      )}

      {layout === "masonry" ? (
        <div
          className="gap-4"
          style={{
            columnCount: columns,
            columnGap: "1rem",
          }}
        >
          {album.items.map((item, index) => (
            <button
              key={item._id}
              type="button"
              onClick={() => {
                setActiveIndex(index);
                setOpen(true);
              }}
              className="mb-4 block w-full break-inside-avoid overflow-hidden rounded-[1.5rem] border border-border/60 bg-card text-left shadow-sm transition-transform duration-200 hover:-translate-y-0.5"
            >
              <MediaImage
                mediaId={item.mediaId as never}
                alt={item.altText ?? item.media.title ?? ""}
                preferredSize="medium_large"
                className="h-auto w-full object-cover"
                sizes="(max-width: 768px) 100vw, 33vw"
              />
              {album.captionsEnabled && item.caption && (
                <div className="p-3 text-xs leading-6 text-muted-foreground">
                  {item.caption}
                </div>
              )}
            </button>
          ))}
        </div>
      ) : (
        <div
          className="grid gap-4"
          style={{
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          }}
        >
          {album.items.map((item, index) => (
            <button
              key={item._id}
              type="button"
              onClick={() => {
                setActiveIndex(index);
                setOpen(true);
              }}
              className="group overflow-hidden rounded-[1.5rem] border border-border/60 bg-card text-left shadow-sm transition-transform duration-200 hover:-translate-y-0.5"
            >
              <MediaImage
                mediaId={item.mediaId as never}
                alt={item.altText ?? item.media.title ?? ""}
                preferredSize="medium_large"
                className="aspect-[4/3] w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                sizes="(max-width: 768px) 100vw, 33vw"
              />
              {album.captionsEnabled && item.caption && (
                <div className="p-3 text-xs leading-6 text-muted-foreground">
                  {item.caption}
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {album.lightboxEnabled !== false && (
        <GalleryLightbox
          open={open}
          onOpenChange={setOpen}
          items={album.items}
          currentIndex={activeIndex}
          onIndexChange={setActiveIndex}
          downloadEnabled={album.downloadEnabled}
        />
      )}
    </section>
  );
}
