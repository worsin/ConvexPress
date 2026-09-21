import { useEffect, useMemo, useState } from "react";
import { createDemoContentPageHost, type InstalledDemoPageData } from "../src/templates/sdk/block-data/demo-channel";
import { stableKey } from "../src/templates/sdk/block-data/portable/contracts";
import { blockSchemas } from "../src/templates/sdk/block-data/portable/generated/schemas";
import { prepareBlocks, type BlockInstance, type RendererRegistry } from "../src/templates/sdk/block-renderer/model";
import { compareDemoIds, resolveProductCompareDemo } from "./product-compare-adapter";
const context={scope:{websiteKey:"block-demo",instanceKey:"isolated-demo"},documentKey:"synthetic-product-comparison",revision:"1",viewerKey:"synthetic-public-viewer"};
const policy={enabledPlugins:["commerce"],capabilities:["reference.targetResolution"],disabledBlocks:[]};
export function ProductCompareDemo({instance,registry,packId}:{instance:BlockInstance;registry:RendererRegistry;packId:string}) {
  const host=useMemo(()=>createDemoContentPageHost(),[]),[scenario,setScenario]=useState("three");
  const tree=[{...instance,attrs:{...blockSchemas["commerce/product-compare"].parse(instance.attrs),products:scenario==="empty"?[]:scenario==="unavailable"?["demo-unavailable"]:scenario==="one"?compareDemoIds.slice(0,1):compareDemoIds}}];
  const key=stableKey(tree),[resolved,setResolved]=useState<{key:string;host:typeof host;grant:InstalledDemoPageData}|null>(null),[failure,setFailure]=useState<string|null>(null);
  useEffect(()=>{let active=true;host.invalidate();setFailure(null);
    void resolveProductCompareDemo(tree,context.scope,policy).then(envelope=>{if(active)setResolved({key,host,grant:host.install({tree,context,policy,envelope})});}).catch(error=>{if(active)setFailure(error instanceof Error?error.message:"Comparison fixture refused");});
    return()=>{active=false;host.invalidate();};
  },[host,key]);
  return <div aria-label="Product comparison study" data-demo-ready={resolved?.key===key&&resolved.host===host?"true":"false"}>
    <p className="specimen-note">Fictional products and prices for design testing</p>
    <label className="specimen-note">Comparison preview <select aria-label="Comparison preview scenario" value={scenario} onChange={event=>setScenario(event.target.value)} style={{minHeight:44,marginLeft:12,padding:"0 12px",color:"var(--foreground)",background:"var(--background)",border:"1px solid var(--border)",borderRadius:6}}>
      <option value="three">Three products</option><option value="one">One product</option><option value="empty">No selection</option><option value="unavailable">Unavailable selection</option>
    </select></label>
    {failure?<p role="status">{failure}</p>:resolved?.key===key&&resolved.host===host?prepareBlocks(tree,registry,policy,{media:{}},{grant:resolved.grant,current:context},packId):<p role="status">Loading comparison study…</p>}
  </div>;
}
