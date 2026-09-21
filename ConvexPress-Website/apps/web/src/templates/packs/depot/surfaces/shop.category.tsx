/**
 * Depot · shop.category — one product category: breadcrumbs, a title row
 * with the count, an inline banner when the category has an image,
 * subcategories as chips with counts, then a dense product grid with
 * numbered pagination. Product cards link through to the product (this
 * archive's data carries no stock or variant info, so there is no stepper).
 */
import { Link } from "@tanstack/react-router";
import { PackageOpen } from "lucide-react";

import { MediaImage } from "@/components/media/MediaImage";
import type { CategoryArchiveProduct, CategoryArchiveSurfaceData } from "@/templates/packs/core/surfaces/shop.category";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Breadcrumbs, Card, Container, EmptyState, Label, Pagination, Price, Toolbar, buttonClasses } from "../parts";
import { PageHeader } from "../parts/extra-commerce";

const GRID = "grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5";

export default function DepotShopCategory({ data }: SurfaceProps<CategoryArchiveSurfaceData>) {
  const { slug, category, currencyCode, results } = data;
  const count = results.total;
  const children = category.children ?? [];

  return (
    <Container padded={false} data-slot="shop-category" className="flex flex-col gap-4 py-6 md:py-8">
      <Breadcrumbs
        items={[
          { label: "Home", to: "/" },
          { label: "Categories", to: "/categories" },
          ...(category.ancestors ?? []).map((ancestor) => ({ label: ancestor.name, to: "/categories/$slug", params: { slug: ancestor.slug } })),
          { label: category.name },
        ]}
      />

      <PageHeader label="Category" title={category.name} description={category.description} meta={`${count} ${count === 1 ? "product" : "products"}`} />

      {category.thumbnailMediaId ? (
        <Card className="overflow-hidden">
          <div className="h-40 w-full bg-muted md:h-56">
            <MediaImage mediaId={category.thumbnailMediaId as any} alt={category.name} className="h-full w-full object-cover" preferredSize="large" sizes="100vw" />
          </div>
        </Card>
      ) : null}

      {children.length > 0 && (
        <Toolbar label="Subcategories">
          <Label className="mr-1">Subcategories</Label>
          {children.map((child) => (
            <Link key={child._id} to="/categories/$slug" params={{ slug: child.slug }} className={buttonClasses("secondary", "sm")}>
              {child.name} <span className="tabular-nums text-muted-foreground">{child.totalProductCount ?? child.productCount ?? 0}</span>
            </Link>
          ))}
        </Toolbar>
      )}

      <section className="flex flex-col gap-3" aria-label="Products">
        <div className="flex items-center justify-between text-[13px] tabular-nums text-muted-foreground">
          <span>
            {results.total} {results.total === 1 ? "product" : "products"} found
          </span>
          <span>Page {results.page}</span>
        </div>

        {results.products.length === 0 ? (
          <EmptyState title="No published products in this category." />
        ) : (
          <div className={GRID}>
            {results.products.map((product) => (
              <ProductTile key={product._id} product={product} currencyCode={currencyCode} />
            ))}
          </div>
        )}

        <Pagination page={results.page} totalPages={results.totalPages} linkFor={(page) => (page === 1 ? { to: `/categories/${slug}` } : { to: `/categories/${slug}`, search: { page } })} />
      </section>
    </Container>
  );
}

function ProductTile({ product, currencyCode }: { product: CategoryArchiveProduct; currencyCode: string }) {
  const categories = product.categories ?? [];
  return (
    <Card as="article" className="group flex flex-col overflow-hidden transition-colors hover:border-primary/50">
      <Link to="/products/$slug" params={{ slug: product.slug }} className="flex flex-1 flex-col">
        <div className="aspect-square bg-muted/40">
          {product.featuredMediaId ? (
            <MediaImage mediaId={product.featuredMediaId as any} alt={product.title} className="h-full w-full object-cover" preferredSize="large" sizes="(max-width: 768px) 50vw, (max-width: 1280px) 33vw, 20vw" />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <PackageOpen className="size-8" aria-hidden="true" />
            </div>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-1.5 p-3">
          {categories.length > 0 ? <Label>{categories[0]!.name}</Label> : <Label>&nbsp;</Label>}
          <h3 className="line-clamp-2 text-sm font-semibold leading-5 text-foreground group-hover:text-primary">{product.title}</h3>
          {product.excerpt ? <p className="line-clamp-1 text-[13px] text-muted-foreground">{product.excerpt}</p> : null}
          <div className="mt-auto flex items-baseline gap-1.5 pt-1">
            {product.productType === "variable" && typeof product.displayPrice === "number" ? <span className="text-xs text-muted-foreground">From</span> : null}
            <Price amount={product.displayPrice} currency={currencyCode} />
          </div>
        </div>
      </Link>
    </Card>
  );
}
