import { blockSchemas } from "../src/templates/sdk/block-data/portable/generated/schemas";
import { useEffect, useMemo, useRef, useState } from "react";
import { createDemoContentPageHost, type InstalledDemoPageData } from "../src/templates/sdk/block-data/demo-channel";
import { parseBlockPageSearch } from "../src/templates/sdk/block-data/portable/postGridContracts";
import { stableKey } from "../src/templates/sdk/block-data/portable/contracts";
import { prepareBlocks, type BlockInstance, type RendererRegistry } from "../src/templates/sdk/block-renderer/model";
import { BlockPaginationProvider } from "../src/templates/sdk/block-renderer/pagination";
import { resolveInstructorDemo, type InstructorSpecimen } from "./instructor-adapter";
const base={scope:{websiteKey:'block-demo',instanceKey:'isolated-demo'},documentKey:'synthetic-instructor-study',revision:'1',viewerKey:'synthetic-public-viewer'};
const policy={enabledPlugins:['lms'],capabilities:['reference.targetResolution','viewer.authorization'],disabledBlocks:[]};
const currentHref=()=>location.pathname+location.search+location.hash;
export function InstructorDemo({instance,registry,packId,portrait}:{instance:BlockInstance;registry:RendererRegistry;packId:string;portrait:string}) {
  const surface=useRef<HTMLDivElement>(null), moved=useRef(false);
  const host=useMemo(()=>createDemoContentPageHost(),[]);
  const [href,setHref]=useState(currentHref);
  const [profile,setProfile]=useState<InstructorSpecimen['profile']>('initials');
  const tree=[{...instance,attrs:{...blockSchemas["lms/instructor"].parse(instance.attrs),instructor:"demo-instructor"}}];
  const request=parseBlockPageSearch(new URL(href,'https://demo.invalid').searchParams.get('blockPages'));
  const context={...base,revision:stableKey({profile,portrait}),request},key=stableKey({tree,request,profile,portrait});
  const [resolved,setResolved]=useState<{key:string;host:ReturnType<typeof createDemoContentPageHost>;grant:InstalledDemoPageData}|null>(null);
  const [failure,setFailure]=useState<string|null>(null);
  useEffect(()=>{const update=()=>{moved.current=true;setHref(currentHref());};window.addEventListener('popstate',update);return()=>window.removeEventListener('popstate',update);},[]);
  useEffect(()=>{
    let active=true;host.invalidate();setFailure(null);
    void resolveInstructorDemo(tree,context.scope,policy,request,{profile,portrait}).then(envelope=>{
      if(active)setResolved({key,host,grant:host.install({tree,context,policy,envelope})});
    }).catch(error=>{if(active)setFailure(error instanceof Error?error.message:'Grid fixture refused');});
    return()=>{active=false;host.invalidate();};
  },[host,key]);
  useEffect(()=>{
    if(resolved?.key===key && resolved.host===host && moved.current){surface.current?.focus({preventScroll:true});moved.current=false;}
  },[resolved,key]);
  return <div ref={surface} tabIndex={-1} aria-label="Instructor study" data-demo-ready={resolved?.key===key && resolved.host===host?'true':'false'} onClick={event=>{
    const target=event.target;
    const anchor=target instanceof Element?target.closest('nav[aria-label="Instructor course pagination"] a'):null;
    if(!(anchor instanceof HTMLAnchorElement)||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
    event.preventDefault();moved.current=true;history.pushState(null,'',anchor.href);setHref(currentHref());
  }}>
    <p className="specimen-note">Fictional instructor · seven demonstration courses</p>
    <label>Instructor specimen <select aria-label="Instructor specimen" value={profile} onChange={event=>setProfile(event.target.value as InstructorSpecimen['profile'])}>
      <option value="initials">Initials and biography</option>
      <option value="portrait">Portrait and biography</option>
      <option value="minimal">Name only</option>
      <option value="unavailable">Profile unavailable</option>
    </select></label>
    {failure?<p role="status">{failure}</p>:resolved?.key===key && resolved.host===host?
      <BlockPaginationProvider href={href}>{prepareBlocks(tree,registry,policy,{media:{}},{grant:resolved.grant,current:context},packId)}</BlockPaginationProvider>
      :<p role="status">Preparing instructor…</p>}
  </div>;
}
