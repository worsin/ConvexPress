import {useEffect,useMemo,useState} from 'react';
import {createDemoContentPageHost,type InstalledDemoPageData} from '../src/templates/sdk/block-data/demo-channel';
import {resolveAuthorDemo} from './author-adapter';
import {stableKey} from '../src/templates/sdk/block-data/portable/contracts';
import {prepareBlocks,type BlockInstance,type RendererRegistry,type RenderResources} from '../src/templates/sdk/block-renderer/model';
const context={scope:{websiteKey:'block-demo',instanceKey:'isolated-demo'},documentKey:'synthetic-author-study',revision:'1',viewerKey:'synthetic-public-viewer'};
const policy={enabledPlugins:[],capabilities:['reference.targetResolution'],disabledBlocks:[]};
export function AuthorDemo({instance,registry,packId,resources,portrait}:{instance:BlockInstance;registry:RendererRegistry;packId:string;resources:RenderResources;portrait:string}){
 const host=useMemo(()=>createDemoContentPageHost(),[]),tree=[instance],key=stableKey({tree,portrait});
 const [resolved,setResolved]=useState<{key:string;grant:InstalledDemoPageData}|null>(null),[error,setError]=useState<string|null>(null);
 useEffect(()=>{let active=true;host.invalidate();setError(null);
  void resolveAuthorDemo(tree,context.scope,policy,portrait).then(envelope=>{if(active)setResolved({key,grant:host.install({tree,context,policy,envelope})});}).catch(error=>{if(active)setError(error instanceof Error?error.message:'Author preview unavailable');});
  return()=>{active=false;host.invalidate();};
 },[host,key]);
 return <div data-demo-ready={resolved?.key===key?'true':'false'}><p className="specimen-note">Fictional author profile · sample data</p>{error?<p role="status">{error}</p>:resolved?.key===key?prepareBlocks(tree,registry,policy,resources,{grant:resolved.grant,current:context},packId):<p role="status">Preparing author…</p>}</div>;
}
