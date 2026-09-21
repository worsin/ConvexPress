/**
 * Product detail page.
 *
 * Purchase logic lives in `useProductPage`; the arrangement comes from the
 * product layout preset in Settings › Shop layouts (`?productLayout=` lets
 * the admin preview one before saving).
 */

import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convexpress-website/backend/generated/api";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { z } from "zod";
import { useRecordProductView } from "../../../hooks/useProductHistory";

import { NotFoundPage } from "@/components/blog/NotFoundPage";
import { useProductPage, type ProductDetail } from "@/components/shop/product/useProductPage";
import { ShopShell } from "@/components/shop/ShopShell";
import { PRODUCT_LAYOUT_IDS, SHOP_LAYOUT_IDS } from "@/hooks/useShopLayout";
import { buildSeoHead, normalizeSiteUrl, toAbsoluteUrl } from "@/lib/seo/head";
import CoreProduct from "@/templates/packs/core/surfaces/shop.product";
import { Surface } from "@/templates/sdk/Surface";

const searchSchema = z.object({
  optionType: z.string().min(1).max(256).optional().catch(undefined),
  optionValue: z.string().min(1).max(256).optional().catch(undefined),
  /** Admin preview overrides (Settings › Shop layouts). Never persisted. */
  productLayout: z.enum(PRODUCT_LAYOUT_IDS).optional(),
  layout: z.enum(SHOP_LAYOUT_IDS).optional(),
  cartPanel: z.enum(["persistent", "drawer"]).optional(),
  /** Template preview override (Appearance › Templates). Never persisted. */
  template: z.string().max(64).optional(),
});

export const Route = createFileRoute("/_marketing/products/$slug")({
  validateSearch: searchSchema,
  loader: async ({ context: { queryClient }, params }) => {
    const publicSettings = await queryClient.ensureQueryData(convexQuery(api.settings.queries.getPublic, {}));
    const siteUrl = normalizeSiteUrl((publicSettings as { siteUrl?: string | null })?.siteUrl);
    const siteTitle = (publicSettings as { siteTitle?: string | null })?.siteTitle || "Shop";
    if ((publicSettings as any)?.plugins?.commerceEnabled !== true) {
      throw notFound();
    }

    const product = await queryClient.ensureQueryData(convexQuery(api.commerce.products.getBySlug, { slug: params.slug }));
    if (!product) throw notFound();

    return {
      seoHead: buildSeoHead({
        title: `${product?.title ?? params.slug} – ${siteTitle}`,
        description: product?.excerpt || `${product?.title ?? params.slug} at ${siteTitle}.`,
        canonical: toAbsoluteUrl(`/products/${params.slug}`, siteUrl),
      }),
    };
  },
  head: ({ loaderData }) => loaderData?.seoHead ?? {},
  component: ProductDetailPage,
  notFoundComponent: NotFoundPage,
});

function ProductDetailPage() {
  const { slug } = Route.useParams();
  const { data: product } = useSuspenseQuery(convexQuery(api.commerce.products.getBySlug, { slug }) as any) as { data: ProductDetail | null };
  const {optionType,optionValue} = Route.useSearch();
  const state = useProductPage(product,{optionType,optionValue});
  useRecordProductView(product?._id ?? null);

  if (!product) return <NotFoundPage />;

  return (
    <ShopShell kind="product" productId={product._id}>
      <Surface name="shop.product" data={{ product, state }} fallback={CoreProduct} />
    </ShopShell>
  );
}
