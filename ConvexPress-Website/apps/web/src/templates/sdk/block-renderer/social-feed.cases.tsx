import {test,expect} from "bun:test";
import {renderToStaticMarkup} from "react-dom/server";
import socialBlock from "../../../../../../../blocks/core/social-feed/render";
import {prepareBlocks} from "./model";
import {createDemoContentPageHost} from "../block-data/demo-channel";
import {resolveCanonicalData,validateCanonicalData} from "../block-data/portable/resolve";
import {planCanonicalData} from "../block-data/portable/planner";
import type {SocialFeedResult} from "../block-data/portable/socialFeedContracts";
const policy={enabledPlugins:[],capabilities:["feed.approvedProvider"],disabledBlocks:[]};
const current={scope:{websiteKey:"social",instanceKey:"test"},documentKey:"page",revision:"1",viewerKey:"visitor"};
const tree=[{id:"social",name:"core/social-feed",version:1,attrs:{provider:"mastodon",handle:"studio@social.example.com",limit:3}}];
const data:SocialFeedResult={provider:"mastodon",handle:"studio@social.example.com",status:"ready",profile:{handle:"studio@social.example.com",name:"<Studio & friends>",url:"https://social.example.com/@studio"},items:[{id:"1",url:"https://social.example.com/@studio/1",text:"<script>alert(1)</script> A quiet morning.",publishedAt:1789344000000,image:{url:"https://media.example.com/photo.jpg",alt:"Morning light",width:1000,height:800}}],refreshedAt:Date.now(),expiresAt:Date.now()+900000};
async function install(result:SocialFeedResult){
 const params:Parameters<typeof resolveCanonicalData>=[tree,current.scope,policy,async()=>null];params[43]=async()=>result;
 const envelope=await resolveCanonicalData(...params),host=createDemoContentPageHost(),grant=host.install({tree,context:current,policy,envelope});
 return {host,envelope,render:(context=current)=>renderToStaticMarkup(prepareBlocks(tree,{"core/social-feed":socialBlock},policy,{media:{}},{grant,current:context}))};
}
test("social planner requires provider capability and a trusted cache reader",async()=>{
 expect(planCanonicalData(tree,current.scope,policy).jobs[0]?.args).toEqual(tree[0]!.attrs);
 expect(()=>planCanonicalData(tree,current.scope,{...policy,capabilities:[]})).toThrow();
 await expect(resolveCanonicalData(tree,current.scope,policy,async()=>null)).rejects.toThrow("Trusted social feed reader");
});
test("social rendering escapes post HTML and does not load provider images on render",async()=>{
 const {render}=await install(data),html=render();
 expect(html).toContain("&lt;Studio &amp; friends&gt;");expect(html).toContain("&lt;script&gt;");expect(html).not.toContain("<script>");expect(html).not.toContain("<img");expect(html).not.toContain("media.example.com");expect(html).toContain("Load photographs");expect(html).toContain('rel="noopener noreferrer"');expect(html).toContain("Sep 14, 2026");expect(html).not.toContain("access_token");
});
test("social rejects substituted account, count, provider and private transport fields",async()=>{
 for(const result of [{...data,handle:"other@social.example.com"},{...data,provider:"instagram" as const},{...data,profile:{...data.profile!,handle:"other@social.example.com"}},{...data,items:[{...data.items[0]!,url:"https://social.example.com/@other/1"}]},{...data,items:Array.from({length:4},(_,i)=>({...data.items[0]!,id:String(i+1),url:`https://social.example.com/@studio/${i+1}`}))},{...data,accessToken:"private"}])await expect(install(result)).rejects.toThrow();
 const {envelope}=await install(data);const forged=structuredClone(envelope);forged.dataByBlock.social!.data={...data,handle:"other@social.example.com"};
 expect(()=>validateCanonicalData(tree,current.scope,policy,forged)).toThrow();
});
test("social empty and unavailable feeds differ and withdrawn grants stop rendering posts",async()=>{
 expect((await install({...data,items:[]})).render()).toContain("No public posts to share just yet.");
 expect((await install({...data,status:"unavailable",profile:null,items:[],refreshedAt:null,expiresAt:null})).render()).toContain("This feed is not available right now.");
 const {host,render}=await install(data);expect(()=>render({...current,viewerKey:"other"})).toThrow();host.invalidate();expect(()=>render()).toThrow();
});
