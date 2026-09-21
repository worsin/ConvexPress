import { useEffect, useMemo, useState } from "react";
import { createDemoContentPageHost, type InstalledDemoPageData } from "../src/templates/sdk/block-data/demo-channel";
import { stableKey } from "../src/templates/sdk/block-data/portable/contracts";
import { prepareBlocks, type BlockInstance, type RendererRegistry } from "../src/templates/sdk/block-renderer/model";
import { resolveProductsDemo, type CategorySpecimen, type ProductAvailability } from "./products-adapter";
import { productSourceSpecimen } from "./product-sources";
import { ProductCartSpecimen } from "./product-cart";
const context={scope:{websiteKey:"block-demo",instanceKey:"isolated-demo"},documentKey:"synthetic-product-study",revision:"1",viewerKey:"synthetic-public-viewer"};
const policy={enabledPlugins:["commerce"],capabilities:["viewer.authorization","reference.targetResolution"],disabledBlocks:[]};
export function ProductsDemo({instance,registry,packId}:{instance:BlockInstance;registry:RendererRegistry;packId:string}) {
 const [emptyHistory,setEmptyHistory]=useState(false);
 const [categoryState,setCategoryState]=useState<CategorySpecimen>("available");
 const [display,setDisplay]=useState<"grid"|"carousel">("grid");
 const [selection,setSelection]=useState({block:instance.name,source:"example"});
 const source=selection.block===instance.name?selection.source:"example";
 const specimen=productSourceSpecimen(instance,source);
 const [productAvailability,setProductAvailability]=useState<ProductAvailability>("instock");
 const isProduct=["blocks/product-collection","commerce/product-showcase"].includes(instance.name);
 const host=useMemo(()=>createDemoContentPageHost(),[]),tree=[instance.name==="blocks/product-collection"?{...specimen,treatment:{name:"gallery",values:{display,columns:4,aspect:"portrait"}}}:specimen],key=stableKey({tree,emptyHistory,categoryState,productAvailability});
 const [state,setState]=useState<{key:string;grant:InstalledDemoPageData}|null>(null),[failure,setFailure]=useState<string|null>(null);
 useEffect(()=>{
  let active=true;host.invalidate();setFailure(null);
  void resolveProductsDemo(tree,context.scope,policy,{emptyHistory,categoryState,productAvailability:isProduct?productAvailability:undefined}).then(envelope=>{if(active)setState({key,grant:host.install({tree,context,policy,envelope})});})
    .catch(error=>{if(active)setFailure(error instanceof Error?error.message:"Product fixture refused");});
  return()=>{active=false;host.invalidate();};
 },[host,key]);
 const content=failure?<p role="status">{failure}</p>:state?.key===key?prepareBlocks(tree,registry,policy,{media:{}},{grant:state.grant,current:context},packId):<p role="status">Preparing the product collection…</p>;
 return <div data-demo-ready={state?.key===key?"true":"false"}>
  {isProduct && <label className="specimen-note">Product source specimen <select aria-label="Product source specimen" value={source} onChange={event=>setSelection({block:instance.name,source:event.target.value})}><option value="example">Saved example</option>{(instance.name==="commerce/product-showcase"?["newest","category","sale","slugs"]:["manual","category","tag","sale","featured","recent","recentlyViewed","authored","maximum"]).map(mode=><option key={mode} value={mode}>{mode}</option>)}</select></label>}
  {instance.name==="blocks/product-collection" && <label className="specimen-note">Collection layout <select aria-label="Collection layout" value={display} onChange={event=>setDisplay(event.target.value==="carousel"?"carousel":"grid")}><option value="grid">Grid</option><option value="carousel">Carousel</option></select></label>}
  {isProduct && <label className="specimen-note">Product availability specimen <select aria-label="Product availability specimen" value={productAvailability} onChange={event=>setProductAvailability(event.target.value as ProductAvailability)}>{["instock","outofstock","onbackorder","options","external"].map(value=><option key={value} value={value}>{value}</option>)}</select></label>}
  {instance.name==="commerce/category-tiles" && <label className="specimen-note">Category specimen <select aria-label="Category specimen" value={categoryState} onChange={event=>setCategoryState(event.target.value as CategorySpecimen)}><option value="available">Available categories</option><option value="empty">No visible categories</option><option value="discovering">Discovering visible categories</option><option value="counting">Counting eligible products</option><option value="maximum">Maximum category copy</option></select></label>}
  {instance.name==="commerce/recently-viewed" && <label className="specimen-note">History specimen <select aria-label="History specimen" value={emptyHistory?"empty":"visited"} onChange={event=>setEmptyHistory(event.target.value==="empty")}><option value="visited">Visited products</option><option value="empty">Empty history</option></select></label>}
  <p className="specimen-note">{instance.name==="commerce/category-tiles"?"Synthetic category catalog · production renderer and data contract":"Synthetic product collection · production renderer and pricing contracts"}</p>
  {isProduct?<ProductCartSpecimen>{content}</ProductCartSpecimen>:content}
 </div>;
}
