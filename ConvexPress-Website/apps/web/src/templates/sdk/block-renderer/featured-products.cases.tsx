import {test,expect} from "bun:test";
import {renderToStaticMarkup} from "react-dom/server";
import featured from "../../../../../../../blocks/core/featured-products/render";
import {prepareBlocks} from "./model";
import {createDemoContentPageHost} from "../block-data/demo-channel";
import {resolveCanonicalData} from "../block-data/portable/resolve";
const policy={enabledPlugins:["commerce"],capabilities:[],disabledBlocks:[]};
const current={scope:{websiteKey:"fixture",instanceKey:"stage"},documentKey:"doc",revision:"1",viewerKey:"anonymous"};
const card={id:"mug",title:"Clay & <script>care</script>",href:"/products/mug",excerpt:"Made by **hand**.",createdAt:1,image:{src:"/mug.png",alt:"Clay mug"},pricing:{price:{amount:2500,currencyCode:"USD"},salePrice:{amount:0,currencyCode:"USD"},salePriceFrom:100,salePriceTo:200,pricedAt:150}};
async function install(attrs:Record<string,unknown>,items:unknown[]) {
 const tree=[{id:"products",name:"core/featured-products",version:2,attrs}];
 const envelope=await resolveCanonicalData(tree,current.scope,policy,async()=>null,undefined,undefined,undefined,{},undefined,undefined,undefined,undefined,undefined,undefined,undefined,async()=>({items}));
 const host=createDemoContentPageHost(),grant=host.install({tree,context:current,policy,envelope});
 return {host,render:()=>renderToStaticMarkup(prepareBlocks(tree,{"core/featured-products":featured},policy,{media:{}},{grant,current}))};
}
test("featured-products renders authorized references, zero-price sales and escaped titles; revocation clears content",async()=>{
 const {host,render}=await install({heading:"Objects for everyday living"},[card]);const html=render();
 for(const text of ["Objects for everyday living",'href="/products/mug"','src="/mug.png"',"Clay mug","$0.00","$25.00","<del", "<strong>hand</strong>"]) expect(html).toContain(text);
 expect(html).not.toContain("<script>");expect(html).toContain("&lt;script&gt;");
 host.invalidate();expect(render).toThrow();
});
test("missing media and price controls produce truthful accessible empty states",async()=>{
 const without=await install({showPrice:false},[{...card,image:null,pricing:null}]);const html=without.render();
 expect(html).not.toContain("<img");expect(html).not.toContain("$25");expect(html).not.toContain("$0");expect(html).toContain('aria-hidden="true"');
 const empty=await install({},[]);expect(empty.render()).toContain("No products to show yet.");
});
test("expired scheduled sales render the regular price on the initial server frame",async()=>{
 const {render}=await install({},[{...card,pricing:{...card.pricing,pricedAt:201}}]);
 const html=render();expect(html).toContain("$25.00");expect(html).not.toContain("$0.00");expect(html).not.toContain("<del");
});
test("manual product references render only the bound authorized selection, including withdrawn products",async()=>{
 const selected=await install({productIds:["mug"]},[card]);
 expect(selected.render()).toContain('href="/products/mug"');
 selected.host.invalidate();expect(selected.render).toThrow();
 const withdrawn=await install({productIds:["mug"]},[]);
 expect(withdrawn.render()).toContain("No products to show yet.");
 await expect(install({productIds:["another-product"]},[card])).rejects.toThrow();
 const tree=[{id:"products",name:"core/featured-products",version:2,attrs:{productIds:["mug"]}}];
 expect(()=>prepareBlocks(tree,{"core/featured-products":featured},policy,{media:{}})).toThrow();
});
