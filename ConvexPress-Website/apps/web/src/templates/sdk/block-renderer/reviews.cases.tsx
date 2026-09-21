import { test, expect } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import reviewsBlock from "../../../../../../../blocks/core/reviews/render";
import { prepareBlocks } from "./model";
import { BlockPaginationProvider } from "./pagination";
import { createDemoContentPageHost } from "../block-data/demo-channel";
import { resolveCanonicalData } from "../block-data/portable/resolve";
import { reviewsResultSchema, summarizeReviewPage, type ReviewsResult } from "../block-data/portable/reviewsContracts";
const policy={enabledPlugins:["commerce","commerceReviews"],capabilities:["reference.targetResolution"],disabledBlocks:[]};
const current={scope:{websiteKey:"reviews",instanceKey:"test"},documentKey:"page",revision:"1",viewerKey:"visitor"};
const tree=[{id:"reviews-block",name:"core/reviews",version:1,attrs:{source:"site",limit:6,minRating:1}}];
const product={id:"p1",title:"Field notebook",slug:"field-notebook",href:"/products/field-notebook"};
const items=[{id:"r1",product,rating:5,title:"<Good & useful>",body:"Worth keeping",bodyTruncated:false,author:"A reader",verifiedPurchase:true,createdAt:1000}];
const data:ReviewsResult={source:"site",selection:null,availability:"available",product:null,cursor:null,nextCursor:"next-page",items,summary:summarizeReviewPage(items)};
async function install(result:ReviewsResult,nodes:unknown=tree){
  const params:Parameters<typeof resolveCanonicalData>=[nodes,current.scope,policy,async()=>null];params[37]=async()=>result;
  const envelope=await resolveCanonicalData(...params),host=createDemoContentPageHost(),grant=host.install({tree:nodes,context:current,policy,envelope});
  return {host,render:(context=current)=>renderToStaticMarkup(<BlockPaginationProvider href="/shop?campaign=retained">{prepareBlocks(nodes,{"core/reviews":reviewsBlock},policy,{media:{}},{grant,current:context})}</BlockPaginationProvider>)};
}
test("Reviews renders escaped review text, truthful page counts, verified provenance and working page links",async()=>{
  const html=(await install(data)).render();expect(html).toContain("&lt;Good &amp; useful&gt;");expect(html).toContain("1 review on this page");
  expect(html).toContain("Verified purchase");expect(html).toContain('aria-label="5 out of 5 stars"');expect(html).toContain('aria-label="Rating distribution"');
  expect(html).toContain("campaign=retained");expect(html).toContain("More reviews");
});
test("product summaries show all-product scope and updating counts never become zero stars",async()=>{
  const nodes=[{...tree[0]!,attrs:{source:"product",product:"p1",limit:6,minRating:1}}];
  const result:ReviewsResult={...data,source:"product",selection:"p1",product,summary:{scope:"product",count:3,average:4,distribution:[0,0,1,1,1]}};
  expect((await install(result,nodes)).render()).toContain("3 approved product reviews");
  const pending=(await install({...result,summary:null},nodes)).render();expect(pending).toContain("rating summary is updating");expect(pending).not.toContain("0.0");expect(pending).toContain("Worth keeping");
});
test("closed review result contracts reject fabricated aggregates, private fields and changed selection",async()=>{
  for(const result of [{...data,summary:{...data.summary,average:1}},{...data,summary:{...data.summary,count:99}},{...data,items:[{...items[0],userId:"private"}]},{...data,items:[items[0],items[0]]}])expect(()=>reviewsResultSchema.parse(result)).toThrow();
  await expect(install({...data,cursor:"other"})).rejects.toThrow();
  await expect(resolveCanonicalData(tree,current.scope,policy,async()=>null)).rejects.toThrow("Trusted reviews");
});
test("unavailable and empty review pages stay distinct and a viewer change invalidates the installed data",async()=>{
  const {render,host}=await install(data);expect(()=>render({...current,viewerKey:"other"})).toThrow();host.invalidate();expect(()=>render()).toThrow();
  const sparse=(await install({...data,items:[],summary:summarizeReviewPage([])})).render();expect(sparse).toContain("Continue to see more");expect(sparse).toContain("More reviews");
  const empty=(await install({...data,items:[],summary:summarizeReviewPage([]),nextCursor:null})).render();expect(empty).toContain("No reviews to share");
  const unavailable=(await install({...data,availability:"unavailable",items:[],summary:null,nextCursor:null})).render();expect(unavailable).toContain("Reviews are unavailable");expect(unavailable).not.toContain("Worth keeping");
});
