import {useEffect,useMemo,useState} from "react";
import {blockSchemas} from "../src/templates/sdk/block-data/portable/generated/schemas";
import {resolveSocialFeedDemo} from "./social-feed-adapter";
import {createDemoContentPageHost,type InstalledDemoPageData} from "../src/templates/sdk/block-data/demo-channel";
import {stableKey} from "../src/templates/sdk/block-data/portable/contracts";
import {prepareBlocks,type BlockInstance,type RendererRegistry} from "../src/templates/sdk/block-renderer/model";
import {SocialMediaContext} from "../src/templates/sdk/block-renderer/social-media";
import ceramics from "./assets/community-ceramics.png";
import vase from "./assets/community-vase.png";
import workshop from "./assets/community-workshop.png";
const media=Object.fromEntries([ceramics,vase,workshop].map((url,i)=>[`https://media.example.com/social-demo-${i+1}.png`,url]));
const base={scope:{websiteKey:"block-demo",instanceKey:"isolated-demo"},documentKey:"social-feed-study",revision:"1",viewerKey:"synthetic-public-viewer",request:{}};
const policy={enabledPlugins:[],capabilities:["feed.approvedProvider"],disabledBlocks:[]};
export function SocialFeedDemo({instance,registry,packId}:{instance:BlockInstance;registry:RendererRegistry;packId:string}){
 const host=useMemo(()=>createDemoContentPageHost(),[]),[scenario,setScenario]=useState("ready");
 const tree=[{...instance,attrs:{...blockSchemas["core/social-feed"].parse(instance.attrs),provider:"mastodon",handle:"fieldwork@social.example.com",limit:3}}];
 const key=stableKey({tree,scenario}),[loaded,setLoaded]=useState<{key:string;grant:InstalledDemoPageData}|null>(null),[error,setError]=useState("");
 useEffect(()=>{let active=true;host.invalidate();setError("");void resolveSocialFeedDemo(tree,base.scope,policy,scenario).then(envelope=>{if(active)setLoaded({key,grant:host.install({tree,context:base,policy,envelope})});}).catch(reason=>{if(active)setError(reason instanceof Error?reason.message:"Preview failed");});return()=>{active=false;host.invalidate();};},[key,host]);
 return <div data-demo-ready={loaded?.key===key?"true":"false"} aria-label="Social feed study"><label className="specimen-note">Preview <select aria-label="Social feed preview scenario" value={scenario} onChange={event=>setScenario(event.target.value)}><option value="ready">Public posts</option><option value="empty">Empty feed</option><option value="unavailable">Unavailable feed</option></select></label><p className="specimen-note">Fictional account and posts. Original AI-generated studio photographs, served locally. No social provider is contacted.</p>{error?<p role="alert">{error}</p>:loaded?.key===key?<SocialMediaContext.Provider value={media}>{prepareBlocks(tree,registry,policy,{media:{}},{grant:loaded.grant,current:base},packId)}</SocialMediaContext.Provider>:<p role="status">Preparing the feed…</p>}</div>;
}
