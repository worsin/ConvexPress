/**
 * Depot · gallery.index — published albums as a dense card grid: square
 * cover, category label, title, image count. Empty state as in Core.
 */
import { Link } from "@tanstack/react-router";
import { Images } from "lucide-react";

import { MediaImage } from "@/components/media/MediaImage";
import type { GalleryAlbumCard, GalleryIndexSurfaceData } from "@/templates/packs/core/surfaces/gallery.index";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Card, Container, EmptyState, Label } from "../parts";
import { PluginPageHeader } from "../parts/extra-plugins";

export default function DepotGalleryIndex({ data }: SurfaceProps<GalleryIndexSurfaceData>) {
  const { albums } = data;

  return (
    <Container padded={false} data-slot="gallery-index" data-pack="depot" className="flex flex-col gap-4 py-6 md:py-8">
      <PluginPageHeader eyebrow="Gallery" title="Albums" description="Media-library-backed albums as responsive grids with full-screen viewing." aside={albums.length > 0 ? <Label className="tabular-nums">{albums.length} {albums.length === 1 ? "album" : "albums"}</Label> : undefined} />

      {albums.length === 0 ? (
        <EmptyState title="No galleries are published yet." />
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {albums.map((album) => (
            <AlbumTile key={album._id} album={album} />
          ))}
        </div>
      )}
    </Container>
  );
}

function AlbumTile({ album }: { album: GalleryAlbumCard }) {
  return (
    <Card as="article" className="flex flex-col overflow-hidden">
      <Link to="/gallery/$slug" params={{ slug: album.slug }} className="block aspect-square bg-muted/40">
        {album.coverMedia?._id ? (
          <MediaImage mediaId={album.coverMedia._id as any} alt={album.title} className="h-full w-full object-cover" sizes="(max-width: 768px) 50vw, (max-width: 1280px) 33vw, 20vw" />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Images className="size-8" aria-hidden="true" />
          </div>
        )}
      </Link>
      <div className="flex flex-1 flex-col gap-1 p-3">
        {album.categories && album.categories.length > 0 ? <Label>{album.categories[0]!.name}</Label> : <Label>Album</Label>}
        <Link to="/gallery/$slug" params={{ slug: album.slug }} className="line-clamp-2 text-sm font-semibold leading-5 text-foreground hover:text-primary">
          {album.title}
        </Link>
        {album.excerpt ? <p className="line-clamp-1 text-[13px] text-muted-foreground">{album.excerpt}</p> : null}
        <span className="mt-auto pt-1 text-[11px] uppercase tracking-wide tabular-nums text-muted-foreground">{album.itemCount} images</span>
      </div>
    </Card>
  );
}
