import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";
import { z } from "zod";

import { isPublicPluginEnabled } from "@/lib/plugins/public";
import { buildSeoHead, normalizeSiteUrl, toAbsoluteUrl, siteTitled } from "@/lib/seo/head";
import CoreGalleryIndex, { type GalleryIndexSurfaceData } from "@/templates/packs/core/surfaces/gallery.index";
import { Surface } from "@/templates/sdk/Surface";

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
        title: page > 1 ? siteTitled(`Gallery Page ${page}`) : siteTitled("Gallery"),
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

  const surfaceData: GalleryIndexSurfaceData = { albums: data.albums };

  return <Surface name="gallery.index" data={surfaceData} fallback={CoreGalleryIndex} />;
}
