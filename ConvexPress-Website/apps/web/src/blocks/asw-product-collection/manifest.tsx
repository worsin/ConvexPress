import type { BlockRendererProps, WebsiteBlockDefinition } from "@/lib/blocks/types";
import {
  BlockMedia,
  CtaLink,
  RichText,
  SectionIntro,
  productGridClass,
} from "../_shared/rendering";
import {
  aswProductCollectionAttrsSchema,
  type AswProductCard,
  type AswProductCollectionAttrs,
} from "./schema";

function ProductCard({
  product,
  showPrice,
  showSaleBadge,
  showAddToCart,
}: {
  product: AswProductCard;
  showPrice: boolean;
  showSaleBadge: boolean;
  showAddToCart: boolean;
}) {
  const content = (
    <article className="h-full overflow-hidden border border-border bg-card">
      <div className="relative bg-muted">
        {product.mediaId ? (
          <BlockMedia
            mediaId={product.mediaId}
            alt={product.imageAlt || product.title}
            className="aspect-[4/3] w-full object-cover"
            sizes="(max-width: 768px) 80vw, 25vw"
          />
        ) : (
          <div className="aspect-[4/3] w-full bg-muted" />
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
            {product.title || "Tonewood product"}
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
            className="min-h-10 border border-border px-3 text-sm font-semibold text-foreground hover:bg-muted"
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
  products: AswProductCard[];
  attrs: AswProductCollectionAttrs;
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

function AswProductCollectionRenderer({ attrs }: BlockRendererProps<AswProductCollectionAttrs>) {
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
  name: "asw/product-collection",
  title: "ASW Product Collection",
  version: 1,
  schema: aswProductCollectionAttrsSchema,
  Renderer: AswProductCollectionRenderer,
  rendererStatus: "ready",
} satisfies WebsiteBlockDefinition;

export default definition;
