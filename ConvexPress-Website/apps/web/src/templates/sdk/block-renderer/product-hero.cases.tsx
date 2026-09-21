import { test, expect } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import hero from "../../../../../../../blocks/commerce/product-hero/render";
import { prepareBlocks } from "./model";
import { createDemoContentPageHost } from "../block-data/demo-channel";
import { resolveCanonicalData } from "../block-data/portable/resolve";
import { planCanonicalData } from "../block-data/portable/planner";
const policy={enabledPlugins:["commerce"],capabilities:["reference.targetResolution"],disabledBlocks:[]};
const current={scope:{websiteKey:"hero-test",instanceKey:"isolated"},documentKey:"hero",revision:"1",viewerKey:"visitor"};
const card={id:"notebook",title:"Field & <script>notes</script>",href:"/products/notebook",excerpt:"A place for your thoughts.",createdAt:1,image:null,pricing:{price:{amount:2400,currencyCode:"USD"},salePrice:null,salePriceFrom:null,salePriceTo:null,pricedAt:1000},rating:null,cart:{kind:"add",productId:"notebook"}};
const treeFor=(attrs:Record<string,unknown>={})=>[{id:"hero",name:"commerce/product-hero",version:1,attrs}];
async function install(items:unknown[],attrs:Record<string,unknown>={product:"notebook"}) {
 const tree=treeFor(attrs),envelope=await resolveCanonicalData(tree,current.scope,policy,async()=>null,undefined,undefined,undefined,{},undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,async()=>({items,groups:[]}));
 const host=createDemoContentPageHost(),grant=host.install({tree,context:current,policy,envelope});
 return {host,render:(context=current)=>renderToStaticMarkup(prepareBlocks(tree,{"commerce/product-hero":hero},policy,{media:{"private-image":{src:"/authorized-asset.png",alt:"Authorized authored image"}}},{grant,current:context}))};
}
test("product hero binds exactly its saved product and an empty selection never becomes latest",()=>{
 for(const [attrs,id] of [[{product:"notebook"},"notebook"],[{},""]] as const){const job=planCanonicalData(treeFor(attrs),current.scope,policy).jobs[0]!;expect(job.resolver).toBe("commerce.productCollection");expect(job.args).toEqual({mode:"manual",productIds:[id],count:1,showPrice:true,showRating:false,showAddToCart:true,categorySlug:"",tagSlug:"",groups:[]});}
 for(const attrs of [{product:"notebook",mode:"recent"},{productIds:["other"]},{count:24}])expect(()=>planCanonicalData(treeFor(attrs),current.scope,policy)).toThrow();
 expect(()=>planCanonicalData(treeFor(),current.scope,{...policy,enabledPlugins:[]})).toThrow();
});
test("hero uses authorized live price, safe content and the product link without a cart host",async()=>{
 const {render,host}=await install([card],{product:"notebook",title:"Things worth keeping."});const html=render();
 expect(html).toContain("Things worth keeping.");expect(html).toContain("$24.00");expect(html).toContain('href="/products/notebook"');expect(html).toContain("View product");expect(html).not.toContain("<script>");expect(html).not.toContain("Add to cart");
 expect(()=>render({...current,viewerKey:"different"})).toThrow();host.invalidate();expect(()=>render()).toThrow();
});
test("unavailable hero hides authored promotional copy and image rather than fabricating availability",async()=>{
 const {render}=await install([],{product:"notebook",title:"Private promotion",media:{id:"private-image"}});const html=render();
 expect(html).toContain('data-product-state="empty"');expect(html).toContain('href="/products"');expect(html).not.toContain("Private promotion");expect(html).not.toContain("private-image");expect(html).not.toContain("$24.00");
 await expect(install([{...card,id:"other",cart:null}])).rejects.toThrow();
});
test("variable product hero sends visitors to its options and never offers a direct add",async()=>{
 const {render}=await install([{...card,cart:{kind:"chooseOptions"}}]);expect(render()).toContain("Choose options");expect(render()).not.toContain("Add to cart");
});

test("hero uses only the resolved image override and preserves its accessible description",async()=>{
 const {render}=await install([{...card,image:{src:"/product-photo.png",alt:"Catalog image"}}],{product:"notebook",media:{id:"private-image",alt:"Notebook beside a pencil",focalPoint:{x:.25,y:.75}}});const html=render();expect(html).toContain('/authorized-asset.png');expect(html).toContain('alt="Notebook beside a pencil"');expect(html).not.toContain('/product-photo.png');
});
