import { defineDataBlock } from "./model";
import * as P from "../primitives";
import { ProductCard } from "../../../components/shop/product/CanonicalProductCard";
import { z } from "zod";
import { safeLinkSchema } from "../block-data/portable/generated/field-runtime.mjs";
import "../../../../../../../blocks/commerce/product-showcase/render.css";
const stockLabels={instock:"In stock",outofstock:"Out of stock",onbackorder:"Available on backorder",options:"Availability varies by option",external:"Sold by a partner"};
const link=safeLinkSchema(z,["http","https","relative","anchor"]);
export default defineDataBlock("commerce/product-showcase","commerce.productShowcase",({attrs,data})=>{
 const cta=link.safeParse(attrs.ctaUrl),href=cta.success&&cta.data?cta.data:null;
 return <div className="cp-product-showcase cp-product-collection" data-columns={data.items.length >= 4 ? 4 : data.items.length === 3 ? 3 : 2} data-showcase-state={data.items.length?"ready":"empty"}>
  <div className="cp-showcase-intro"><div>{attrs.eyebrow&&<P.Eyebrow>{attrs.eyebrow}</P.Eyebrow>}{attrs.heading&&<P.Heading>{attrs.heading}</P.Heading>}{attrs.intro&&<P.Text tone="muted">{attrs.intro}</P.Text>}</div>
   {href&&attrs.ctaLabel&&<a className="cp-showcase-more" href={href}>{attrs.ctaLabel}<span aria-hidden="true">↗</span></a>}
  </div>
  {data.items.length?<ul className="cp-collection-grid cp-showcase-grid" aria-label="Products in this selection">{data.items.map(product=><li key={product.id}><ProductCard product={product} showPrice showSaleBadge showAddToCart={attrs.showAddToCart}/><p className="cp-showcase-stock" data-stock={product.stock}>{stockLabels[product.stock]}</p></li>)}</ul>:<div className="cp-showcase-empty"><P.Heading level={3} size="md">More good things are on the way.</P.Heading><P.Text tone="muted">There are no available products in this selection right now.</P.Text><P.Link href="/products" label="Explore the shop"/></div>}
 </div>;
});
