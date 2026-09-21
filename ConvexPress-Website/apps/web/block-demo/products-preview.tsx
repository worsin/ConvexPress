import { useEffect, useMemo, useState } from "react";
import { createDemoContentPageHost, type InstalledDemoPageData } from "../src/templates/sdk/block-data/demo-channel";
import { stableKey } from "../src/templates/sdk/block-data/portable/contracts";
import { prepareBlocks, type BlockInstance, type RendererRegistry } from "../src/templates/sdk/block-renderer/model";
import { resolveProductsDemo } from "./products-adapter";
const context={scope:{websiteKey:"block-demo",instanceKey:"isolated-demo"},documentKey:"synthetic-product-study",revision:"1",viewerKey:"synthetic-public-viewer"};
const policy={enabledPlugins:["commerce"],capabilities:["viewer.authorization","reference.targetResolution"],disabledBlocks:[]};
export function ProductsDemo({instance,registry,packId}:{instance:BlockInstance;registry:RendererRegistry;packId:string}) {
 const [emptyHistory,setEmptyHistory]=useState(false);
 const [emptyCategories,setEmptyCategories]=useState(false);
 const [display,setDisplay]=useState<"grid"|"carousel">("grid");
 const host=useMemo(()=>createDemoContentPageHost(),[]),tree=[instance.name==="blocks/product-collection"?{...instance,treatment:{name:"gallery",values:{display,columns:4,aspect:"portrait"}}}:instance],key=stableKey({tree,emptyHistory,emptyCategories});
 const [state,setState]=useState<{key:string;grant:InstalledDemoPageData}|null>(null),[failure,setFailure]=useState<string|null>(null);
 useEffect(()=>{
  let active=true;host.invalidate();setFailure(null);
  void resolveProductsDemo(tree,context.scope,policy,{emptyHistory,emptyCategories}).then(envelope=>{if(active)setState({key,grant:host.install({tree,context,policy,envelope})});})
    .catch(error=>{if(active)setFailure(error instanceof Error?error.message:"Product fixture refused");});
  return()=>{active=false;host.invalidate();};
 },[host,key]);
 return <div data-demo-ready={state?.key===key?"true":"false"}>
  {instance.name==="blocks/product-collection" && <label className="specimen-note">Collection layout <select aria-label="Collection layout" value={display} onChange={event=>setDisplay(event.target.value==="carousel"?"carousel":"grid")}><option value="grid">Grid</option><option value="carousel">Carousel</option></select></label>}
  {instance.name==="commerce/category-tiles" && <label className="specimen-note">Category specimen <select aria-label="Category specimen" value={emptyCategories?"empty":"available"} onChange={event=>setEmptyCategories(event.target.value==="empty")}><option value="available">Available categories</option><option value="empty">No visible categories</option></select></label>}
  {instance.name==="commerce/recently-viewed" && <label className="specimen-note">History specimen <select aria-label="History specimen" value={emptyHistory?"empty":"visited"} onChange={event=>setEmptyHistory(event.target.value==="empty")}><option value="visited">Visited products</option><option value="empty">Empty history</option></select></label>}
  <p className="specimen-note">{instance.name==="commerce/category-tiles"?"Synthetic category catalog · production renderer and data contract":"Synthetic product collection · production renderer and pricing contracts"}</p>
  {failure?<p role="status">{failure}</p>:state?.key===key?prepareBlocks(tree,registry,policy,{media:{}},{grant:state.grant,current:context},packId):<p role="status">Preparing the product collection…</p>}
 </div>;
}
