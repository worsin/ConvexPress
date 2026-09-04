/** Core · gallery.album — a single album (grid / masonry + lightbox via GalleryAlbumPage). */
import { GalleryAlbumPage } from "@/components/gallery/GalleryAlbumPage";
import type { SurfaceProps } from "@/templates/sdk/types";

/** Album record from `gallery.queries.getBySlug` (items, cover, categories, layout settings). */
export type GalleryAlbum = { _id: string; slug: string; title: string } & Record<string, any>;

export interface GalleryAlbumSurfaceData {
  album: GalleryAlbum;
}

export default function CoreGalleryAlbum({ data }: SurfaceProps<GalleryAlbumSurfaceData>) {
  return <GalleryAlbumPage album={data.album} />;
}
