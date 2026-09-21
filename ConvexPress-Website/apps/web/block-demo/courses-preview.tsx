import { useEffect, useMemo, useRef, useState } from "react";
import { createDemoContentPageHost, type InstalledDemoPageData } from "../src/templates/sdk/block-data/demo-channel";
import { parseBlockPageSearch } from "../src/templates/sdk/block-data/portable/postGridContracts";
import { stableKey } from "../src/templates/sdk/block-data/portable/contracts";
import { prepareBlocks, type BlockInstance, type RendererRegistry } from "../src/templates/sdk/block-renderer/model";
import { BlockPaginationProvider } from "../src/templates/sdk/block-renderer/pagination";
import { resolveCoursesDemo } from "./courses-adapter";
const base={scope:{websiteKey:'block-demo',instanceKey:'isolated-demo'},documentKey:'synthetic-course-grid-study',revision:'1',viewerKey:'synthetic-public-viewer'};
const policy={enabledPlugins:['lms'],capabilities:['reference.targetResolution','viewer.authorization'],disabledBlocks:[]};
const currentHref=()=>location.pathname+location.search+location.hash;
export function CoursesDemo({instance,registry,packId}:{instance:BlockInstance;registry:RendererRegistry;packId:string}) {
  const surface=useRef<HTMLDivElement>(null), moved=useRef(false);
  const host=useMemo(()=>createDemoContentPageHost(),[]);
  const [href,setHref]=useState(currentHref);
  const tree=[instance];
  const request=parseBlockPageSearch(new URL(href,'https://demo.invalid').searchParams.get('blockPages'));
  const context={...base,request},key=stableKey({tree,request});
  const [resolved,setResolved]=useState<{key:string;host:ReturnType<typeof createDemoContentPageHost>;grant:InstalledDemoPageData}|null>(null);
  const [failure,setFailure]=useState<string|null>(null);
  useEffect(()=>{const update=()=>{moved.current=true;setHref(currentHref());};window.addEventListener('popstate',update);return()=>window.removeEventListener('popstate',update);},[]);
  useEffect(()=>{
    let active=true;host.invalidate();setFailure(null);
    void resolveCoursesDemo(tree,context.scope,policy,request).then(envelope=>{
      if(active)setResolved({key,host,grant:host.install({tree,context,policy,envelope})});
    }).catch(error=>{if(active)setFailure(error instanceof Error?error.message:'Grid fixture refused');});
    return()=>{active=false;host.invalidate();};
  },[host,key]);
  useEffect(()=>{
    if(resolved?.key===key && resolved.host===host && moved.current){surface.current?.focus({preventScroll:true});moved.current=false;}
  },[resolved,key]);
  return <div ref={surface} tabIndex={-1} aria-label="Course collection" data-demo-ready={resolved?.key===key && resolved.host===host?'true':'false'} onClick={event=>{
    const target=event.target;
    const anchor=target instanceof Element?target.closest('nav[aria-label="Course pagination"] a'):null;
    if(!(anchor instanceof HTMLAnchorElement)||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
    event.preventDefault();moved.current=true;history.pushState(null,'',anchor.href);setHref(currentHref());
  }}>
    <p className="specimen-note">Synthetic course catalog · demonstration learner progress</p>
    {failure?<p role="status">{failure}</p>:resolved?.key===key && resolved.host===host?
      <BlockPaginationProvider href={href}>{prepareBlocks(tree,registry,policy,{media:{}},{grant:resolved.grant,current:context},packId)}</BlockPaginationProvider>
      :<p role="status">Preparing courses…</p>}
  </div>;
}
