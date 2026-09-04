import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";

import { PublicPluginGate } from "@/components/plugins/PublicPluginGate";
import { isPublicPluginEnabled } from "@/lib/plugins/public";
import { buildSeoHead, normalizeSiteUrl, toAbsoluteUrl, siteTitled } from "@/lib/seo/head";
import CoreGalleryCategory, { type GalleryCategorySurfaceData } from "@/templates/packs/core/surfaces/gallery.category";
import { Surface } from "@/templates/sdk/Surface";

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
        title: siteTitled(`${categoryName} - Gallery`),
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

  const surfaceData: GalleryCategorySurfaceData = {
    category: data.category,
    albums: data.albums,
  };

  return <Surface name="gallery.category" data={surfaceData} fallback={CoreGalleryCategory} />;
}
