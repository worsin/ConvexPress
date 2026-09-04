import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";
import { z } from "zod";

import { NotFoundPage } from "@/components/blog/NotFoundPage";
import { useSettings } from "@/contexts/SettingsContext";
import { buildSeoHead, normalizeSiteUrl, toAbsoluteUrl, siteTitled } from "@/lib/seo/head";
import CoreCategory, {
  type CategoryArchiveCategory,
  type CategoryArchiveSurfaceData,
} from "@/templates/packs/core/surfaces/shop.category";
import { Surface } from "@/templates/sdk/Surface";

const categorySearchSchema = z.object({
  page: z.number().min(1).optional(),
});

export const Route = createFileRoute("/_marketing/categories/$slug")({
  validateSearch: categorySearchSchema,
  loaderDeps: ({ search }) => ({
    page: Number(search.page) || 1,
  }),
  loader: async ({ context: { queryClient }, params: { slug }, deps }) => {
    const [publicSettings, category] = await Promise.all([
      queryClient.ensureQueryData(convexQuery(api.settings.queries.getPublic, {})),
      queryClient.ensureQueryData(
        convexQuery(api.commerce.categories.getBySlug, { slug }),
      ),
    ]);

    const siteUrl = normalizeSiteUrl(
      (publicSettings as { siteUrl?: string | null })?.siteUrl,
    );

    if (category) {
      await queryClient.ensureQueryData(
        convexQuery(api.commerce.products.listPublished, {
          page: deps.page,
          perPage: 12,
          categorySlug: slug,
        }),
      );
    }

    const title =
      (category as CategoryArchiveCategory | null)?.metaTitle ??
      siteTitled(`${(category as CategoryArchiveCategory | null)?.name ?? slug}`);
    const description =
      (category as CategoryArchiveCategory | null)?.metaDescription ??
      (category as CategoryArchiveCategory | null)?.description ??
      "Browse products in this category.";

    return {
      seoHead: buildSeoHead({
        title,
        description,
        canonical: toAbsoluteUrl(
          deps.page > 1
            ? `/categories/${slug}?page=${deps.page}`
            : `/categories/${slug}`,
          siteUrl,
        ),
        ogType: "website",
      }),
    };
  },
  head: ({ loaderData }) => loaderData?.seoHead ?? {},
  component: ProductCategoryArchivePage,
});

function ProductCategoryArchivePage() {
  const { slug } = Route.useParams();
  const { page } = Route.useLoaderDeps();
  const settings = useSettings();
  const currencyCode = settings?.commerceConfig?.currencyCode || "USD";

  const { data: category } = useSuspenseQuery(
    convexQuery(api.commerce.categories.getBySlug, { slug }) as any,
  ) as { data: CategoryArchiveCategory | null };

  if (!category) {
    return <NotFoundPage />;
  }

  const { data } = useSuspenseQuery(
    convexQuery(api.commerce.products.listPublished, {
      page,
      perPage: 12,
      categorySlug: slug,
    }) as any,
  ) as { data: CategoryArchiveSurfaceData["results"] };

  const surfaceData: CategoryArchiveSurfaceData = { slug, category, currencyCode, results: data };

  return <Surface name="shop.category" data={surfaceData} fallback={CoreCategory} />;
}
