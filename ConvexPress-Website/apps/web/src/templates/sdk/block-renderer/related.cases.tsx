import { test, expect } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import relatedBlock from "../../../../../../../blocks/core/related-content/render";
import { prepareBlocks } from "./model";
import { BlockPaginationProvider } from "./pagination";
import { createDemoContentPageHost } from "../block-data/demo-channel";
import { resolveCanonicalData } from "../block-data/portable/resolve";
import { planCanonicalData } from "../block-data/portable/planner";
import { relatedResultSchema, type RelatedResult } from "../block-data/portable/relatedContracts";
const policy={enabledPlugins:[],capabilities:[],disabledBlocks:[]};
const current={scope:{websiteKey:"related",instanceKey:"test"},documentKey:"page",revision:"1",viewerKey:"visitor"};
const tree=[{id:"related-block",name:"core/related-content",version:1,attrs:{type:"post",limit:3}}];
const data:RelatedResult={type:"post",items:[{id:"story-1",title:"<Coast & sky>",href:"/blog/coast",excerpt:"A quiet morning",publishedAt:1,image:{src:"/photo.jpg",alt:"Coastal sky"}}],cursor:null,nextCursor:"page-2"};
async function install(result:RelatedResult) {
  const parameters:Parameters<typeof resolveCanonicalData>=[tree,current.scope,policy,async()=>null];parameters[32]=async()=>result;
  const envelope=await resolveCanonicalData(...parameters),host=createDemoContentPageHost(),grant=host.install({tree,context:current,policy,envelope});
  return {host,render:(context=current)=>renderToStaticMarkup(<BlockPaginationProvider href="/story?search=retained">{prepareBlocks(tree,{"core/related-content":relatedBlock},policy,{media:{}},{grant,current:context})}</BlockPaginationProvider>)};
}
test("related planner supports visitor pagination and rejects authored source IDs",()=>{
  expect(planCanonicalData(tree,current.scope,policy,{"related-block":"next"}).jobs[0]?.args).toEqual({type:"post",limit:3,cursor:"next"});
  expect(()=>planCanonicalData([{...tree[0],attrs:{...tree[0]!.attrs,sourceId:"other"}}],current.scope,policy)).toThrow();
});
test("related renderer escapes text and preserves host navigation state",async()=>{
  const html=(await install(data)).render();expect(html).toContain("&lt;Coast &amp; sky&gt;");expect(html).toContain("/blog/coast");
  expect(html).toContain('aria-label="Related content pagination"');expect(html).toContain("Explore more");expect(html).toContain("search=retained");
});
test("related results bind saved type, limit and page with closed safe card shapes",async()=>{
  for(const result of [{...data,cursor:"other"},{...data,type:"page" as const,items:[]}])await expect(install(result)).rejects.toThrow();
  for(const result of [{...data,items:[data.items[0],data.items[0]]},{...data,items:[{...data.items[0],href:"//evil.invalid/blog/coast"}]},{...data,items:[{...data.items[0],body:"private"}]}])expect(()=>relatedResultSchema.parse(result)).toThrow();
  await expect(resolveCanonicalData(tree,current.scope,policy,async()=>null)).rejects.toThrow("Trusted related");
});
test("related viewer changes invalidate data and empty filtered pages retain navigation",async()=>{
  const {host,render}=await install(data);expect(()=>render({...current,viewerKey:"another"})).toThrow();host.invalidate();expect(()=>render()).toThrow();
  const filtered=(await install({...data,items:[]})).render();expect(filtered).toContain("Continue exploring");expect(filtered).toContain("Explore more");
  const empty=(await install({...data,items:[],nextCursor:null})).render();expect(empty).toContain("No related content");expect(empty).not.toContain("Explore more");
});
