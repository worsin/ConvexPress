import { defineDataBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import { Prose, ResolvedImage } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/presentation";
import { ProductPurchase } from "../../blocks/product-collection/render";
import "./render.css";

export default defineDataBlock("commerce/product-hero", "commerce.productCollection", ({ attrs, data, resources }) => {
  const product = data.items[0];
  if (!product) return <div className="cp-product-hero cp-product-hero-empty" data-product-state="empty">
    <P.Eyebrow>From the shop</P.Eyebrow><P.Heading>Something else may catch your eye.</P.Heading>
    <P.Text tone="muted">This product is not available right now. Explore the shop for more.</P.Text>
    <P.Link href="/products" label="Explore the shop" />
  </div>;
  return <div className="cp-product-hero-frame"><article className="cp-product-hero" data-product-state="ready">
    <a className="cp-product-hero-visual" href={product.href} aria-label={`Discover ${product.title}`}>
      {attrs.media ? <ResolvedImage id={attrs.media.id} alt={attrs.media.alt} focalPoint={attrs.media.focalPoint} resources={resources}/> : product.image ?
        <img src={product.image.src} alt={product.image.alt} decoding="async"/> :
        <span className="cp-product-hero-monogram" aria-hidden="true">{Array.from(product.title.trim())[0] || "✳"}</span>}
      <span className="cp-product-hero-discover" aria-hidden="true">Take a closer look <span>↗</span></span>
    </a>
    <div className="cp-product-hero-copy">
      <P.Eyebrow>In the spotlight</P.Eyebrow>
      <P.Heading size="display">{attrs.title || product.title}</P.Heading>
      {attrs.title && attrs.title !== product.title && <P.Text size="sm">{product.title}</P.Text>}
      {product.excerpt && <div className="cp-product-hero-description"><Prose text={product.excerpt}/></div>}
      <div className="cp-product-hero-purchase"><ProductPurchase key={product.id} product={product}/></div>
      <a className="cp-product-hero-details" href={product.href}>Product details <span aria-hidden="true">↗</span></a>
    </div>
  </article></div>;
});
