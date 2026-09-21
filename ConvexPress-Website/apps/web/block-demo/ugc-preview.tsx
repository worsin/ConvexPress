import { blockSchemas } from "../src/templates/sdk/block-data/portable/generated/schemas";
import { useEffect, useMemo, useRef, useState } from "react";
import { createDemoContentPageHost, type InstalledDemoPageData } from "../src/templates/sdk/block-data/demo-channel";
import { parseBlockPageSearch } from "../src/templates/sdk/block-data/portable/postGridContracts";
import { stableKey } from "../src/templates/sdk/block-data/portable/contracts";
import { prepareBlocks, type BlockInstance, type RendererRegistry } from "../src/templates/sdk/block-renderer/model";
import { BlockPaginationProvider } from "../src/templates/sdk/block-renderer/pagination";
import { resolveTaggedMediaDemo } from "./ugc-adapter";
const base={scope:{websiteKey:'block-demo',instanceKey:'isolated-demo'},documentKey:'synthetic-community-study',revision:'1',viewerKey:'synthetic-public-viewer'};
const policy={enabledPlugins:[],capabilities:['reference.targetResolution'],disabledBlocks:[]};
const currentHref=()=>location.pathname+location.search+location.hash;
export function UgcDemo({instance,registry,packId}:{instance:BlockInstance;registry:RendererRegistry;packId:string}) {
  const surface=useRef<HTMLDivElement>(null), moved=useRef(false);
  const host=useMemo(()=>createDemoContentPageHost(),[]);
  const [href,setHref]=useState(currentHref);
  const [scenario,setScenario]=useState("ready");
  const tree=[{...instance,attrs:{...blockSchemas["core/ugc-grid"].parse(instance.attrs),tag:scenario==="ready"?"demo-community":`demo-${scenario}`,limit:3}}];
  const request=parseBlockPageSearch(new URL(href,'https://demo.invalid').searchParams.get('blockPages'));
  const context={...base,request},key=stableKey({tree,request});
  const [resolved,setResolved]=useState<{key:string;host:ReturnType<typeof createDemoContentPageHost>;grant:InstalledDemoPageData}|null>(null);
  const [failure,setFailure]=useState<string|null>(null);
  useEffect(()=>{const update=()=>{moved.current=true;setHref(currentHref());};window.addEventListener('popstate',update);return()=>window.removeEventListener('popstate',update);},[]);
  useEffect(()=>{
    let active=true;host.invalidate();setFailure(null);
    void resolveTaggedMediaDemo(tree,context.scope,policy,request).then(envelope=>{
      if(active)setResolved({key,host,grant:host.install({tree,context,policy,envelope})});
    }).catch(error=>{if(active)setFailure(error instanceof Error?error.message:'Grid fixture refused');});
    return()=>{active=false;host.invalidate();};
  },[host,key]);
  useEffect(()=>{
    if(resolved?.key===key && resolved.host===host && moved.current){surface.current?.focus({preventScroll:true});moved.current=false;}
  },[resolved,key]);
  return <div ref={surface} tabIndex={-1} aria-label="Community image study" data-demo-ready={resolved?.key===key && resolved.host===host?'true':'false'} onClick={event=>{
    const target=event.target;
    const anchor=target instanceof Element?target.closest('nav[aria-label="Community image pagination"] a'):null;
    if(!(anchor instanceof HTMLAnchorElement)||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
    event.preventDefault();moved.current=true;history.pushState(null,'',anchor.href);setHref(currentHref());
  }}>
    <label className="specimen-note">Preview <select aria-label="Community preview scenario" value={scenario} onChange={event=>{setScenario(event.target.value);const url=new URL(location.href);url.searchParams.delete("blockPages");history.replaceState(null,"",url);setHref(currentHref());}}><option value="ready">Approved photographs</option><option value="empty">Empty collection</option><option value="unavailable">Unavailable collection</option></select></label>
    <p className="specimen-note">Original AI-generated demonstration images · fictional community showcase</p>
    {failure?<p role="status">{failure}</p>:resolved?.key===key && resolved.host===host?
      <BlockPaginationProvider href={href}>{prepareBlocks(tree,registry,policy,{media:{}},{grant:resolved.grant,current:context},packId)}</BlockPaginationProvider>
      :<p role="status">Preparing community photographs…</p>}
  </div>;
}
