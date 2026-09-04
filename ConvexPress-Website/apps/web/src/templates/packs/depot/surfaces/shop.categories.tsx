/**
 * Depot · shop.categories — the product category directory as a dense card
 * grid with product counts: a "Featured" row first when any are flagged,
 * then every visible category. Same links and counts as Core.
 */
import { Link } from "@tanstack/react-router";
import { PackageOpen } from "lucide-react";

import { MediaImage } from "@/components/media/MediaImage";
import type { CategoriesSurfaceData, CategoryDirectoryItem } from "@/templates/packs/core/surfaces/shop.categories";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Badge, Card, Container, EmptyState, Label, SectionHeading } from "../parts";
import { PageHeader } from "../parts/extra-commerce";

const GRID = "grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5";

export default function DepotShopCategories({ data }: SurfaceProps<CategoriesSurfaceData>) {
  const { categories, featured } = data;
  return (
    <Container padded={false} data-slot="shop-categories" className="flex flex-col gap-6 py-6 md:py-8">
      <PageHeader label="Catalog" title="Product categories" description="Browse products by category, including nested collections and featured storefront groupings." meta={`${categories.length} ${categories.length === 1 ? "category" : "categories"}`} />

      {featured.length > 0 && <CategorySection title="Featured" categories={featured.slice(0, 8)} />}
      <CategorySection title="All categories" categories={categories} />
    </Container>
  );
}

function CategorySection({ title, categories }: { title: string; categories: CategoryDirectoryItem[] }) {
  return (
    <section className="flex flex-col gap-3">
      <SectionHeading title={title} count={`${categories.length} ${categories.length === 1 ? "category" : "categories"}`} />
      {categories.length === 0 ? (
        <EmptyState title="No visible product categories yet." />
      ) : (
        <div className={GRID}>
          {categories.map((category) => (
            <CategoryCard key={category._id} category={category} />
          ))}
        </div>
      )}
    </section>
  );
}

function CategoryCard({ category }: { category: CategoryDirectoryItem }) {
  const count = category.totalProductCount ?? category.productCount ?? 0;
  const depth = category.depth ?? 0;
  return (
    <Card as="article" className="group flex flex-col overflow-hidden transition-colors hover:border-primary/50">
      <Link to="/categories/$slug" params={{ slug: category.slug }} className="flex flex-1 flex-col">
        <div className="relative aspect-[4/3] bg-muted/40">
          {category.thumbnailMediaId ? (
            <MediaImage mediaId={category.thumbnailMediaId as any} alt={category.name} className="h-full w-full object-cover" preferredSize="large" sizes="(max-width: 768px) 50vw, (max-width: 1280px) 33vw, 20vw" />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <PackageOpen className="size-8" aria-hidden="true" />
            </div>
          )}
          {category.isFeatured && (
            <Badge tone="sale" className="absolute left-2 top-2">
              Featured
            </Badge>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-1 p-3">
          {depth > 0 ? <Label>Subcategory</Label> : <Label>Department</Label>}
          <div className="flex items-start justify-between gap-2">
            <h3 className="line-clamp-2 text-sm font-semibold leading-5 text-foreground group-hover:text-primary">{category.name}</h3>
            <Badge tone="stock" className="shrink-0 tabular-nums">
              {count}
            </Badge>
          </div>
          {category.description ? <p className="line-clamp-1 text-[13px] text-muted-foreground">{category.description}</p> : null}
        </div>
      </Link>
    </Card>
  );
}
