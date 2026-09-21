import {SEARCH_QUERY_REQUEST_KEY} from "../src/templates/sdk/block-data/portable/searchContracts";
import {blockSchemas} from "../src/templates/sdk/block-data/portable/generated/schemas";
import {useEffect,useMemo,useState} from "react";
import {createDemoContentPageHost,type InstalledDemoPageData} from "../src/templates/sdk/block-data/demo-channel";
import {stableKey} from "../src/templates/sdk/block-data/portable/contracts";
import {parseBlockPageSearch} from "../src/templates/sdk/block-data/portable/postGridContracts";
import {prepareBlocks,type BlockInstance,type RendererRegistry} from "../src/templates/sdk/block-renderer/model";
import {BlockPaginationProvider} from "../src/templates/sdk/block-renderer/pagination";
import {resolveSearchDemo} from "./search-adapter";
const base={scope:{websiteKey:"block-demo",instanceKey:"isolated-demo"},documentKey:"synthetic-search",revision:"1",viewerKey:"synthetic-public-viewer"};
const policy={enabledPlugins:[],capabilities:[],disabledBlocks:[]};
export function SearchDemo({instance,registry,packId}:{instance:BlockInstance;registry:RendererRegistry;packId:string}){
 const host=useMemo(()=>createDemoContentPageHost(),[]),[query,setQuery]=useState("orchid"),[cursor,setCursor]=useState<string|null>(null);
 const request={...(query?{[SEARCH_QUERY_REQUEST_KEY]:query}:{}),...(cursor?{[instance.id]:cursor}:{})},context={...base,request},tree=[{...instance,attrs:{...blockSchemas["core/search-results"].parse(instance.attrs),pageSize:3}}],key=stableKey({tree,request});
 const [resolved,setResolved]=useState<{key:string;grant:InstalledDemoPageData}|null>(null),[failure,setFailure]=useState<string|null>(null);
 useEffect(()=>{let active=true;host.invalidate();setFailure(null);void resolveSearchDemo(tree,base.scope,policy,request).then(envelope=>{if(active)setResolved({key,grant:host.install({tree,context,policy,envelope})});}).catch(error=>{if(active)setFailure(error.message);});return()=>{active=false;host.invalidate();};},[host,key]);
 const href=`/?q=${encodeURIComponent(query)}${cursor?`&blockPages=${encodeURIComponent(JSON.stringify({[instance.id]:cursor}))}`:""}`;
 return <div aria-label="Search results study" data-demo-ready={resolved?.key===key?"true":"false"} onSubmit={event=>{const form=event.target;if(!(form instanceof HTMLFormElement))return;event.preventDefault();setQuery(String(new FormData(form).get("q")??"").trim());setCursor(null);}} onClick={event=>{
  const target=event.target instanceof Element?event.target.closest('nav[aria-label="Search results pagination"] a'):null;
  if(!(target instanceof HTMLAnchorElement)||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();setCursor(parseBlockPageSearch(new URL(target.href).searchParams.get("blockPages"))[instance.id]??null);
 }}><p className="specimen-note">Fictional search results · no content or accounts are created</p><label className="specimen-note">Search preview <select aria-label="Search preview scenario" value={query===""?"idle":query==="zzzz"?"empty":"ready"} onChange={event=>{setQuery(event.target.value==="idle"?"":event.target.value==="empty"?"zzzz":"orchid");setCursor(null);}}><option value="ready">Results</option><option value="empty">No matches</option><option value="idle">Before searching</option></select></label>
  {failure?<p role="status">{failure}</p>:resolved?.key===key?<BlockPaginationProvider href={href}>{prepareBlocks(tree,registry,policy,{media:{}},{grant:resolved.grant,current:context},packId)}</BlockPaginationProvider>:<p role="status">Preparing search…</p>}
 </div>;
}
