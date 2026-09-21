import {useEffect,useMemo,useState} from "react";
import {blockSchemas} from "../src/templates/sdk/block-data/portable/generated/schemas";
import {resolveLeadMagnetDemo,sampleGuide} from "./lead-magnet-adapter";
import {createDemoContentPageHost,type InstalledDemoPageData} from "../src/templates/sdk/block-data/demo-channel";
import {stableKey} from "../src/templates/sdk/block-data/portable/contracts";
import {prepareBlocks,type BlockInstance,type RendererRegistry} from "../src/templates/sdk/block-renderer/model";
import {LeadMagnetProvider,type LeadMagnetHost} from "../src/templates/sdk/block-renderer/lead-magnet";
const base={scope:{websiteKey:"block-demo",instanceKey:"isolated-demo"},documentKey:"lead-magnet-study",revision:"1",viewerKey:"synthetic-public-viewer",request:{}};
const policy={enabledPlugins:["forms"],capabilities:["reference.targetResolution","form.submission"],disabledBlocks:[]};
export function LeadMagnetDemo({instance,registry,packId}:{instance:BlockInstance;registry:RendererRegistry;packId:string}){
 const host=useMemo(()=>createDemoContentPageHost(),[]),[scenario,setScenario]=useState("ready");
 const tree=[{...instance,attrs:{...blockSchemas["core/lead-magnet"].parse(instance.attrs),file:{id:"demo-guide"},list:"demo-readers",media:undefined}}];
 // Optional properties are omitted from canonical storage, never serialized as undefined.
 delete tree[0].attrs.media;
 const key=stableKey({tree,scenario}),[loaded,setLoaded]=useState<{key:string;grant:InstalledDemoPageData}|null>(null),[error,setError]=useState("");
 useEffect(()=>{let active=true;host.invalidate();setError("");void resolveLeadMagnetDemo(tree,base.scope,policy,scenario).then(envelope=>{if(active)setLoaded({key,grant:host.install({tree,context:base,policy,envelope})});}).catch(reason=>{if(active)setError(reason instanceof Error?reason.message:"Preview failed");});return()=>{active=false;host.invalidate();};
 },[key,host]);
 const interactions:LeadMagnetHost={live:true,available:true,submit:async offer=>{if(scenario==="error")throw Error("Demonstration: the request failed. Change the preview to Ready to try again.");return {id:"demo-guide-receipt",fileName:offer.file.name,expiresAt:Date.now()+900000};},download:async receipt=>{const url=URL.createObjectURL(new Blob([sampleGuide],{type:"text/plain"}));const link=document.createElement("a");link.href=url;link.download=receipt.fileName;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);},unsubscribe:async()=>{}};
 return <div data-demo-ready={loaded?.key===key?"true":"false"} aria-label="Lead magnet study"><label className="specimen-note">Preview <select aria-label="Lead magnet preview scenario" value={scenario} onChange={event=>setScenario(event.target.value)}><option value="ready">Ready</option><option value="error">Request error</option><option value="unavailable">Unavailable</option></select></label><p className="specimen-note" id="demo-privacy">Interactive demonstration. No email is stored or sent; the download is an original sample text file.</p>{error?<p role="alert">{error}</p>:loaded?.key===key?<LeadMagnetProvider key={key} value={interactions}>{prepareBlocks(tree,registry,policy,{media:{}},{grant:loaded.grant,current:base},packId)}</LeadMagnetProvider>:<p role="status">Preparing the guide…</p>}</div>;
}
