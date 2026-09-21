import { test, expect } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import compareBlock from "../../../../../../../blocks/commerce/product-compare/render";
import { prepareBlocks } from "./model";
import { createDemoContentPageHost } from "../block-data/demo-channel";
import { resolveCanonicalData } from "../block-data/portable/resolve";
import { productCompareResultSchema, comparisonRowDiffers, type ProductCompareResult } from "../block-data/portable/productCompareContracts";
const policy={enabledPlugins:["commerce"],capabilities:["reference.targetResolution"],disabledBlocks:[]};
const current={scope:{websiteKey:"compare",instanceKey:"test"},documentKey:"page",revision:"1",viewerKey:"visitor"};
const tree=[{id:"compare",name:"commerce/product-compare",version:1,attrs:{products:["p1","p2"],attributes:["Color"]}}];
const data:ProductCompareResult={items:[{id:"p1",title:"<Field & notebook>",href:"/products/notebook",image:null,price:{min:1800,max:2400,currencyCode:"USD"}},{id:"p2",title:"Studio journal",href:"/products/journal",image:null,price:{min:3200,max:3200,currencyCode:"USD"}}],rows:[{key:"option:color",label:"Color",cells:[["Ink","Forest"],null]}]};
async function install(result:ProductCompareResult,nodes:unknown=tree){
  const params:Parameters<typeof resolveCanonicalData>=[nodes,current.scope,policy,async()=>null];params[38]=async()=>result;
  const envelope=await resolveCanonicalData(...params),host=createDemoContentPageHost(),grant=host.install({tree:nodes,context:current,policy,envelope});
  return {host,render:(context=current)=>renderToStaticMarkup(prepareBlocks(nodes,{"commerce/product-compare":compareBlock},policy,{media:{}},{grant,current:context}))};
}
test("comparison renders escaped names, actual ranges and accessible aligned table headers",async()=>{
  const html=(await install(data)).render();
  for(const text of ["&lt;Field &amp; notebook&gt;","$18.00","$24.00","$32.00",'scope="col"','scope="row"','aria-label="Product comparison"','tabindex="0"',"Only show differences","Not specified","Across available options"])expect(html).toContain(text);
  expect(html).not.toContain("From $24.00");expect(html).toContain('href="/products/notebook"');
});
test("comparison contracts reject private fields, partial rows, duplicates and false ranges",()=>{
  for(const result of [{...data,items:[{...data.items[0],stockQuantity:99},data.items[1]]},{...data,rows:[{...data.rows[0],cells:[["Ink"]]}]},{...data,items:[data.items[0],data.items[0]]},{...data,items:[{...data.items[0],price:{min:100,max:10,currencyCode:"USD"}},data.items[1]]},{...data,rows:[{...data.rows[0],cells:[["Ink","Ink"],null]}]}])expect(()=>productCompareResultSchema.parse(result)).toThrow();
});
test("comparison rejects replaced selections, changed fields and missing trusted readers",async()=>{
  await expect(install({...data,items:[...data.items].reverse()})).rejects.toThrow();
  await expect(install({...data,rows:[{...data.rows[0]!,key:"sku"}]})).rejects.toThrow();
  await expect(resolveCanonicalData(tree,current.scope,policy,async()=>null)).rejects.toThrow("Trusted product comparison");
});
test("difference comparison treats option order as equivalent while retaining missing values",()=>{
  expect(comparisonRowDiffers({key:"color",label:"Color",cells:[["Ink","Forest"],["Forest","Ink"]]})).toBe(false);
  expect(comparisonRowDiffers(data.rows[0]!)).toBe(true);
  expect(comparisonRowDiffers({key:"color",label:"Color",cells:[null,null]})).toBe(false);
});
test("comparison distinguishes empty and unavailable selections and invalidates changed viewer data",async()=>{
  const {render,host}=await install(data);expect(()=>render({...current,viewerKey:"other"})).toThrow();host.invalidate();expect(()=>render()).toThrow();
  expect((await install({items:[],rows:[]})).render()).toContain("not available right now");
  expect((await install({items:[],rows:[]},[{...tree[0],attrs:{products:[],attributes:[]}}])).render()).toContain("Choose products");
});
