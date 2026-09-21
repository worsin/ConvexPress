import { useMemo,useRef,useState } from "react";
import * as P from "@/templates/sdk/primitives";
import { Prose } from "@/templates/sdk/block-renderer/presentation";
import { useCollectionCart } from "@/templates/sdk/block-renderer/collection-cart";
import { resolvePrice } from "@/templates/sdk/block-data/portable/commercePricing";
import type { ProductCollectionCard } from "@/templates/sdk/block-data/portable/productCollectionContracts";
import { usePriceTime } from "./usePriceTime";
import { formatMoney } from "@/lib/commerce/format";
import "../../../../../../../blocks/blocks/product-collection/render.css";
function Price({pricing,badge}:{pricing:NonNullable<ProductCollectionCard["pricing"]>;badge:boolean}) {
  const prices=useMemo(()=>[{price:pricing.price,salePrice:pricing.salePrice,salePriceFrom:pricing.salePriceFrom??undefined,salePriceTo:pricing.salePriceTo??undefined}],[pricing]);
  const time=usePriceTime(prices,pricing.pricedAt),decision=resolvePrice(pricing.price,pricing.salePrice,prices[0],time);
  const discounted=decision.saleActive && decision.amount<pricing.price.amount;
  return <div className="cp-collection-price"><span>{formatMoney(decision.amount,pricing.price.currencyCode)}</span>{discounted && <><del aria-label="Regular price">{formatMoney(pricing.price.amount,pricing.price.currencyCode)}</del>{badge && <span className="cp-collection-badge">Sale</span>}</>}</div>;
}
export function ProductPurchase({product,showPrice=true,showSaleBadge=true,showAddToCart=true}:{product:ProductCollectionCard;showPrice?:boolean;showSaleBadge?:boolean;showAddToCart?:boolean}) {
  const submitting=useRef(false);
  const cart=useCollectionCart(),[pending,setPending]=useState(false),[message,setMessage]=useState("");
  const add=async()=>{if(!cart?.ready || submitting.current || cart.busy || product.cart?.kind!=="add")return;submitting.current=true;setPending(true);setMessage("");try{setMessage(await cart.add(product.id,product.title)?"Added to cart":"Could not add this item. Please try again.");}catch{setMessage("Could not add this item. Please try again.");}finally{submitting.current=false;setPending(false);}};
  return <>
    {showPrice && product.pricing && <Price pricing={product.pricing} badge={showSaleBadge}/>}
    {showAddToCart && product.cart && (product.cart.kind==="chooseOptions" ? <a className="cp-collection-action" href={product.href}>Choose options <span aria-hidden="true">↗</span></a> : cart ? <button type="button" className="cp-collection-action" onClick={()=>void add()} disabled={!cart.ready || pending || Boolean(cart.busy)}>{pending?"Adding…":"Add to cart"}<span aria-hidden="true">+</span></button> : <a className="cp-collection-action" href={product.href}>View product <span aria-hidden="true">↗</span></a>)}
    {message && <p className="cp-collection-feedback" role="status">{message}</p>}
  </>;
}
export function ProductCard({product,showPrice,showSaleBadge,showAddToCart}:{product:ProductCollectionCard;showPrice:boolean;showSaleBadge:boolean;showAddToCart:boolean}) {
  return <article className="cp-collection-card">
    <a className="cp-collection-product-link" href={product.href}><div className="cp-collection-image">{product.image?<img src={product.image.src} alt={product.image.alt} loading="lazy" decoding="async"/>:<div className="cp-collection-placeholder" aria-hidden="true">{product.title}</div>}<span className="cp-collection-arrow" aria-hidden="true">↗</span></div><P.Heading level={3} size="md">{product.title || "Untitled product"}</P.Heading></a>
    {product.excerpt && <div className="cp-collection-description"><Prose text={product.excerpt}/></div>}
    {product.rating && <div className="cp-collection-rating" aria-label={`${product.rating.average.toFixed(1)} out of 5 stars, ${product.rating.count} reviews`}><span aria-hidden="true">★</span> {product.rating.average.toFixed(1)} <span aria-hidden="true">/ 5 · {product.rating.count} reviews</span></div>}
    <ProductPurchase product={product} showPrice={showPrice} showSaleBadge={showSaleBadge} showAddToCart={showAddToCart}/>
  </article>;
}
