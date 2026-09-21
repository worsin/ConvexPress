import {useEffect,useMemo,useState} from "react";
import {createDemoContentPageHost,type InstalledDemoPageData} from "../src/templates/sdk/block-data/demo-channel";
import {stableKey} from "../src/templates/sdk/block-data/portable/contracts";
import {prepareBlocks,type BlockInstance,type RendererRegistry} from "../src/templates/sdk/block-renderer/model";
import {resolveLocaleDemo} from "./locale-adapter";
const context={scope:{websiteKey:"block-demo",instanceKey:"isolated-demo"},documentKey:"synthetic-language-study",revision:"1",viewerKey:"synthetic-public-viewer"};
const policy={enabledPlugins:[],capabilities:["locale.routing"],disabledBlocks:[]};
export function LocaleDemo({instance,registry,packId}:{instance:BlockInstance;registry:RendererRegistry;packId:string}){
 const host=useMemo(()=>createDemoContentPageHost(),[]),tree=[instance],key=stableKey(tree);
 const [resolved,setResolved]=useState<{key:string,grant:InstalledDemoPageData}|null>(null),[failure,setFailure]=useState<string|null>(null);
 useEffect(()=>{let active=true;host.invalidate();setFailure(null);void resolveLocaleDemo(tree,context.scope,policy).then(envelope=>{if(active)setResolved({key,grant:host.install({tree,context,policy,envelope})});}).catch(error=>{if(active)setFailure(error instanceof Error?error.message:"Language demonstration failed");});return()=>{active=false;host.invalidate();};},[host,key]);
 return <div data-demo-ready={resolved?.key===key?"true":"false"}><p className="specimen-note">Sample language destinations · English, Spanish and Arabic</p>{failure?<p role="status">{failure}</p>:resolved?.key===key?prepareBlocks(tree,registry,policy,{media:{}},{grant:resolved.grant,current:context},packId):<p role="status">Preparing language links…</p>}</div>;
}
