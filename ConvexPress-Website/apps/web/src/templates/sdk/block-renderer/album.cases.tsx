import { test, expect } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import albumBlock from "../../../../../../../blocks/gallery/album/render";
import { prepareBlocks } from "./model";
import { BlockPaginationProvider } from "./pagination";
import { createDemoContentPageHost } from "../block-data/demo-channel";
import { resolveCanonicalData } from "../block-data/portable/resolve";
import { planCanonicalData } from "../block-data/portable/planner";
import { albumResultSchema, type AlbumResult } from "../block-data/portable/albumContracts";
const policy={enabledPlugins:["gallery"],capabilities:["reference.targetResolution"],disabledBlocks:[]};
const current={scope:{websiteKey:"album",instanceKey:"test"},documentKey:"page",revision:"1",viewerKey:"visitor"};
const tree=[{id:"album-block",name:"gallery/album",version:1,attrs:{album:"album-1"}}];
const data:AlbumResult={album:{id:"album-1",title:"<Coast & sky>",slug:"coast",href:"/gallery/coast",description:"An album.",lightboxEnabled:true,downloadEnabled:false,captionsEnabled:true},items:[{id:"photo-1",image:{src:"/photo.jpg",alt:"Coastal sky"},caption:"A quiet morning",href:null}],cursor:null,nextCursor:"page-2"};
async function install(result:AlbumResult) {
  const parameters:Parameters<typeof resolveCanonicalData>=[tree,current.scope,policy,async()=>null];parameters[31]=async()=>result;
  const envelope=await resolveCanonicalData(...parameters),host=createDemoContentPageHost(),grant=host.install({tree,context:current,policy,envelope});
  return {host,render:(context=current)=>renderToStaticMarkup(<BlockPaginationProvider href="/story">{prepareBlocks(tree,{"gallery/album":albumBlock},policy,{media:{}},{grant,current:context})}</BlockPaginationProvider>)};
}
test("album bindings require the real gallery plugin and preserve visitor pagination",()=>{
  expect(planCanonicalData(tree,current.scope,policy,{"album-block":"next"}).jobs[0]?.args).toEqual({album:"album-1",cursor:"next"});
  expect(()=>planCanonicalData(tree,current.scope,{...policy,enabledPlugins:[]})).toThrow();
  expect(()=>planCanonicalData(tree,current.scope,policy,{"other":"next"})).toThrow();
});
test("album renders escaped captions, named lightbox controls and real page links",async()=>{
  const {render}=await install(data);const html=render();
  expect(html).toContain("&lt;Coast &amp; sky&gt;");expect(html).toContain('aria-haspopup="dialog"');
  expect(html).toContain('aria-label="Next image"');expect(html).toContain('aria-label="Album pagination"');expect(html).toContain("More images");
  expect(html).not.toContain("Open original");expect(html).toContain('/gallery/coast');
});
test("album result cannot substitute an identity, cursor, external album route or unsafe image link",async()=>{
  for(const result of [{...data,album:{...data.album!,id:"other"}},{...data,cursor:"other"}])await expect(install(result)).rejects.toThrow();
  expect(()=>albumResultSchema.parse({...data,album:{...data.album!,href:"https://elsewhere.invalid"}})).toThrow();
  expect(()=>albumResultSchema.parse({...data,items:[{...data.items[0],href:"javascript:alert(1)"}]})).toThrow();
  expect(()=>albumResultSchema.parse({...data,album:null})).toThrow();
});
test("album access withdrawal removes images and viewer changes invalidate installed content",async()=>{
  const {host,render}=await install(data);expect(()=>render({...current,viewerKey:"another"})).toThrow();host.invalidate();expect(()=>render()).toThrow();
  const empty=await install({album:null,items:[],cursor:null,nextCursor:null});expect(empty.render()).toContain("not available");expect(empty.render()).not.toContain("photo.jpg");
});
