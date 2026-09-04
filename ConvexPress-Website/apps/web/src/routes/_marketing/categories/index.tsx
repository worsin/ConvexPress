import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";

import { isPublicPluginEnabled } from "@/lib/plugins/public";
import { buildSeoHead, normalizeSiteUrl, toAbsoluteUrl, siteTitled } from "@/lib/seo/head";
import CoreCategories, { type CategoryDirectoryItem } from "@/templates/packs/core/surfaces/shop.categories";
import { Surface } from "@/templates/sdk/Surface";

export const Route = createFileRoute("/_marketing/categories/")({
  loader: async ({ context: { queryClient } }) => {
    const publicSettings = await queryClient.ensureQueryData(
      convexQuery(api.settings.queries.getPublic, {}),
    );
    const siteUrl = normalizeSiteUrl(
      (publicSettings as { siteUrl?: string | null })?.siteUrl,
    );
    if (isPublicPluginEnabled("commerce", publicSettings as any)) {
      await queryClient.ensureQueryData(
        convexQuery(api.commerce.categories.getTree, {}),
      );
    }

    return {
      seoHead: buildSeoHead({
        title: siteTitled("Product Categories"),
        description: "Browse the ConvexPress product catalog by category.",
        canonical: toAbsoluteUrl("/categories", siteUrl),
      }),
    };
  },
  head: ({ loaderData }) => loaderData?.seoHead ?? {},
  component: ProductCategoriesPage,
});

function ProductCategoriesPage() {
  const { data } = useSuspenseQuery(
    convexQuery(api.commerce.categories.getTree, {}) as any,
  ) as { data: CategoryDirectoryItem[] };

  const categories = flattenVisible(data ?? []).filter(
    (category) => (category.totalProductCount ?? category.productCount ?? 0) > 0,
  );
  const featured = categories.filter((category: any) => category.isFeatured);

  return <Surface name="shop.categories" data={{ categories, featured }} fallback={CoreCategories} />;
}

function flattenVisible(nodes: CategoryDirectoryItem[], output: CategoryDirectoryItem[] = []) {
  for (const node of nodes) {
    output.push(node);
    flattenVisible(node.children ?? [], output);
  }
  return output;
}
