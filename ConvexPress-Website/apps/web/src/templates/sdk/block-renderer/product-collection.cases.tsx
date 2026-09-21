import {test,expect} from "bun:test";
import {renderToStaticMarkup} from "react-dom/server";
import collection from "../../../../../../../blocks/blocks/product-collection/render";
import {prepareBlocks} from "./model";
import {createDemoContentPageHost} from "../block-data/demo-channel";
import {resolveCanonicalData} from "../block-data/portable/resolve";
const policy={enabledPlugins:["commerce"],capabilities:[],disabledBlocks:[]};
const current={scope:{websiteKey:"fixture",instanceKey:"stage"},documentKey:"doc",revision:"1",viewerKey:"anonymous"};
const card={id:"mug",title:"Clay & <script>care</script>",href:"/products/mug",excerpt:"Made by **hand**.",createdAt:1,image:{src:"/mug.png",alt:"Clay mug"},pricing:{price:{amount:2500,currencyCode:"USD"},salePrice:{amount:0,currencyCode:"USD"},salePriceFrom:100,salePriceTo:200,pricedAt:150},rating:{average:4.5,count:2},cart:{kind:"add" as const,productId:"mug"}};
async function install(attrs:Record<string,unknown>,data:unknown) {
 const tree=[{id:"collection",name:"blocks/product-collection",version:2,attrs}];
 const envelope=await resolveCanonicalData(tree,current.scope,policy,async()=>null,undefined,undefined,undefined,{},undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,async()=>data);
 const host=createDemoContentPageHost(),grant=host.install({tree,context:current,policy,envelope});
 return {host,render:()=>renderToStaticMarkup(prepareBlocks(tree,{"blocks/product-collection":collection},policy,{media:{}},{grant,current}))};
}
test("collection renders verified cards, escaped content, free pricing and accessible ratings; preview has product links",async()=>{
 const {host,render}=await install({productIds:["mug"],showRating:true,showAddToCart:true},{items:[card],groups:[]});const html=render();
 for(const text of ['href="/products/mug"','src="/mug.png"',"$0.00","$25.00","4.5 out of 5 stars, 2 reviews","View product","<strong>hand</strong>"])expect(html).toContain(text);
 expect(html).not.toContain("<script>");expect(html).toContain("&lt;script&gt;");host.invalidate();expect(render).toThrow();
});
test("authored cards never mask withdrawn product references and unsafe authored links cannot execute",async()=>{
 const fallback={title:"Authored card",href:"javascript:alert(1)",summary:"Editorial copy",price:"$12"};
 const withdrawn=await install({productIds:["mug"],products:[fallback]},{items:[],groups:[]});
 expect(withdrawn.render()).not.toContain("Authored card");expect(withdrawn.render()).toContain("no products in this collection");
 const editorial=await install({products:[fallback]},{items:[],groups:[]});
 expect(editorial.render()).toContain("Authored card");expect(editorial.render()).not.toContain("javascript:");
});
test("group tabs expose source-bound panels and cannot display another group's data",async()=>{
 const {render}=await install({productIds:["mug"],showRating:true,showAddToCart:true,groups:[{label:"Kitchen",productIds:["mug"]}]},{items:[card],groups:[{index:0,items:[card]}]});
 const html=render();expect(html).toContain('role="tablist"');expect(html).toContain('role="tabpanel"');expect(html).toContain('aria-selected="true"');expect(html).toContain("Kitchen");
 await expect(install({groups:[{label:"Other",productIds:["other"]}]},{items:[],groups:[{index:0,items:[{...card,pricing:null,rating:null,cart:null}]}]})).rejects.toThrow();
});
