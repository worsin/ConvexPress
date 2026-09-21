import { test, expect } from "bun:test";
import { resolveCanonicalData, validateCanonicalData } from "./resolve";
import { planCanonicalData } from "./planner";
const scope={websiteKey:"site",instanceKey:"staging"},policy={enabledPlugins:["commerce"],capabilities:[],disabledBlocks:[]};
const block=(attrs:Record<string,unknown>={},id="collection")=>({id,name:"blocks/product-collection",version:2,attrs});
const card={id:"mug",title:"Mug",href:"/products/mug",excerpt:null,createdAt:1,image:null,pricing:null,rating:null,cart:null};
const read=(tree:unknown,reader:(args:any)=>Promise<unknown>)=>resolveCanonicalData(tree,scope,policy,async()=>{throw Error("unexpected page read");},undefined,undefined,undefined,{},undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,reader);
test("collection planner projects authored groups into exact product references and deduplicates data jobs",async()=>{
  const attrs={productIds:["mug"],groups:[{label:"Kitchen",productIds:["mug"],products:[{title:"Editorial card",price:"Not a database price"}]}]};
  const tree=[block(attrs),block({...attrs,heading:"Another heading"},"second")];let calls=0;
  const result=await read(tree,async args=>{calls++;expect(args.groups).toEqual([{productIds:["mug"]}]);expect(JSON.stringify(args)).not.toContain("Editorial card");return {items:[card],groups:[{index:0,items:[card]}]};});
  expect(calls).toBe(1);expect(validateCanonicalData(tree,scope,policy,result)).toEqual(result);
  expect(()=>validateCanonicalData(tree,{...scope,instanceKey:"other"},policy,result)).toThrow("another environment");
  expect(()=>validateCanonicalData([block({...attrs,productIds:["other"]}),tree[1]],scope,policy,result)).toThrow("current canonical attributes");
});
test("collection refuses missing readers, disabled plugins, absent selected terms and arbitrary visitor arguments before reads",async()=>{
  await expect(resolveCanonicalData([block()],scope,policy,async()=>null)).rejects.toThrow("Trusted product collection reader");
  for(const attrs of [{mode:"category"},{mode:"tag"},{mode:"recentlyViewed",sessionToken:"private"}])expect(()=>planCanonicalData([block(attrs)],scope,policy)).toThrow();
  expect(()=>planCanonicalData([block()],scope,{...policy,enabledPlugins:[]})).toThrow("Required plugin");
});
test("collection result validation rejects reordered groups, mismatched product IDs and price/cart disclosure",async()=>{
  const tree=[block({productIds:["mug"],showPrice:false,showAddToCart:false,groups:[{label:"Kitchen",productIds:["mug"]}]})];
  for(const data of [
    {items:[{...card,id:"other"}],groups:[{index:0,items:[]}]},
    {items:[card],groups:[{index:1,items:[]}]},
    {items:[{...card,cart:{kind:"add",productId:"mug"}}],groups:[{index:0,items:[]}]},
  ])await expect(read(tree,async()=>data)).rejects.toThrow("saved selection");
  const valid=await read(tree,async()=>({items:[card],groups:[{index:0,items:[card]}]}));
  const tampered=structuredClone(valid);tampered.dataByBlock.collection.data.groups[0].items[0].id="other";
  expect(()=>validateCanonicalData(tree,scope,policy,tampered)).toThrow("current canonical attributes");
});
