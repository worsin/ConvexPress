import { Link } from "@tanstack/react-router";

import { GalleryEmbed } from "./GalleryEmbed";

interface GalleryAlbumPageProps {
  album: any;
}

export function GalleryAlbumPage({ album }: GalleryAlbumPageProps) {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      <section className="rounded-[2rem] border border-border/60 bg-gradient-to-br from-stone-50 via-white to-amber-50 p-8 shadow-sm">
        <div className="flex flex-col gap-4">
          <span className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-700">
            Gallery
          </span>
          <h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
            {album.title}
          </h1>
          {album.excerpt && (
            <p className="max-w-3xl text-base leading-8 text-muted-foreground">
              {album.excerpt}
            </p>
          )}
          {(album.categories ?? []).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {album.categories.map((category: any) => (
                <Link
                  key={category._id}
                  to="/gallery/category/$slug"
                  params={{ slug: category.slug }}
                  className="rounded-full bg-white/80 px-3 py-1 text-xs font-medium text-foreground shadow-sm ring-1 ring-border"
                >
                  {category.name}
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {album.description && (
        <section className="rounded-[2rem] border border-border bg-card p-6">
          <p className="whitespace-pre-wrap text-base leading-8 text-foreground">
            {album.description}
          </p>
        </section>
      )}

      <GalleryEmbed album={album} />
    </div>
  );
}
