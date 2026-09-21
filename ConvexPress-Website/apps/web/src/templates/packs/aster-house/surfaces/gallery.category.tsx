/**
 * Aster · gallery.category — albums filed under one category: breadcrumbs,
 * display heading with the description as lede, and the albums as a 3:2 grid
 * with hairline gaps.
 */
import type { GalleryCategorySurfaceData } from "@/templates/packs/core/surfaces/gallery.category";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Breadcrumbs, Container, EmptyState, LinkButton, SectionHeading, SmallCaps } from "../parts";
import { AlbumTile, HairlineGrid } from "../parts/extra-plugins";

export default function AsterGalleryCategory({ data }: SurfaceProps<GalleryCategorySurfaceData>) {
  const { category, albums } = data;
  const name = category?.name ?? "Gallery category";

  return (
    <Container data-slot="gallery-category" className="flex flex-col gap-10 py-6 md:gap-14 md:py-10">
      <Breadcrumbs items={[{ label: "Gallery", to: "/gallery" }, { label: name }]} />
      <SectionHeading
        level={1}
        eyebrow="Gallery category"
        title={name}
        lede={category?.description ?? undefined}
        action={albums.length > 0 ? <SmallCaps className="tabular-nums">{albums.length === 1 ? "1 album" : `${albums.length} albums`}</SmallCaps> : undefined}
      />

      {albums.length === 0 ? (
        <EmptyState
          eyebrow="Nothing yet"
          title="No albums in this category yet."
          action={
            <LinkButton to="/gallery" variant="ghost">
              All albums
            </LinkButton>
          }
        />
      ) : (
        <HairlineGrid columns={3}>
          {albums.map((album) => (
            <AlbumTile key={album._id} album={album} />
          ))}
        </HairlineGrid>
      )}
    </Container>
  );
}
