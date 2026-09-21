import { test, expect } from "bun:test";
import { resolveCanonicalData, validateCanonicalData } from "./resolve";
import { featuredProductsArgsSchema, featuredProductsResultSchema, featuredProductsMatchArgs } from "./productContracts";
const scope={websiteKey:"site",instanceKey:"staging"},policy={enabledPlugins:["commerce"],capabilities:[],disabledBlocks:[]};
const block=(id="products",attrs={})=>({id,name:"core/featured-products",version:2,attrs});
const card={id:"mug",title:"Mug",href:"/products/mug",excerpt:null,createdAt:2,image:null,pricing:null};
const read=(tree:unknown, reader:(args:any)=>Promise<unknown>)=>resolveCanonicalData(tree,scope,policy,async()=>{throw Error("unexpected page read");},undefined,undefined,undefined,{},undefined,undefined,undefined,undefined,undefined,undefined,undefined,reader);
test("generated product bindings deduplicate jobs and reject stale selection or environment",async()=>{
  const tree=[block(),block("second")];let calls=0;
  const result=await read(tree,async args=>{calls++;expect(args).toEqual({productIds:[],count:4,showPrice:true});return {items:[card]};});
  expect(calls).toBe(1);expect(validateCanonicalData(tree,scope,policy,result)).toEqual(result);
  expect(()=>validateCanonicalData([block("products",{count:2}),block("second")],scope,policy,result)).toThrow("current canonical attributes");
  expect(()=>validateCanonicalData(tree,{...scope,instanceKey:"production"},policy,result)).toThrow("another environment");
});
test("missing product reader or disabled commerce fails before any source read",async()=>{
  let calls=0;
  await expect(resolveCanonicalData([block()],scope,policy,async()=>{calls++;return {page:null};})).rejects.toThrow("Trusted product reader");
  await expect(resolveCanonicalData([block()],scope,{...policy,enabledPlugins:[]},async()=>{calls++;return {page:null};})).rejects.toThrow("Required plugin");
  expect(calls).toBe(0);
});
test("manual result identity, order, count and price disclosure are bound on server and consumer",async()=>{
  const tree=[block("products",{productIds:["one","two"],count:2,showPrice:false})];
  for(const items of [[card],[{...card,id:"two"},{...card,id:"one"}],[{...card,id:"one",pricing:{price:{amount:0,currencyCode:"USD"},salePrice:null,salePriceFrom:null,salePriceTo:null,pricedAt:3}}]])
    await expect(read(tree,async()=>({items}))).rejects.toThrow("saved selection");
  const envelope=await read(tree,async()=>({items:[{...card,id:"one"}]}));
  const tampered=JSON.parse(JSON.stringify(envelope));tampered.dataByBlock.products.data.items[0].id="other";
  expect(()=>validateCanonicalData(tree,scope,policy,tampered)).toThrow("current canonical attributes");
});
test("strict DTOs refuse private metadata, unsafe links and duplicate identities",()=>{
  for(const items of [[{...card,rawSourceMeta:"private"}],[{...card,href:"javascript:alert(1)"}],[card,card]])
    expect(featuredProductsResultSchema.safeParse({items}).success).toBe(false);
  expect(featuredProductsMatchArgs(featuredProductsArgsSchema.parse({}),{items:[card,{...card,id:"newer",createdAt:3}]})).toBe(false);
  expect(featuredProductsMatchArgs(featuredProductsArgsSchema.parse({productIds:[""]}),{items:[card]})).toBe(false);
});
