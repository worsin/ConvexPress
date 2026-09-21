import { useMemo } from "react";
import { defineDataBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import { Intro, Prose } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/presentation";
import { resolvePrice } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-data/portable/commercePricing";
import type { FeaturedProductsResult } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-data/portable/productContracts";
import { usePriceTime } from "../../../ConvexPress-Website/apps/web/src/components/shop/product/usePriceTime";
import { formatMoney } from "../../../ConvexPress-Website/apps/web/src/lib/commerce/format";
import "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/featured-products.css";

type Pricing = NonNullable<FeaturedProductsResult["items"][number]["pricing"]>;
function ProductPrice({ pricing }: { pricing: Pricing }) {
  const inputs = useMemo(() => [{ price: pricing.price, salePrice: pricing.salePrice,
    salePriceFrom: pricing.salePriceFrom ?? undefined, salePriceTo: pricing.salePriceTo ?? undefined }], [pricing]);
  const time = usePriceTime(inputs, pricing.pricedAt);
  const { amount } = resolvePrice(pricing.price, pricing.salePrice, inputs[0], time);
  const discounted = amount < pricing.price.amount;
  return <div className="cp-featured-product-price">
    <span>{formatMoney(amount, pricing.price.currencyCode)}</span>
    {discounted && <><del aria-label="Regular price">{formatMoney(pricing.price.amount, pricing.price.currencyCode)}</del><span className="cp-featured-product-sale">Sale</span></>}
  </div>;
}
export default defineDataBlock("core/featured-products", "commerce.featuredProducts", ({ attrs, data }) => (
  <P.Stack gap="lg">
    <Intro eyebrow={attrs.eyebrow} heading={attrs.heading} body={attrs.body} />
    {data.items.length ? <div className="cp-featured-products-layout"><P.Grid gap="lg">
      {data.items.map(product => <article key={product.id} className="cp-featured-product">
        <a className="cp-featured-product-link" href={product.href}>
          <div className="cp-featured-product-image">
            {product.image ? <P.Image media={product.image} aspect="4/5" /> : <div className="cp-featured-product-no-image" aria-hidden="true"><span>{product.title}</span></div>}
            <span className="cp-featured-product-arrow" aria-hidden="true">↗</span>
          </div>
          <P.Heading level={3} size="md">{product.title || "Untitled product"}</P.Heading>
        </a>
        {product.excerpt && <div className="cp-featured-product-excerpt"><Prose text={product.excerpt} /></div>}
        {attrs.showPrice && product.pricing && <ProductPrice pricing={product.pricing} />}
      </article>)}
    </P.Grid></div> : <P.Text tone="muted">No products to show yet.</P.Text>}
  </P.Stack>
));
