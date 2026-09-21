import { blockSchemas } from "../src/templates/sdk/block-data/portable/generated/schemas";
import { useEffect, useMemo, useRef, useState } from "react";
import { createDemoContentPageHost, type InstalledDemoPageData } from "../src/templates/sdk/block-data/demo-channel";
import { parseBlockPageSearch } from "../src/templates/sdk/block-data/portable/postGridContracts";
import { stableKey } from "../src/templates/sdk/block-data/portable/contracts";
import { prepareBlocks, type BlockInstance, type RendererRegistry } from "../src/templates/sdk/block-renderer/model";
import { BlockPaginationProvider } from "../src/templates/sdk/block-renderer/pagination";
import { resolveReviewsDemo, type ReviewScenario } from "./reviews-adapter";
const base={scope:{websiteKey:'block-demo',instanceKey:'isolated-demo'},documentKey:'synthetic-reviews-study',revision:'1',viewerKey:'synthetic-public-viewer'};
const policy={enabledPlugins:["commerce","commerceReviews"],capabilities:['reference.targetResolution'],disabledBlocks:[]};
const currentHref=()=>location.pathname+location.search+location.hash;
export function ReviewsDemo({instance,registry,packId}:{instance:BlockInstance;registry:RendererRegistry;packId:string}) {
  const surface=useRef<HTMLDivElement>(null), moved=useRef(false);
  const host=useMemo(()=>createDemoContentPageHost(),[]);
  const [href,setHref]=useState(currentHref);
  const [scenario,setScenario]=useState<ReviewScenario>("site");
  const tree=[{...instance,attrs:{...blockSchemas["core/reviews"].parse(instance.attrs),source:scenario==="site"||scenario==="empty"?"site":"product",product:scenario==="site"||scenario==="empty"?"":"demo-notebook"}}];
  const request=parseBlockPageSearch(new URL(href,'https://demo.invalid').searchParams.get('blockPages'));
  const context={...base,request},key=stableKey({tree,request,scenario});
  const [resolved,setResolved]=useState<{key:string;host:ReturnType<typeof createDemoContentPageHost>;grant:InstalledDemoPageData}|null>(null);
  const [failure,setFailure]=useState<string|null>(null);
  useEffect(()=>{const update=()=>{moved.current=true;setHref(currentHref());};window.addEventListener('popstate',update);return()=>window.removeEventListener('popstate',update);},[]);
  useEffect(()=>{
    let active=true;host.invalidate();setFailure(null);
    void resolveReviewsDemo(tree,context.scope,policy,request,scenario).then(envelope=>{
      if(active)setResolved({key,host,grant:host.install({tree,context,policy,envelope})});
    }).catch(error=>{if(active)setFailure(error instanceof Error?error.message:'Grid fixture refused');});
    return()=>{active=false;host.invalidate();};
  },[host,key]);
  useEffect(()=>{
    if(resolved?.key===key && resolved.host===host && moved.current){surface.current?.focus({preventScroll:true});moved.current=false;}
  },[resolved,key]);
  return <div ref={surface} tabIndex={-1} aria-label="Reviews study" data-demo-ready={resolved?.key===key && resolved.host===host?'true':'false'} onClick={event=>{
    const target=event.target;
    const anchor=target instanceof Element?target.closest('nav[aria-label="Review pagination"] a'):null;
    if(!(anchor instanceof HTMLAnchorElement)||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
    event.preventDefault();moved.current=true;history.pushState(null,'',anchor.href);setHref(currentHref());
  }}>
    <p className="specimen-note">Fictional reviews for design testing · no customer endorsements</p>
    <label className="specimen-note">Review preview <select aria-label="Review preview scenario" value={scenario} onChange={event=>{
      setScenario(event.target.value as ReviewScenario);const url=new URL(location.href);url.searchParams.delete('blockPages');history.replaceState(null,'',url);setHref(currentHref());
    }} style={{minHeight:44,marginLeft:12,padding:'0 12px',color:'var(--foreground)',background:'var(--background)',border:'1px solid var(--border)',borderRadius:6}}>
      <option value="site">Site reviews</option><option value="product">Product reviews</option><option value="pending">Rating updating</option><option value="empty">No reviews</option><option value="unavailable">Unavailable product</option>
    </select></label>
    {failure?<p role="status">{failure}</p>:resolved?.key===key && resolved.host===host?
      <BlockPaginationProvider href={href}>{prepareBlocks(tree,registry,policy,{media:{}},{grant:resolved.grant,current:context},packId)}</BlockPaginationProvider>
      :<p role="status">Loading review study…</p>}
  </div>;
}
