import {useEffect,useMemo,useState} from "react";
import {createDemoContentPageHost,type InstalledDemoPageData} from "../src/templates/sdk/block-data/demo-channel";
import {stableKey} from "../src/templates/sdk/block-data/portable/contracts";
import {resolveRecipeDemo} from "./recipe-adapter";
import {prepareBlocks,type BlockInstance,type RendererRegistry} from "../src/templates/sdk/block-renderer/model";
const context={scope:{websiteKey:"block-demo",instanceKey:"isolated-demo"},documentKey:"synthetic-recipe-study",revision:"1",viewerKey:"synthetic-public-viewer"};
const policy={enabledPlugins:["recipes"],capabilities:["reference.targetResolution"],disabledBlocks:[]};

export function RecipeDemo({instance,registry,packId}:{instance:BlockInstance;registry:RendererRegistry;packId:string}){
 const host=useMemo(()=>createDemoContentPageHost(),[]),tree=[instance],key=stableKey(tree);
 const [state,setState]=useState<{key:string;host:ReturnType<typeof createDemoContentPageHost>;grant:InstalledDemoPageData}|null>(null),[failure,setFailure]=useState<string|null>(null);
 useEffect(()=>{let active=true;host.invalidate();setFailure(null);void resolveRecipeDemo(tree,context.scope,policy).then(envelope=>{if(active)setState({key,host,grant:host.install({tree,context,policy,envelope})});}).catch(error=>{if(active)setFailure(error instanceof Error?error.message:"Recipe specimen failed");});return()=>{active=false;host.invalidate();};},[host,key]);
 return <div data-demo-ready={state?.key===key&&state.host===host?"true":"false"}><p className="specimen-note">Synthetic recipe · production renderer and data contract</p>{failure?<p role="status">{failure}</p>:state?.key===key&&state.host===host?prepareBlocks(tree,registry,policy,{media:{}},{grant:state.grant,current:context},packId):<p role="status">Preparing the recipe…</p>}</div>;
}
