/**
 * Depot · gallery.album — a single album: breadcrumb, page header with the
 * category chips and image count, the description in a card, then the same
 * grid / masonry + lightbox as Core (`GalleryEmbed`).
 */
import { Link } from "@tanstack/react-router";

import { GalleryEmbed } from "@/components/gallery/GalleryEmbed";
import type { GalleryAlbumSurfaceData } from "@/templates/packs/core/surfaces/gallery.album";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Breadcrumbs, Card, Container, Label } from "../parts";
import { frameReset } from "../parts/extra-plugins";

export default function DepotGalleryAlbum({ data }: SurfaceProps<GalleryAlbumSurfaceData>) {
  const { album } = data;
  const categories: Array<{ _id: string; name: string; slug: string }> = album.categories ?? [];
  const count = Array.isArray(album.items) ? album.items.length : (album.itemCount ?? null);

  return (
    <Container padded={false} data-slot="gallery-album" data-pack="depot" className={`flex flex-col gap-4 py-6 md:py-8 ${frameReset}`}>
      <Breadcrumbs items={[{ label: "Gallery", to: "/gallery" }, { label: album.title }]} />

      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
        <div className="flex min-w-0 flex-col gap-1">
          <Label>Gallery</Label>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground md:text-3xl">{album.title}</h1>
          {album.excerpt ? <p className="max-w-3xl text-[13px] leading-5 text-muted-foreground">{album.excerpt}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {categories.map((category) => (
            <Link key={category._id} to="/gallery/category/$slug" params={{ slug: category.slug }} className="inline-flex h-8 items-center rounded-md border border-border bg-background px-2.5 text-[13px] text-foreground transition-colors hover:bg-muted">
              {category.name}
            </Link>
          ))}
          {typeof count === "number" ? <Label className="tabular-nums">{count} images</Label> : null}
        </div>
      </div>

      {album.description ? (
        <Card className="p-4">
          <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">{album.description}</p>
        </Card>
      ) : null}

      <GalleryEmbed album={album as any} />
    </Container>
  );
}
