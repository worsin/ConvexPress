import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";
import { z } from "zod";

import { MediaImage } from "@/components/media/MediaImage";
import { isPublicPluginEnabled } from "@/lib/plugins/public";
import { buildSeoHead, normalizeSiteUrl, toAbsoluteUrl } from "@/lib/seo/head";

const gallerySearchSchema = z.object({
  page: z.number().min(1).optional(),
});

export const Route = createFileRoute("/_marketing/gallery/")({
  validateSearch: gallerySearchSchema,
  component: GalleryIndexPage,
  loaderDeps: ({ search }) => ({
    page: Number(search.page) || 1,
  }),
  loader: async ({ context: { queryClient }, deps: { page } }) => {
    const publicSettings = await queryClient.ensureQueryData(
      convexQuery(api.settings.queries.getPublic, {}),
    );

    if (!isPublicPluginEnabled("gallery", publicSettings)) {
      return { seoHead: {}, galleryDisabled: true as const };
    }

    await queryClient.ensureQueryData(
      convexQuery(api.gallery.queries.listPublished, {
        page,
        perPage: 12,
      }),
    );

    const siteUrl = normalizeSiteUrl((publicSettings as { siteUrl?: string | null })?.siteUrl);
    return {
      galleryDisabled: false as const,
      seoHead: buildSeoHead({
        title: page > 1 ? `Gallery Page ${page} - ConvexPress` : "Gallery - ConvexPress",
        description: "Browse image galleries published through ConvexPress.",
        canonical: toAbsoluteUrl(page > 1 ? `/gallery?page=${page}` : "/gallery", siteUrl),
      }),
    };
  },
  head: ({ loaderData }) => loaderData?.seoHead ?? {},
});

function GalleryIndexPage() {
  const { page } = Route.useLoaderDeps();
  const query = convexQuery(api.gallery.queries.listPublished, {
      page,
      perPage: 12,
    }) as any;
  const { data } = useSuspenseQuery(query) as { data: any };

  return (
    <div className="flex flex-col gap-10">
      <section className="grid gap-8 rounded-[2rem] border border-border/60 bg-gradient-to-br from-stone-100 via-white to-amber-50 p-8 shadow-sm">
        <div className="flex flex-col gap-3">
          <span className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-700">
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

      {data.albums.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border p-10 text-center">
          <p className="text-sm text-muted-foreground">
            No galleries are published yet.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {data.albums.map((album: any) => (
            <article
              key={album._id}
              className="group overflow-hidden rounded-[2rem] border border-border bg-card shadow-sm transition-transform duration-200 hover:-translate-y-0.5"
            >
              <Link to="/gallery/$slug" params={{ slug: album.slug }} className="block">
                <div className="aspect-[4/3] bg-muted/40">
                  {album.coverMedia?._id ? (
                    <MediaImage
                      mediaId={album.coverMedia._id}
                      alt={album.title}
                      className="h-full w-full object-cover"
                      sizes="(max-width: 768px) 100vw, 33vw"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-gradient-to-br from-stone-200 to-amber-100 text-sm text-amber-900">
                      Gallery
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-4 p-5">
                  <div className="flex flex-wrap gap-2">
                    {(album.categories ?? []).map((category: any) => (
                      <span
                        key={category._id}
                        className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-900"
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
