/** Core · gallery.index — published albums as a card grid. */
import { Link } from "@tanstack/react-router";

import { MediaImage } from "@/components/media/MediaImage";
import type { SurfaceProps } from "@/templates/sdk/types";

export type GalleryAlbumCard = {
  _id: string;
  slug: string;
  title: string;
  excerpt?: string | null;
  itemCount: number;
  coverMedia?: { _id: string } | null;
  categories?: Array<{ _id: string; name: string }>;
};

export interface GalleryIndexSurfaceData {
  albums: GalleryAlbumCard[];
}

export default function CoreGalleryIndex({ data }: SurfaceProps<GalleryIndexSurfaceData>) {
  const { albums } = data;

  return (
    <div className="flex flex-col gap-10">
      <section className="grid gap-8 rounded-[2rem] border border-border/60 bg-card p-8 shadow-sm">
        <div className="flex flex-col gap-3">
          <span className="text-xs font-semibold uppercase tracking-[0.25em] text-primary">
            Gallery
          </span>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
            Published image galleries with albums, archives, and lightbox presentation.
          </h1>
          <p className="max-w-2xl text-base leading-7 text-muted-foreground">
            Explore media-library-backed albums rendered as responsive grids or
            masonry layouts with full-screen image viewing.
          </p>
        </div>
      </section>

      {albums.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border p-10 text-center">
          <p className="text-sm text-muted-foreground">
            No galleries are published yet.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {albums.map((album) => (
            <article
              key={album._id}
              className="group overflow-hidden rounded-[2rem] border border-border bg-card shadow-sm transition-transform duration-200 hover:-translate-y-0.5"
            >
              <Link to="/gallery/$slug" params={{ slug: album.slug }} className="block">
                <div className="aspect-[4/3] bg-muted/40">
                  {album.coverMedia?._id ? (
                    <MediaImage
                      mediaId={album.coverMedia._id as any}
                      alt={album.title}
                      className="h-full w-full object-cover"
                      sizes="(max-width: 768px) 100vw, 33vw"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-muted text-sm text-muted-foreground">
                      Gallery
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-4 p-5">
                  <div className="flex flex-wrap gap-2">
                    {(album.categories ?? []).map((category) => (
                      <span
                        key={category._id}
                        className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
                      >
                        {category.name}
                      </span>
                    ))}
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-foreground">
                      {album.title}
                    </h2>
                    {album.excerpt && (
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        {album.excerpt}
                      </p>
                    )}
                  </div>
                  <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    {album.itemCount} images
                  </div>
                </div>
              </Link>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
