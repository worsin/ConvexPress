/**
 * Aster · gallery.index — published albums as a 3:2 grid with hairline
 * gaps beneath a display heading; each tile carries small-caps categories,
 * the title in display type and the image count.
 */
import type { GalleryIndexSurfaceData } from "@/templates/packs/core/surfaces/gallery.index";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Container, EmptyState, LinkButton, SectionHeading, SmallCaps } from "../parts";
import { AlbumTile, HairlineGrid } from "../parts/extra-plugins";

export default function AsterGalleryIndex({ data }: SurfaceProps<GalleryIndexSurfaceData>) {
  const { albums } = data;

  return (
    <Container data-slot="gallery-index" className="flex flex-col gap-10 py-6 md:gap-14 md:py-10">
      <SectionHeading
        level={1}
        eyebrow="Gallery"
        title="Albums"
        lede="Published image galleries with albums, archives, and full-screen viewing."
        action={albums.length > 0 ? <SmallCaps className="tabular-nums">{albums.length === 1 ? "1 album" : `${albums.length} albums`}</SmallCaps> : undefined}
      />

      {albums.length === 0 ? (
        <EmptyState
          eyebrow="Nothing yet"
          title="No galleries are published yet."
          action={
            <LinkButton to="/" variant="ghost">
              Back to the front page
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
