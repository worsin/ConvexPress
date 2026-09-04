/**
 * Journal · shop.category — one product category: small-caps breadcrumbs,
 * an optional 3:2 image, the name in display type with its description and
 * count, subcategories as a row of pills, then a three-up grid of products
 * (4:5 image, display-type name, price) with Previous / page / Next.
 */
import { Link } from "@tanstack/react-router";

import { MediaImage } from "@/components/media/MediaImage";
import { formatMoney } from "@/lib/commerce/format";
import type { CategoryArchiveProduct, CategoryArchiveSurfaceData } from "@/templates/packs/core/surfaces/shop.category";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Breadcrumbs, Container, EmptyState, LinkButton, Pagination, Price, SectionHeading, SmallCaps } from "../parts";

export default function JournalShopCategory({ data }: SurfaceProps<CategoryArchiveSurfaceData>) {
  const { slug, category, currencyCode, results } = data;
  const count = category.totalProductCount ?? category.productCount ?? 0;
  const children = category.children ?? [];

  return (
    <Container as="section" data-slot="shop-category" className="flex flex-col gap-14 py-6 md:gap-20 md:py-10">
      <header className="flex flex-col gap-8">
        <Breadcrumbs
          items={[
            { label: "Home", to: "/" },
            { label: "Categories", to: "/categories" },
            ...(category.ancestors ?? []).map((ancestor) => ({ label: ancestor.name, to: "/categories/$slug", params: { slug: ancestor.slug } })),
            { label: category.name },
          ]}
        />
        {category.thumbnailMediaId ? (
          <figure className="overflow-hidden rounded-2xl bg-muted">
            <div className="aspect-[3/1]">
              <MediaImage mediaId={category.thumbnailMediaId as any} alt={category.name} className="h-full w-full object-cover" preferredSize="large" sizes="100vw" />
            </div>
          </figure>
        ) : null}
        <SectionHeading
          level={1}
          eyebrow="Category"
          title={category.name}
          lede={category.description}
          action={
            <SmallCaps className="tabular-nums">
              {count} {count === 1 ? "product" : "products"}
            </SmallCaps>
          }
        />
        {children.length > 0 ? (
          <div className="flex flex-col gap-3 border-t border-border pt-6">
            <SmallCaps as="h2">Subcategories</SmallCaps>
            <ul className="flex flex-wrap items-center gap-2">
              {children.map((child) => {
                const childCount = child.totalProductCount ?? child.productCount ?? 0;
                return (
                  <li key={child._id}>
                    <Link to="/categories/$slug" params={{ slug: child.slug }} className="inline-flex items-baseline gap-1.5 rounded-full border border-border px-3 py-1 text-xs text-foreground transition-colors hover:border-foreground/40 hover:text-primary">
                      {child.name}
                      <span className="text-[10px] tabular-nums text-muted-foreground">{childCount}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </header>

      <section className="flex flex-col gap-10">
        <div className="flex items-center justify-between border-y border-border py-4">
          <SmallCaps className="tabular-nums">
            {results.total} {results.total === 1 ? "product" : "products"} found
          </SmallCaps>
          <SmallCaps className="tabular-nums">Page {results.page}</SmallCaps>
        </div>

        {results.products.length === 0 ? (
          <EmptyState
            eyebrow="Nothing here"
            title="No published products in this category."
            action={
              <LinkButton to="/products" variant="ghost">
                Browse all products
              </LinkButton>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {results.products.map((product) => (
              <CategoryProductCard key={product._id} product={product} currencyCode={currencyCode} />
            ))}
          </div>
        )}

        <Pagination page={results.page} totalPages={results.totalPages} getLink={(page) => ({ to: "/categories/$slug", params: { slug }, search: { page } })} />
      </section>
    </Container>
  );
}

function CategoryProductCard({ product, currencyCode }: { product: CategoryArchiveProduct; currencyCode: string }) {
  const category = product.categories?.[0];
  const priceLabel =
    typeof product.displayPrice === "number" ? (product.productType === "variable" ? `From ${formatMoney(product.displayPrice, currencyCode)}` : formatMoney(product.displayPrice, currencyCode)) : "Price unavailable";
  return (
    <article data-slot="journal-product-card" className="group flex flex-col gap-4">
      <Link to="/products/$slug" params={{ slug: product.slug }} className="block overflow-hidden rounded-2xl bg-muted" aria-label={product.title}>
        <div className="aspect-[4/5] w-full">
          {product.featuredMediaId ? (
            <MediaImage mediaId={product.featuredMediaId as any} alt={product.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]" preferredSize="large" sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" />
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center font-display text-lg text-muted-foreground">{product.title}</div>
          )}
        </div>
      </Link>
      <div className="flex flex-col gap-1.5">
        {category ? <SmallCaps>{category.name}</SmallCaps> : null}
        <h2 className="font-display text-xl leading-snug tracking-tight text-foreground">
          <Link to="/products/$slug" params={{ slug: product.slug }} className="transition-colors hover:text-primary">
            {product.title}
          </Link>
        </h2>
        {product.excerpt ? <p className="line-clamp-1 text-sm leading-6 text-muted-foreground">{product.excerpt}</p> : null}
        <div className="mt-1">
          <Price label={priceLabel} size="sm" />
        </div>
      </div>
    </article>
  );
}
