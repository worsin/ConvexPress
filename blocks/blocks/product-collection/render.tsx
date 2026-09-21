import { ProductCard } from "../../../ConvexPress-Website/apps/web/src/components/shop/product/CanonicalProductCard";
export { ProductCard, ProductPurchase } from "../../../ConvexPress-Website/apps/web/src/components/shop/product/CanonicalProductCard";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { defineDataBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import { Intro, Prose, ResolvedImage } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/presentation";
import { z } from "zod";
import { safeLinkSchema } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-data/portable/generated/field-runtime.mjs";
import "./render.css";
const linkSchema = safeLinkSchema(z,["http","https","relative","anchor"]);
const hrefFor = (value:string) => {const parsed=linkSchema.safeParse(value);return parsed.success && parsed.data ? parsed.data : undefined;};

export default defineDataBlock("blocks/product-collection","commerce.productCollection",({attrs,data,resources,treatment})=>{
  const id=useId(),[selected,setSelected]=useState(0),rail=useRef<HTMLDivElement>(null);
  const active=selected<=data.groups.length?selected:0;
  const group=active>0?attrs.groups[active-1]:null;
  const items=active>0?data.groups[active-1]!.items:data.items;
  // Authored cards are a distinct manual content mode, never a denied-source fallback.
  const authored=group ? group.productIds.length===0?group.products:[] : attrs.mode==="manual" && attrs.productIds.length===0?attrs.products:[];
  const [railState,setRailState]=useState({before:false,after:false,overflow:false});
  const display=treatment?.values.display??"grid",columns=treatment?.values.columns??4,aspect=treatment?.values.aspect??"portrait";
  useEffect(()=>{
    const el=rail.current;if(!el || display!=="carousel")return;
    const measure=()=>{const maximum=Math.max(0,el.scrollWidth-el.clientWidth),position=Math.abs(el.scrollLeft);setRailState(previous=>{const next={before:position>2,after:position<maximum-2,overflow:maximum>2};return previous.before===next.before && previous.after===next.after && previous.overflow===next.overflow?previous:next;});};
    measure();const observer=new ResizeObserver(measure);observer.observe(el);el.addEventListener("scroll",measure,{passive:true});
    return()=>{observer.disconnect();el.removeEventListener("scroll",measure);};
  },[display,active,items.length,authored.length]);
  const labels=["All products",...attrs.groups.map(g=>g.label)];
  const change=(index:number)=>{setSelected(index);rail.current?.scrollTo({left:0,behavior:"instant"});};
  const navigate=(event:KeyboardEvent<HTMLButtonElement>,index:number)=>{
    const rtl=getComputedStyle(event.currentTarget).direction==="rtl";
    let next:number|undefined;
    if(event.key==="ArrowRight")next=(index+(rtl?-1:1)+labels.length)%labels.length;
    if(event.key==="ArrowLeft")next=(index+(rtl?1:-1)+labels.length)%labels.length;
    if(event.key==="Home")next=0;if(event.key==="End")next=labels.length-1;
    if(next!==undefined){event.preventDefault();change(next);document.getElementById(`${id}-tab-${next}`)?.focus();}
  };
  const move=(direction:number)=>{const el=rail.current;if(!el)return;const rtl=getComputedStyle(el).direction==="rtl";el.scrollBy({left:el.clientWidth*.85*direction*(rtl?-1:1),behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth"});};
  return <div className="cp-product-collection" data-display={display} data-columns={columns} data-aspect={aspect}>
    <div className="cp-collection-header"><Intro eyebrow={attrs.eyebrow} heading={attrs.heading} body={attrs.intro}/>{attrs.ctaLabel && hrefFor(attrs.ctaUrl) && <a className="cp-collection-more" href={hrefFor(attrs.ctaUrl)}>{attrs.ctaLabel} <span aria-hidden="true">↗</span></a>}</div>
    {data.groups.length>0 && <div className="cp-collection-tabs" role="tablist" aria-label="Product collections">{labels.map((label,index)=><button key={index} type="button" role="tab" id={`${id}-tab-${index}`} aria-selected={active===index} aria-controls={`${id}-panel`} tabIndex={active===index?0:-1} onKeyDown={e=>navigate(e,index)} onClick={()=>change(index)}>{label || `Collection ${index}`}</button>)}</div>}
    <div id={`${id}-panel`} role={data.groups.length?"tabpanel":undefined} aria-labelledby={data.groups.length?`${id}-tab-${active}`:undefined} tabIndex={data.groups.length?0:undefined}>
      {items.length || authored.length ? <div ref={rail} className="cp-collection-grid" tabIndex={display==="carousel"?0:undefined} aria-label={display==="carousel"?"Scrollable product collection":undefined}>
        {items.map(product=><ProductCard key={product.id} product={product} showPrice={attrs.showPrice} showSaleBadge={attrs.showSaleBadge} showAddToCart={attrs.showAddToCart}/>)}
        {authored.slice(0,attrs.count).map((card,index)=><article key={`authored-${index}`} className="cp-collection-card"><div className="cp-collection-image">{card.mediaId?<ResolvedImage id={card.mediaId} alt={card.imageAlt||undefined} resources={resources}/>:<div className="cp-collection-placeholder" aria-hidden="true">{card.title}</div>}</div><P.Heading level={3} size="md">{hrefFor(card.href)?<a href={hrefFor(card.href)}>{card.title}</a>:card.title}</P.Heading>{card.summary && <div className="cp-collection-description"><Prose text={card.summary}/></div>}{attrs.showPrice && card.price && <div className="cp-collection-price">{card.price}</div>}{card.badge && <span className="cp-collection-badge">{card.badge}</span>}</article>)}
      </div>:<div className="cp-collection-empty"><P.Heading level={3} size="md">{attrs.mode==="recentlyViewed" && !group?"Your discoveries belong here":"More good things are on the way"}</P.Heading><P.Text tone="muted">{attrs.mode==="recentlyViewed" && !group?"Products you explore will appear in this collection.":"There are no products in this collection right now."}</P.Text></div>}
    </div>
    {display==="carousel" && railState.overflow && <div className="cp-collection-controls"><span>Explore the collection</span><button type="button" aria-label="Previous products" disabled={!railState.before} onClick={()=>move(-1)}>←</button><button type="button" aria-label="Next products" disabled={!railState.after} onClick={()=>move(1)}>→</button></div>}
  </div>;
});
