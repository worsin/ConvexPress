import { useEffect, useMemo, useRef, useState } from "react";
import { createDemoContentPageHost, type InstalledDemoPageData } from "../src/templates/sdk/block-data/demo-channel";
import { parseBlockPageSearch } from "../src/templates/sdk/block-data/portable/postGridContracts";
import { stableKey } from "../src/templates/sdk/block-data/portable/contracts";
import { prepareBlocks, type BlockInstance, type RendererRegistry } from "../src/templates/sdk/block-renderer/model";
import { BlockPaginationProvider } from "../src/templates/sdk/block-renderer/pagination";
import { resolveUpcomingEventsDemo } from "./events-adapter";
const base={scope:{websiteKey:'block-demo',instanceKey:'isolated-demo'},documentKey:'synthetic-events-study',revision:'1',viewerKey:'synthetic-public-viewer'};
const policy={enabledPlugins:['events'],capabilities:['reference.targetResolution'],disabledBlocks:[]};
const currentHref=()=>location.pathname+location.search+location.hash;
export function UpcomingEventsDemo({instance,registry}:{instance:BlockInstance;registry:RendererRegistry}) {
  const surface=useRef<HTMLDivElement>(null), moved=useRef(false);
  const host=useMemo(()=>createDemoContentPageHost(),[]);
  const [href,setHref]=useState(currentHref);
  const tree=[instance];
  const request=parseBlockPageSearch(new URL(href,'https://demo.invalid').searchParams.get('blockPages'));
  const context={...base,request},key=stableKey({tree,request});
  const [resolved,setResolved]=useState<{key:string;grant:InstalledDemoPageData}|null>(null);
  const [failure,setFailure]=useState<string|null>(null);
  useEffect(()=>{const update=()=>{moved.current=true;setHref(currentHref());};window.addEventListener('popstate',update);return()=>window.removeEventListener('popstate',update);},[]);
  useEffect(()=>{
    let active=true;host.invalidate();setFailure(null);
    void resolveUpcomingEventsDemo(tree,context.scope,policy,request).then(envelope=>{
      if(active)setResolved({key,grant:host.install({tree,context,policy,envelope})});
    }).catch(error=>{if(active)setFailure(error instanceof Error?error.message:'Event fixture refused');});
    return()=>{active=false;host.invalidate();};
  },[host,key]);
  useEffect(()=>{
    if(resolved?.key===key && moved.current){surface.current?.focus({preventScroll:true});moved.current=false;}
  },[resolved,key]);
  return <div ref={surface} tabIndex={-1} aria-label="Event collection" data-demo-ready={resolved?.key===key?'true':'false'} onClick={event=>{
    const target=event.target;
    const anchor=target instanceof Element?target.closest('nav[aria-label^="Calendar"] a'):null;
    if(!(anchor instanceof HTMLAnchorElement)||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
    event.preventDefault();moved.current=true;history.pushState(null,'',anchor.href);setHref(currentHref());
  }}>
    <p className="specimen-note">Synthetic gatherings · production event renderer and navigation contracts</p>
    {failure?<p role="status">{failure}</p>:resolved?.key===key?
      <BlockPaginationProvider href={href}>{prepareBlocks(tree,registry,policy,{media:{}},{grant:resolved.grant,current:context})}</BlockPaginationProvider>
      :<p role="status">Preparing the event study…</p>}
  </div>;
}
