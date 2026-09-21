import {useEffect,useMemo,useState} from "react";
import {createDemoContentPageHost,type InstalledDemoPageData} from "../src/templates/sdk/block-data/demo-channel";
import {stableKey} from "../src/templates/sdk/block-data/portable/contracts";
import {resolveShippingPolicyDemo} from "./shipping-policy-adapter";
import {prepareBlocks,type BlockInstance,type RendererRegistry} from "../src/templates/sdk/block-renderer/model";
const context={scope:{websiteKey:"block-demo",instanceKey:"isolated-demo"},documentKey:"synthetic-shipping-study",revision:"1",viewerKey:"synthetic-public-viewer"};
const policy={enabledPlugins:["commerce"],capabilities:["viewer.authorization"],disabledBlocks:[]};

export function ShippingPolicyDemo({instance,registry,packId}:{instance:BlockInstance;registry:RendererRegistry;packId:string}){
 const host=useMemo(()=>createDemoContentPageHost(),[]),tree=[instance],key=stableKey(tree);
 const [state,setState]=useState<{key:string;host:ReturnType<typeof createDemoContentPageHost>;grant:InstalledDemoPageData}|null>(null),[failure,setFailure]=useState<string|null>(null);
 useEffect(()=>{let active=true;host.invalidate();setFailure(null);void resolveShippingPolicyDemo(tree,context.scope,policy).then(envelope=>{if(active)setState({key,host,grant:host.install({tree,context,policy,envelope})});}).catch(error=>{if(active)setFailure(error instanceof Error?error.message:"Policy specimen failed");});return()=>{active=false;host.invalidate();};},[host,key]);
 return <div data-demo-ready={state?.key===key&&state.host===host?"true":"false"}><p className="specimen-note">Synthetic store policies · production renderer and data contract</p>{failure?<p role="status">{failure}</p>:state?.key===key&&state.host===host?prepareBlocks(tree,registry,policy,{media:{}},{grant:state.grant,current:context},packId):<p role="status">Preparing store policies…</p>}</div>;
}
