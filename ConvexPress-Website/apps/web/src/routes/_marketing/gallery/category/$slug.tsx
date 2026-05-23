import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";

import { MediaImage } from "@/components/media/MediaImage";
import { PublicPluginGate } from "@/components/plugins/PublicPluginGate";
import { isPublicPluginEnabled } from "@/lib/plugins/public";
import { buildSeoHead, normalizeSiteUrl, toAbsoluteUrl } from "@/lib/seo/head";

export const Route = createFileRoute("/_marketing/gallery/category/$slug")({
  component: GalleryCategoryPage,
  loader: async ({ context: { queryClient }, params }) => {
    const publicSettings = (await queryClient.ensureQueryData(
      convexQuery(api.settings.queries.getPublic, {}),
    )) as { siteUrl?: string | null; plugins?: { galleryEnabled?: boolean } };

    if (!isPublicPluginEnabled("gallery", publicSettings)) {
      return { seoHead: {}, galleryDisabled: true as const };
    }

    const data = await queryClient.ensureQueryData(
      convexQuery(api.gallery.queries.listPublished, {
        page: 1,
        perPage: 24,
        categorySlug: params.slug,
      }),
    );
    const siteUrl = normalizeSiteUrl(publicSettings?.siteUrl);
    const categoryName = data?.category?.name ?? params.slug;
    return {
      galleryDisabled: false as const,
      seoHead: buildSeoHead({
        title: `${categoryName} - Gallery - ConvexPress`,
        description: data?.category?.description || `Gallery albums filed under ${categoryName}.`,
        canonical: toAbsoluteUrl(`/gallery/category/${params.slug}`, siteUrl),
      }),
    };
  },
  head: ({ loaderData }) => loaderData?.seoHead ?? {},
});

function GalleryCategoryPage() {
  return (
    <PublicPluginGate pluginId="gallery">
      <GalleryCategoryPageInner />
    </PublicPluginGate>
  );
}

function GalleryCategoryPageInner() {
  const { slug } = Route.useParams();
  const query = convexQuery(api.gallery.queries.listPublished, {
      page: 1,
      perPage: 24,
      categorySlug: slug,
    }) as any;
  const { data } = useSuspenseQuery(query) as { data: any };

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-[2rem] border border-border/60 bg-card p-8 shadow-sm">
        <div className="text-xs font-semibold uppercase tracking-[0.25em] text-primary">
          Gallery Category
        </div>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground">
          {data.category?.name ?? "Gallery Category"}
        </h1>
        {data.category?.description && (
          <p className="mt-3 max-w-3xl text-base leading-8 text-muted-foreground">
            {data.category.description}
          </p>
        )}
      </section>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {data.albums.map((album: any) => (
          <article
            key={album._id}
            className="overflow-hidden rounded-[2rem] border border-border bg-card shadow-sm"
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
