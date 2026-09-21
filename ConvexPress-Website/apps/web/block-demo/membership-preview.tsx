import {useEffect,useMemo,useState} from "react";
import {createDemoContentPageHost,type InstalledDemoPageData} from "../src/templates/sdk/block-data/demo-channel";
import {stableKey} from "../src/templates/sdk/block-data/portable/contracts";
import {resolveMembershipDemo} from "./membership-adapter";
import {prepareBlocks,type BlockInstance,type RendererRegistry} from "../src/templates/sdk/block-renderer/model";
import type {MembershipAccessResult} from "../src/templates/sdk/block-data/portable/membershipContracts";
const policy={enabledPlugins:['membership'],capabilities:['viewer.authorization','reference.targetResolution'],disabledBlocks:[]};
export function MembershipDemo({instance,registry,packId}:{instance:BlockInstance;registry:RendererRegistry;packId:string}){
 const [viewer,setViewer]=useState<MembershipAccessResult['state']>('signed-out');
 const context={scope:{websiteKey:'block-demo',instanceKey:'isolated-demo'},documentKey:'synthetic-membership-study',revision:'1',viewerKey:'synthetic-'+viewer};
 const host=useMemo(()=>createDemoContentPageHost(),[]),tree=[instance],key=stableKey({tree,viewer});
 const [result,setResult]=useState<{key:string;host:ReturnType<typeof createDemoContentPageHost>;grant:InstalledDemoPageData}|null>(null),[failure,setFailure]=useState<string|null>(null);
 useEffect(()=>{let active=true;host.invalidate();setFailure(null);void resolveMembershipDemo(tree,context.scope,policy,viewer).then(envelope=>{if(active)setResult({key,host,grant:host.install({tree,context,policy,envelope})});}).catch(error=>{if(active)setFailure(String(error));});return()=>{active=false;host.invalidate();};},[host,key]);
 return <div data-demo-ready={result?.key===key&&result.host===host?'true':'false'}><p className="specimen-note">Synthetic membership specimen · no authenticated session</p>
 <label>Membership specimen <select aria-label="Membership specimen" value={viewer} onChange={event=>setViewer(event.target.value as MembershipAccessResult['state'])}><option value="signed-out">Signed out</option><option value="missing-plan">Signed in, without this plan</option><option value="granted">Active member</option><option value="unavailable">Plan withdrawn</option></select></label>
 {failure?<p role="status">{failure}</p>:result?.key===key&&result.host===host?prepareBlocks(tree,registry,policy,{media:{}},{grant:result.grant,current:context},packId):<p role="status">Preparing membership…</p>}</div>;
}
