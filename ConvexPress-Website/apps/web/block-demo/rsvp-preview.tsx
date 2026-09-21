import {validateBlockAttrs} from "../src/templates/sdk/block-data/portable/generated/schemas";
import {useEffect,useMemo,useState} from "react";
import {createDemoContentPageHost,type InstalledDemoPageData} from "../src/templates/sdk/block-data/demo-channel";
import {stableKey} from "../src/templates/sdk/block-data/portable/contracts";
import {prepareBlocks,type BlockInstance,type RendererRegistry} from "../src/templates/sdk/block-renderer/model";
import {RsvpProvider,RsvpView} from "../src/templates/sdk/block-renderer/rsvp";
import type {RsvpSnapshot} from "../src/templates/sdk/block-data/portable/rsvpContracts";
import {resolveRsvpDemo} from "./rsvp-adapter";
const context={scope:{websiteKey:"block-demo",instanceKey:"isolated-demo"},documentKey:"demo-page",revision:"1",viewerKey:"synthetic-public-viewer"};
const policy={enabledPlugins:["events","forms"],capabilities:["form.submission","reference.targetResolution"],disabledBlocks:[]};
function InteractiveSample({initial}:{initial:RsvpSnapshot}){
 const [snapshot,setSnapshot]=useState(initial);
 return <RsvpView snapshot={snapshot} onRegister={async contact=>setSnapshot(current=>({...current,registration:{...contact,status:"confirmed",revision:(current.registration?.revision??0)+1},canCancel:true,remaining:Math.max(0,(current.remaining??0)-1)}))} onCancel={async()=>setSnapshot(current=>({...current,registration:current.registration?{...current.registration,status:"cancelled",revision:current.registration.revision+1}:null,canCancel:false,remaining:(current.remaining??0)+1}))}/>;
}
export function RsvpDemo({instance,registry,packId}:{instance:BlockInstance;registry:RendererRegistry;packId:string}){
 const host=useMemo(()=>createDemoContentPageHost(),[]),tree=[{...instance,attrs:{...validateBlockAttrs("core/event-rsvp",instance.attrs),event:"demo-studio-gathering"}}],key=stableKey(tree);
 const [resolved,setResolved]=useState<{key:string;grant:InstalledDemoPageData}|null>(null),[failure,setFailure]=useState<string|null>(null);
 useEffect(()=>{let active=true;host.invalidate();void resolveRsvpDemo(tree,context.scope,policy).then(envelope=>{if(active)setResolved({key,grant:host.install({tree,context,policy,envelope})});}).catch(()=>{if(active)setFailure("The RSVP sample could not be loaded.");});return()=>{active=false;host.invalidate();};},[host,key]);
 return <div data-demo-ready={resolved?.key===key?"true":"false"}><p className="specimen-note">Interactive sample · registrations stay in this preview and are not sent</p>{failure?<p role="status">{failure}</p>:resolved?.key===key?<RsvpProvider value={{render:initial=><InteractiveSample key={`${packId}:${key}`} initial={initial}/>}}>{prepareBlocks(tree,registry,policy,{media:{}},{grant:resolved.grant,current:context},packId)}</RsvpProvider>:<p role="status">Preparing event invitation…</p>}</div>;
}
