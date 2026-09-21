import { test, expect } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import showcase from "../../../../../../../blocks/commerce/product-showcase/render";
import { prepareBlocks } from "./model";
import { createDemoContentPageHost } from "../block-data/demo-channel";
import { resolveCanonicalData } from "../block-data/portable/resolve";
import { planCanonicalData } from "../block-data/portable/planner";
const policy={enabledPlugins:["commerce"],capabilities:["reference.targetResolution"],disabledBlocks:[]};
const current={scope:{websiteKey:"hero-test",instanceKey:"isolated"},documentKey:"hero",revision:"1",viewerKey:"visitor"};
const card={id:"notebook",slug:"notebook",stock:"instock",title:"Field & <script>notes</script>",href:"/products/notebook",excerpt:"A place for your thoughts.",createdAt:1,image:null,pricing:{price:{amount:2400,currencyCode:"USD"},salePrice:null,salePriceFrom:null,salePriceTo:null,pricedAt:1000},rating:null,cart:{kind:"add",productId:"notebook"}};
const treeFor=(attrs:Record<string,unknown>={})=>[{id:"hero",name:"commerce/product-showcase",version:2,attrs}];
async function install(items:unknown[],attrs:Record<string,unknown>={source:"slugs",productSlugs:["notebook"]}) {
 const tree=treeFor(attrs),envelope=await resolveCanonicalData(tree,current.scope,policy,async()=>null,undefined,undefined,undefined,{},undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,async()=>({items}));
 const host=createDemoContentPageHost(),grant=host.install({tree,context:current,policy,envelope});
 return {host,render:(context=current)=>renderToStaticMarkup(prepareBlocks(tree,{"commerce/product-showcase":showcase},policy,{media:{"private-image":{src:"/authorized-asset.png",alt:"Authorized authored image"}}},{grant,current:context}))};
}
test("showcase planner keeps all four authored selection modes and slug ordering",()=>{
 for(const source of ["newest","category","sale","slugs"]){
  const attrs={source,categorySlug:"studio",productSlugs:["notebook","mug"],count:2,showAddToCart:false};
  const job=planCanonicalData(treeFor(attrs),current.scope,policy).jobs[0]!;
  expect(job.resolver).toBe("commerce.productShowcase");expect(job.args).toEqual(attrs);
 }
 expect(()=>planCanonicalData(treeFor({source:"category"}),current.scope,policy)).toThrow();
 expect(()=>planCanonicalData(treeFor(),current.scope,{...policy,enabledPlugins:[]})).toThrow();
});
test("showcase displays authorized price and stock and escapes text and unsafe CTA",async()=>{
 const {render,host}=await install([card],{source:"slugs",productSlugs:["notebook"],eyebrow:"The collection",heading:"Things worth keeping.",intro:"A considered selection.",ctaLabel:"Unsafe",ctaUrl:"javascript:alert(1)"});
 const html=render();expect(html).toContain("Things worth keeping.");expect(html).toContain("$24.00");expect(html).toContain("In stock");expect(html).toContain('href="/products/notebook"');expect(html).not.toContain("javascript:");expect(html).not.toContain("<script>");
 expect(()=>render({...current,viewerKey:"different"})).toThrow();host.invalidate();expect(()=>render()).toThrow();
});
test("showcase empty state stays empty and a valid shop CTA remains accessible",async()=>{
 const {render}=await install([],{source:"slugs",productSlugs:[],ctaLabel:"Browse the collection",ctaUrl:"/products"});
 expect(render()).toContain('data-showcase-state="empty"');expect(render()).toContain("Browse the collection");expect(render()).not.toContain("$24.00");
 await expect(install([{...card,slug:"other",href:"/products/other"}])).rejects.toThrow();
 await expect(install([{...card,href:"/products/different"}])).rejects.toThrow();
});
test("showcase distinguishes out of stock, backorder, variable and partner availability",async()=>{
 for(const [stock,label,cart] of [["outofstock","Out of stock",null],["onbackorder","Available on backorder",card.cart],["options","Availability varies by option",{kind:"chooseOptions"}],["external","Sold by a partner",null]] as const){
  const {render}=await install([{...card,stock,cart}]);expect(render()).toContain(label);
  if(stock==="options")expect(render()).toContain("Choose options");
 }
 await expect(install([{...card,stock:"outofstock"}])).rejects.toThrow();
 await expect(install([{...card,stock:"external"}])).rejects.toThrow();
});
test("showcase refuses reordered and duplicated slug results, and cart disclosure when hidden",async()=>{
 const mug={...card,id:"mug",slug:"mug",href:"/products/mug",cart:null};
 await expect(install([mug,card],{source:"slugs",productSlugs:["notebook","mug"]})).rejects.toThrow();
 await expect(install([card,card])).rejects.toThrow();
 await expect(install([card],{source:"slugs",productSlugs:["notebook"],showAddToCart:false})).rejects.toThrow();
 const {render}=await install([{...card,cart:null}],{source:"slugs",productSlugs:["notebook"],showAddToCart:false});expect(render()).toContain("In stock");
});
