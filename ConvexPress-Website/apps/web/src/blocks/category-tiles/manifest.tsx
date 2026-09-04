/**
 * Category Tiles — public renderer. Live categories with a cover image and
 * product count, each linking into the filtered catalog.
 */

import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import { ArrowRight } from "lucide-react";

import { MediaImage } from "@/components/media/MediaImage";
import type { BlockRendererProps, WebsiteBlockDefinition } from "@/lib/blocks/types";
import { CtaLink, SectionIntro } from "../_shared/rendering";
import { categoryTilesAttrsSchema, type CategoryTilesAttrs } from "./schema";

interface CategoryTile {
  id: string;
  slug: string;
  name: string;
  description: string;
  productCount: number;
  coverMediaId: string | null;
  coverTitle: string | null;
}

function gridClass(columns: number) {
  if (columns <= 2) return "grid gap-4 sm:grid-cols-2";
  if (columns === 3) return "grid gap-4 sm:grid-cols-2 lg:grid-cols-3";
  return "grid gap-4 sm:grid-cols-2 lg:grid-cols-4";
}

function CategoryTilesRenderer({ attrs }: BlockRendererProps<CategoryTilesAttrs>) {
  const tiles = useQuery((api as any).commerce.storefront.categoryTiles, {
    slugs: attrs.categorySlugs.length ? attrs.categorySlugs : undefined,
    limit: attrs.limit,
  }) as CategoryTile[] | undefined;

  return (
    <section data-block="commerce/category-tiles" className="space-y-8">
      <SectionIntro eyebrow={attrs.eyebrow} heading={attrs.heading} body={attrs.intro} />
      {tiles === undefined ? (
        <div className={gridClass(attrs.columns)}>
          {Array.from({ length: Math.min(attrs.limit, 6) }).map((_, index) => (
            <div key={index} className="aspect-[4/3] animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : tiles.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground">No categories yet.</p>
      ) : (
        <div className={gridClass(attrs.columns)}>
          {tiles.map((tile) => (
            <Link
              key={tile.id}
              to="/products"
              search={{ category: tile.slug } as any}
              className="group relative block aspect-[4/3] overflow-hidden rounded-xl border border-border bg-muted"
            >
              {tile.coverMediaId ? (
                <MediaImage
                  mediaId={tile.coverMediaId as any}
                  alt={tile.coverTitle ?? tile.name}
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  preferredSize="large"
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                />
              ) : null}
              <div className="absolute inset-0 bg-gradient-to-t from-foreground/80 via-foreground/20 to-transparent" aria-hidden="true" />
              <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-5">
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold text-background">{tile.name}</h3>
                  {attrs.showDescriptions && tile.description && (
                    <p className="mt-0.5 line-clamp-2 text-sm text-background/80">{tile.description}</p>
                  )}
                  {attrs.showCounts && (
                    <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-background/70">
                      {tile.productCount} {tile.productCount === 1 ? "product" : "products"}
                    </p>
                  )}
                </div>
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-background/90 text-foreground transition-transform group-hover:translate-x-0.5">
                  <ArrowRight className="size-4" aria-hidden="true" />
                </span>
              </div>
            </Link>
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
  name: "commerce/category-tiles",
  title: "Category Tiles",
  version: 1,
  schema: categoryTilesAttrsSchema,
  Renderer: CategoryTilesRenderer,
  rendererStatus: "ready",
} satisfies WebsiteBlockDefinition;

export default definition;
