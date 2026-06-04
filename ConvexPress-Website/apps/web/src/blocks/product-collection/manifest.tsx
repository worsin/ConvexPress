import type { BlockRendererProps, WebsiteBlockDefinition } from "@/lib/blocks/types";
import {
  BlockMedia,
  CtaLink,
  RichText,
  SectionIntro,
  productGridClass,
} from "../_shared/rendering";
import {
  productCollectionAttrsSchema,
  type ProductCollectionItem,
  type ProductCollectionAttrs,
} from "./schema";

function ProductCard({
  product,
  showPrice,
  showSaleBadge,
  showAddToCart,
}: {
  product: ProductCollectionItem;
  showPrice: boolean;
  showSaleBadge: boolean;
  showAddToCart: boolean;
}) {
  const content = (
    <article className="h-full overflow-hidden rounded-md border border-border bg-card shadow-sm transition hover:-translate-y-0.5">
      <div className="relative bg-muted">
        {product.mediaId ? (
          <BlockMedia
            mediaId={product.mediaId}
            alt={product.imageAlt || product.title}
            className="aspect-[4/3] w-full object-cover"
            sizes="(max-width: 768px) 80vw, 25vw"
          />
        ) : (
          <div className="flex aspect-[4/3] w-full items-center justify-center bg-muted text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Product
          </div>
        )}
        {showSaleBadge && product.badge && (
          <span className="absolute left-3 top-3 border border-border bg-background px-2 py-1 text-xs font-semibold text-foreground">
            {product.badge}
          </span>
        )}
      </div>
      <div className="grid gap-3 p-4">
        <div className="space-y-1">
          <h3 className="text-base font-semibold leading-snug text-foreground">
            {product.title || "Product"}
          </h3>
          <RichText text={product.summary} className="text-sm text-muted-foreground" />
        </div>
        {showPrice && product.price && (
          <p className="text-sm font-semibold text-foreground">{product.price}</p>
        )}
        {showAddToCart && (
          <button
            type="button"
            data-product-href={product.href || undefined}
            className="min-h-10 rounded-md border border-border px-3 text-sm font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Add to cart
          </button>
        )}
      </div>
    </article>
  );

  if (!product.href) return content;
  return (
    <a href={product.href} className="block h-full hover:opacity-95">
      {content}
    </a>
  );
}

function ProductGrid({
  products,
  attrs,
}: {
  products: ProductCollectionItem[];
  attrs: ProductCollectionAttrs;
}) {
  if (!products.length) {
    return (
      <div
        data-product-query-mode={attrs.mode}
        data-product-ids={attrs.productIds.join(",")}
        data-category-slug={attrs.categorySlug}
        data-tag-slug={attrs.tagSlug}
        data-count={attrs.count}
        className="hidden"
      />
    );
  }

  const className =
    attrs.display === "carousel"
      ? "flex snap-x gap-4 overflow-x-auto pb-2"
      : productGridClass(attrs.columns);

  return (
    <div className={className}>
      {products.map((product, index) => (
        <div key={index} className={attrs.display === "carousel" ? "w-72 shrink-0 snap-start" : undefined}>
          <ProductCard
            product={product}
            showPrice={attrs.showPrice}
            showSaleBadge={attrs.showSaleBadge}
            showAddToCart={attrs.showAddToCart}
          />
        </div>
      ))}
    </div>
  );
}

function ProductCollectionRenderer({ attrs }: BlockRendererProps<ProductCollectionAttrs>) {
  const hasGroups = attrs.display === "tabs" && attrs.groups.length > 0;

  return (
    <div className="space-y-6">
      <SectionIntro eyebrow={attrs.eyebrow} heading={attrs.heading} body={attrs.intro} />
      {hasGroups ? (
        <div className="grid gap-6">
          {attrs.groups.map((group, index) => (
            <section
              key={index}
              data-product-group-ids={group.productIds.join(",")}
              className="space-y-3"
            >
              <h3 className="text-lg font-semibold text-foreground">{group.label}</h3>
              <ProductGrid products={group.products} attrs={{ ...attrs, productIds: group.productIds }} />
            </section>
          ))}
        </div>
      ) : (
        <ProductGrid products={attrs.products} attrs={attrs} />
      )}
      <div className="flex justify-center">
        <CtaLink label={attrs.ctaLabel} href={attrs.ctaUrl} />
      </div>
    </div>
  );
}

export const definition = {
  name: "blocks/product-collection",
  title: "Product Collection",
  version: 1,
  schema: productCollectionAttrsSchema,
  Renderer: ProductCollectionRenderer,
  rendererStatus: "ready",
} satisfies WebsiteBlockDefinition;

export default definition;
