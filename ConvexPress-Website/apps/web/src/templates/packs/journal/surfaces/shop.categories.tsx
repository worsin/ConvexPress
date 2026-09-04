/**
 * Journal · shop.categories — the category directory. Featured categories as
 * a three-up row of 3:2 images with display-type names; every category as a
 * rule-separated list with counts, nested ones indented. Same links as Core.
 */
import { Link } from "@tanstack/react-router";

import { MediaImage } from "@/components/media/MediaImage";
import type { CategoriesSurfaceData, CategoryDirectoryItem } from "@/templates/packs/core/surfaces/shop.categories";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Container, EmptyState, LinkButton, Rule, SectionHeading, SmallCaps } from "../parts";

export default function JournalShopCategories({ data }: SurfaceProps<CategoriesSurfaceData>) {
  const { categories, featured } = data;
  const featuredRow = featured.slice(0, 8);

  return (
    <Container as="section" data-slot="shop-categories" className="flex flex-col gap-14 py-6 md:gap-20 md:py-10">
      <SectionHeading level={1} eyebrow="Catalog" title="Categories" lede="Browse products by category, including nested collections and featured storefront groupings." />

      {featuredRow.length > 0 ? (
        <section className="flex flex-col gap-8">
          <SectionHeading
            level={2}
            title="Featured"
            action={
              <SmallCaps className="tabular-nums">
                {featuredRow.length} {featuredRow.length === 1 ? "category" : "categories"}
              </SmallCaps>
            }
          />
          <div className="grid grid-cols-1 gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {featuredRow.map((category) => (
              <FeaturedTile key={category._id} category={category} />
            ))}
          </div>
        </section>
      ) : null}

      {featuredRow.length > 0 ? <Rule /> : null}

      <section className="flex flex-col gap-8">
        <SectionHeading
          level={2}
          title="All categories"
          action={
            <SmallCaps className="tabular-nums">
              {categories.length} {categories.length === 1 ? "category" : "categories"}
            </SmallCaps>
          }
        />
        {categories.length === 0 ? (
          <EmptyState
            eyebrow="Nothing yet"
            title="No visible product categories yet."
            action={
              <LinkButton to="/products" variant="ghost">
                Browse products
              </LinkButton>
            }
          />
        ) : (
          <ul className="flex flex-col divide-y divide-border border-y border-border">
            {categories.map((category) => (
              <DirectoryRow key={category._id} category={category} />
            ))}
          </ul>
        )}
      </section>
    </Container>
  );
}

function countOf(category: CategoryDirectoryItem) {
  return category.totalProductCount ?? category.productCount ?? 0;
}

function FeaturedTile({ category }: { category: CategoryDirectoryItem }) {
  const count = countOf(category);
  return (
    <article className="group flex flex-col gap-4">
      <Link to="/categories/$slug" params={{ slug: category.slug }} className="block overflow-hidden rounded-2xl bg-muted" aria-label={category.name}>
        <div className="aspect-[3/2] w-full">
          {category.thumbnailMediaId ? (
            <MediaImage mediaId={category.thumbnailMediaId as any} alt={category.name} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]" preferredSize="large" sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" />
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center font-display text-lg text-muted-foreground">{category.name}</div>
          )}
        </div>
      </Link>
      <div className="flex flex-col gap-1.5">
        <SmallCaps className="tabular-nums">
          {count} {count === 1 ? "product" : "products"}
        </SmallCaps>
        <h3 className="font-display text-xl leading-snug tracking-tight text-foreground">
          <Link to="/categories/$slug" params={{ slug: category.slug }} className="transition-colors hover:text-primary">
            {category.name}
          </Link>
        </h3>
        {category.description ? <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">{category.description}</p> : null}
      </div>
    </article>
  );
}

function DirectoryRow({ category }: { category: CategoryDirectoryItem }) {
  const count = countOf(category);
  const depth = Math.max(0, category.depth ?? 0);
  return (
    <li>
      <Link to="/categories/$slug" params={{ slug: category.slug }} className="group flex items-baseline justify-between gap-6 py-5 transition-colors" style={depth > 0 ? { paddingLeft: `${depth * 1.5}rem` } : undefined}>
        <span className="flex min-w-0 flex-col gap-1">
          <span className={depth > 0 ? "text-lg text-foreground group-hover:text-primary" : "font-display text-xl leading-snug tracking-tight text-foreground group-hover:text-primary"}>{category.name}</span>
          {category.description ? <span className="line-clamp-1 text-sm text-muted-foreground">{category.description}</span> : null}
        </span>
        <span className="shrink-0 text-[11px] font-medium uppercase tracking-[0.18em] tabular-nums text-muted-foreground">
          {count} {count === 1 ? "product" : "products"}
        </span>
      </Link>
    </li>
  );
}
