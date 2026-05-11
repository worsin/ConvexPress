import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";

import { NotFoundPage } from "@/components/blog/NotFoundPage";
import { GalleryAlbumPage } from "@/components/gallery/GalleryAlbumPage";
import { PublicPluginGate } from "@/components/plugins/PublicPluginGate";
import { isPublicPluginEnabled } from "@/lib/plugins/public";
import { buildSeoHead, normalizeSiteUrl, toAbsoluteUrl } from "@/lib/seo/head";

export const Route = createFileRoute("/_marketing/gallery/$slug")({
  component: GalleryDetailPage,
  loader: async ({ context: { queryClient }, params }) => {
    // Gate BEFORE fetching extension data: if the Gallery extension is off,
    // do not issue the gallery query at all. Returning early lets the
    // component-level PublicPluginGate render a 404.
    const publicSettings = (await queryClient.ensureQueryData(
      convexQuery(api.settings.queries.getPublic, {}),
    )) as { siteUrl?: string | null; plugins?: { galleryEnabled?: boolean } };

    if (!isPublicPluginEnabled("gallery", publicSettings)) {
      return { seoHead: {}, galleryDisabled: true as const };
    }

    const album = await queryClient.ensureQueryData(
      convexQuery(api.gallery.queries.getBySlug, { slug: params.slug }),
    );

    const siteUrl = normalizeSiteUrl(publicSettings?.siteUrl);

    return {
      galleryDisabled: false as const,
      seoHead: buildSeoHead({
        title: `${album?.title ?? params.slug} - Gallery - ConvexPress`,
        description: album?.excerpt || `Gallery album: ${album?.title ?? params.slug}.`,
        canonical: toAbsoluteUrl(`/gallery/${params.slug}`, siteUrl),
      }),
    };
  },
  head: ({ loaderData }) => loaderData?.seoHead ?? {},
});

function GalleryDetailPage() {
  return (
    <PublicPluginGate pluginId="gallery">
      <GalleryDetailPageInner />
    </PublicPluginGate>
  );
}

function GalleryDetailPageInner() {
  const { slug } = Route.useParams();
  const query = convexQuery(api.gallery.queries.getBySlug, { slug }) as any;
  const { data: album } = useSuspenseQuery(query) as { data: any };

  if (!album) {
    return <NotFoundPage />;
  }

  return <GalleryAlbumPage album={album} />;
}
