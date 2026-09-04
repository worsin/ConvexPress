/**
 * Journal · gallery.album — one album: breadcrumbs, display title with the
 * excerpt as lede and categories as small-caps links, the description in the
 * reading measure, then the images as a 3:2 grid with hairline gaps (or the
 * album's masonry preset with hairline column gaps) opening the shared
 * GalleryLightbox. Honours the same album settings as Core's GalleryEmbed:
 * layout preset, column count, captions, lightbox and download toggles.
 */
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { GalleryLightbox } from "@/components/gallery/GalleryLightbox";
import { MediaImage } from "@/components/media/MediaImage";
import type { GalleryAlbumSurfaceData } from "@/templates/packs/core/surfaces/gallery.album";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Breadcrumbs, Container, EmptyState, Prose, SectionHeading, SmallCaps } from "../parts";
import { HairlineGrid } from "../parts/extra-plugins";

interface GalleryItem {
  _id: string;
  mediaId: string;
  caption?: string;
  altText?: string;
  media: { _id: string; title?: string; url: string };
}

export default function JournalGalleryAlbum({ data }: SurfaceProps<GalleryAlbumSurfaceData>) {
  const { album } = data;
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const items: GalleryItem[] = Array.isArray(album.items) ? album.items : [];
  const categories: Array<{ _id: string; name: string; slug: string }> = Array.isArray(album.categories) ? album.categories : [];
  const layout: "grid" | "masonry" = album.embedSettings?.layoutPreset ?? album.layoutPreset ?? "grid";
  const columns = Math.max(1, Math.min(6, Number(album.embedSettings?.columns ?? album.columnsDesktop ?? 3) || 3));
  const captions = album.captionsEnabled === true;
  const lightbox = album.lightboxEnabled !== false;

  function openAt(index: number) {
    if (!lightbox) return;
    setActiveIndex(index);
    setOpen(true);
  }

  const tileClass = "group block w-full bg-background text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

  return (
    <Container data-slot="gallery-album" className="flex flex-col gap-10 py-6 md:gap-14 md:py-10">
      <Breadcrumbs items={[{ label: "Gallery", to: "/gallery" }, { label: album.title }]} />

      <SectionHeading
        level={1}
        eyebrow="Album"
        title={album.title}
        lede={album.excerpt ?? undefined}
        action={items.length > 0 ? <SmallCaps className="tabular-nums">{items.length === 1 ? "1 image" : `${items.length} images`}</SmallCaps> : undefined}
      />

      {categories.length > 0 ? (
        <ul className="flex flex-wrap items-center gap-x-6 gap-y-2" aria-label="Categories">
          {categories.map((category) => (
            <li key={category._id}>
              <Link to="/gallery/category/$slug" params={{ slug: category.slug }} className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary hover:underline">
                {category.name}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      {album.description ? (
        <Prose className="mx-0">
          <p className="whitespace-pre-wrap text-base leading-8 text-muted-foreground md:text-[17px]">{album.description}</p>
        </Prose>
      ) : null}

      {items.length === 0 ? (
        <EmptyState eyebrow="Empty album" title="No images in this album yet." />
      ) : layout === "masonry" ? (
        <div className="overflow-hidden rounded-2xl border border-border bg-border" style={{ columnCount: columns, columnGap: "1px" }}>
          {items.map((item, index) => (
            <button key={item._id} type="button" onClick={() => openAt(index)} className={`${tileClass} mb-px break-inside-avoid`} disabled={!lightbox} aria-label={item.altText ?? item.media.title ?? `Image ${index + 1}`}>
              <MediaImage mediaId={item.mediaId as never} alt={item.altText ?? item.media.title ?? ""} preferredSize="medium_large" className="h-auto w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]" sizes="(max-width: 768px) 100vw, 33vw" />
              {captions && item.caption ? <span className="block px-4 py-3 text-xs leading-6 text-muted-foreground">{item.caption}</span> : null}
            </button>
          ))}
        </div>
      ) : (
        <HairlineGrid columns={columns}>
          {items.map((item, index) => (
            <button key={item._id} type="button" onClick={() => openAt(index)} className={tileClass} disabled={!lightbox} aria-label={item.altText ?? item.media.title ?? `Image ${index + 1}`}>
              <span className="block overflow-hidden bg-muted">
                <MediaImage mediaId={item.mediaId as never} alt={item.altText ?? item.media.title ?? ""} preferredSize="medium_large" className="aspect-[3/2] w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]" sizes="(max-width: 768px) 100vw, 33vw" />
              </span>
              {captions && item.caption ? <span className="block px-4 py-3 text-xs leading-6 text-muted-foreground">{item.caption}</span> : null}
            </button>
          ))}
        </HairlineGrid>
      )}

      {lightbox && items.length > 0 ? <GalleryLightbox open={open} onOpenChange={setOpen} items={items} currentIndex={activeIndex} onIndexChange={setActiveIndex} downloadEnabled={album.downloadEnabled} /> : null}
    </Container>
  );
}
