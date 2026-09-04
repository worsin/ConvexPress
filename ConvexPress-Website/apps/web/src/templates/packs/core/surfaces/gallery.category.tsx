/** Core · gallery.category — albums filed under one gallery category. */
import { Link } from "@tanstack/react-router";

import { MediaImage } from "@/components/media/MediaImage";
import type { SurfaceProps } from "@/templates/sdk/types";

export type GalleryCategory = {
  _id?: string;
  name: string;
  slug?: string;
  description?: string | null;
};

export type GalleryCategoryAlbum = {
  _id: string;
  slug: string;
  title: string;
  excerpt?: string | null;
  coverMedia?: { _id: string } | null;
};

export interface GalleryCategorySurfaceData {
  /** The category the query resolved for the slug; may be missing when the slug is unknown. */
  category: GalleryCategory | null | undefined;
  albums: GalleryCategoryAlbum[];
}

export default function CoreGalleryCategory({ data }: SurfaceProps<GalleryCategorySurfaceData>) {
  const { category, albums } = data;

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-[2rem] border border-border/60 bg-card p-8 shadow-sm">
        <div className="text-xs font-semibold uppercase tracking-[0.25em] text-primary">
          Gallery Category
        </div>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground">
          {category?.name ?? "Gallery Category"}
        </h1>
        {category?.description && (
          <p className="mt-3 max-w-3xl text-base leading-8 text-muted-foreground">
            {category.description}
          </p>
        )}
      </section>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {albums.map((album) => (
          <article
            key={album._id}
            className="overflow-hidden rounded-[2rem] border border-border bg-card shadow-sm"
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
                ) : null}
              </div>
              <div className="p-5">
                <h2 className="text-xl font-semibold text-foreground">{album.title}</h2>
                {album.excerpt && (
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {album.excerpt}
                  </p>
                )}
              </div>
            </Link>
          </article>
        ))}
      </div>
    </div>
  );
}
