/**
 * Depot · gallery.category — albums filed under one category as a dense card
 * grid with a breadcrumb and page header.
 */
import { Link } from "@tanstack/react-router";
import { Images } from "lucide-react";

import { MediaImage } from "@/components/media/MediaImage";
import type { GalleryCategorySurfaceData } from "@/templates/packs/core/surfaces/gallery.category";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Breadcrumbs, Card, Container, EmptyState, Label } from "../parts";
import { PluginPageHeader } from "../parts/extra-plugins";

export default function DepotGalleryCategory({ data }: SurfaceProps<GalleryCategorySurfaceData>) {
  const { category, albums } = data;
  const name = category?.name ?? "Gallery Category";

  return (
    <Container padded={false} data-slot="gallery-category" data-pack="depot" className="flex flex-col gap-4 py-6 md:py-8">
      <Breadcrumbs items={[{ label: "Gallery", to: "/gallery" }, { label: name }]} />
      <PluginPageHeader eyebrow="Gallery category" title={name} description={category?.description} aside={<Label className="tabular-nums">{albums.length} {albums.length === 1 ? "album" : "albums"}</Label>} />

      {albums.length === 0 ? (
        <EmptyState title="No albums in this category yet." />
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {albums.map((album) => (
            <Card key={album._id} as="article" className="flex flex-col overflow-hidden">
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
                <Label>{name}</Label>
                <Link to="/gallery/$slug" params={{ slug: album.slug }} className="line-clamp-2 text-sm font-semibold leading-5 text-foreground hover:text-primary">
                  {album.title}
                </Link>
                {album.excerpt ? <p className="line-clamp-2 text-[13px] leading-5 text-muted-foreground">{album.excerpt}</p> : null}
              </div>
            </Card>
          ))}
        </div>
      )}
    </Container>
  );
}
