import {test,expect} from "bun:test";
import {renderToStaticMarkup} from "react-dom/server";
import ugcBlock from "../../../../../../../blocks/core/ugc-grid/render";
import {prepareBlocks} from "./model";
import {BlockPaginationProvider} from "./pagination";
import {createDemoContentPageHost} from "../block-data/demo-channel";
import {resolveCanonicalData} from "../block-data/portable/resolve";
import {planCanonicalData} from "../block-data/portable/planner";
import {taggedMediaResultSchema,type TaggedMediaResult} from "../block-data/portable/taggedMediaContracts";
const policy={enabledPlugins:[],capabilities:["reference.targetResolution"],disabledBlocks:[]};
const current={scope:{websiteKey:"community",instanceKey:"test"},documentKey:"page",revision:"1",viewerKey:"visitor"};
const tree=[{id:"community",name:"core/ugc-grid",version:1,attrs:{tag:"tag-1",limit:3}}];
const data:TaggedMediaResult={tag:{id:"tag-1",name:"<Coast & sky>"},items:[{id:"photo-1",image:{src:"/photo.jpg",alt:"Coastal sky",mimeType:"image/jpeg"},caption:"A <quiet> morning",credit:"Studio & friends",creditUrl:"https://example.com/studio"}],cursor:null,nextCursor:"page-2"};
async function install(result:TaggedMediaResult){
 const params:Parameters<typeof resolveCanonicalData>=[tree,current.scope,policy,async()=>null];params[41]=async()=>result;
 const envelope=await resolveCanonicalData(...params),host=createDemoContentPageHost(),grant=host.install({tree,context:current,policy,envelope});
 return {host,render:(context=current)=>renderToStaticMarkup(<BlockPaginationProvider href="/story">{prepareBlocks(tree,{"core/ugc-grid":ugcBlock},policy,{media:{}},{grant,current:context})}</BlockPaginationProvider>)};
}
test("community pagination binds the exact tag and block without requiring an unrelated plugin",()=>{
 expect(planCanonicalData(tree,current.scope,policy,{community:"next"}).jobs[0]?.args).toEqual({tag:"tag-1",limit:3,cursor:"next"});
 expect(()=>planCanonicalData(tree,current.scope,{...policy,capabilities:[]})).toThrow();
 expect(()=>planCanonicalData(tree,current.scope,policy,{unknown:"next"})).toThrow();
});
test("community renders escaped public captions, accessible lightbox controls and pagination",async()=>{
 const {render}=await install(data),html=render();expect(html).toContain("&lt;Coast &amp; sky&gt;");expect(html).toContain("A &lt;quiet&gt; morning");expect(html).toContain("Studio &amp; friends");expect(html).toContain('rel="noopener noreferrer"');expect(html).toContain('aria-label="View photograph: Coastal sky"');expect(html).toContain('aria-label="Community image pagination"');expect(html).toContain('aria-label="Close photograph"');expect(html).toContain("More moments");expect(html).not.toContain("mimeType");
});
test("community rejects substituted scope data, non-advancing cursors and private approval fields",async()=>{
 for(const result of [{...data,tag:{...data.tag!,id:"other"}},{...data,cursor:"other"},{...data,items:Array.from({length:4},(_,i)=>({...data.items[0],id:`image-${i}`}))}])await expect(install(result)).rejects.toThrow();
 for(const result of [{...data,tag:null},{...data,cursor:"same",nextCursor:"same"},{...data,items:[data.items[0],data.items[0]]},{...data,items:[{...data.items[0],permissionNote:"private"}]}])expect(()=>taggedMediaResultSchema.parse(result)).toThrow();
 for(const creditUrl of ["javascript:alert(1)","http://example.com","https://user:password@example.com"])
 expect(()=>taggedMediaResultSchema.parse({...data,items:[{...data.items[0],creditUrl}]})).toThrow();
 expect(()=>taggedMediaResultSchema.parse({...data,items:[{...data.items[0],image:{src:"javascript:alert(1)",alt:"unsafe"}}]})).toThrow();
});
test("community withdrawal and changed viewer invalidate previously installed images",async()=>{
 const {host,render}=await install(data);expect(()=>render({...current,viewerKey:"another"})).toThrow();host.invalidate();expect(()=>render()).toThrow();
 const hidden=await install({tag:null,items:[],cursor:null,nextCursor:null});expect(hidden.render()).toContain("not available");expect(hidden.render()).not.toContain("photo.jpg");
 const empty=await install({...data,items:[],nextCursor:null});expect(empty.render()).toContain("The next moment is still to come.");
});
