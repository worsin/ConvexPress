/**
 * Product Showcase — public renderer.
 *
 * Live catalog data: prices, stock and cart state come from Convex at render
 * time, and the cards are the same ones the shop grid uses, so "in cart"
 * steppers stay in sync with the rail and the drawer.
 */

import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";

import { ProductGridCard } from "@/components/shop/ProductGridCard";
import type { ProductCardData } from "@/components/shop/ProductMiniCard";
import type { BlockRendererProps, WebsiteBlockDefinition } from "@/lib/blocks/types";
import { CtaLink, SectionIntro, productGridClass } from "../_shared/rendering";
import { productShowcaseAttrsSchema, type ProductShowcaseAttrs } from "./schema";

function useShowcaseProducts(attrs: ProductShowcaseAttrs): ProductCardData[] | undefined {
  const anyApi = api as any;
  const bySlugs = useQuery(
    anyApi.commerce.storefront.productCardsBySlugs,
    attrs.source === "slugs" ? { slugs: attrs.productSlugs } : "skip",
  ) as ProductCardData[] | undefined;
  const search = useQuery(
    anyApi.commerce.storefront.searchProducts,
    attrs.source === "slugs"
      ? "skip"
      : {
          categorySlug: attrs.source === "category" && attrs.categorySlug ? attrs.categorySlug : undefined,
          sort: "newest",
          perPage: attrs.source === "sale" ? 48 : attrs.count,
        },
  ) as { items: ProductCardData[] } | undefined;
  if (attrs.source === "slugs") return bySlugs;
  if (!search) return undefined;
  if (attrs.source === "sale") {
    return search.items.filter((item) => item.compareAtPrice && item.compareAtPrice.amount > item.price.amount).slice(0, attrs.count);
  }
  return search.items.slice(0, attrs.count);
}

function ProductShowcaseRenderer({ attrs }: BlockRendererProps<ProductShowcaseAttrs>) {
  const products = useShowcaseProducts(attrs);
  return (
    <section data-block="commerce/product-showcase" className="space-y-8">
      <SectionIntro eyebrow={attrs.eyebrow} heading={attrs.heading} body={attrs.intro} />
      {products === undefined ? (
        <div className={productGridClass(attrs.columns)}>
          {Array.from({ length: attrs.count }).map((_, index) => (
            <div key={index} className="aspect-[3/4] animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground">No products to show yet.</p>
      ) : (
        <div className={productGridClass(attrs.columns)}>
          {products.map((product) => (
            <ProductGridCard key={product.productId} product={product} />
          ))}
        </div>
      )}
      {attrs.ctaLabel && attrs.ctaUrl && (
        <div className="flex justify-center">
          <CtaLink label={attrs.ctaLabel} href={attrs.ctaUrl} />
        </div>
      )}
    </section>
  );
}

export const definition = {
  name: "commerce/product-showcase",
  title: "Product Showcase",
  version: 1,
  schema: productShowcaseAttrsSchema,
  Renderer: ProductShowcaseRenderer,
  rendererStatus: "ready",
} satisfies WebsiteBlockDefinition;

export default definition;
