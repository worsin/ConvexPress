import { resolveCanonicalData } from "../src/templates/sdk/block-data/portable/resolve";
import type { DataScope, ResolverPolicy } from "../src/templates/sdk/block-data/portable/contracts";
import { compareAttributeKey, type ProductCompareResult } from "../src/templates/sdk/block-data/portable/productCompareContracts";
import mug from "./assets/aster-house-camp-mug.png";
import notebook from "./assets/aster-house-field-notebook.png";
export const compareDemoIds = ["demo-field-notebook", "demo-studio-journal", "demo-morning-mug"];
const image = (src:string,alt:string) => ({src:src.startsWith("/")?src:`/${src}`,alt});
const records:ProductCompareResult["items"] = [
  {id:compareDemoIds[0]!,title:"The Field Notebook",href:"/products/field-notebook",image:image(notebook,"Green field notebook and pencil on sunlit stone"),price:{min:1800,max:2400,currencyCode:"USD"}},
  {id:compareDemoIds[1]!,title:"The Studio Journal",href:"/products/studio-journal",image:image(notebook,"Bound green journal with a pencil"),price:{min:3200,max:3200,currencyCode:"USD"}},
  {id:compareDemoIds[2]!,title:"The Morning Mug",href:"/products/morning-mug",image:image(mug,"Green ceramic mug on warm stone"),price:{min:3800,max:3800,currencyCode:"USD"}},
];
const rows:ProductCompareResult["rows"] = [
  {key:"type",label:"Product type",cells:[["With options"],["Single product"],["Single product"]]},
  {key:"format",label:"Format",cells:[["Physical"],["Physical"],["Physical"]]},
  {key:"sku",label:"SKU",cells:[["FN-01"],["SJ-02"],["MM-03"]]},
  {key:"option:color",label:"Color",cells:[["Forest","Ink"],null,null]},
  {key:"option:size",label:"Size",cells:[["Pocket","Desk"],null,null]},
];
/** Fictional author-selected demonstration products. Production never imports this adapter. */
export function resolveProductCompareDemo(tree:unknown,scope:DataScope,policy:ResolverPolicy) {
  const params:Parameters<typeof resolveCanonicalData>=[tree,scope,policy,async()=>null];
  params[38]=async args=>{
    const items=[...new Set(args.products)].flatMap(id=>records.filter(record=>record.id===id));
    if(!items.length)return {items:[],rows:[]};
    const selected=args.attributes.length?[...new Map(args.attributes.map(label=>[compareAttributeKey(label),label])).entries()].map(([key,label])=>rows.find(row=>row.key===key)??{key,label,cells:records.map(()=>null)}):rows;
    return {items,rows:selected.map(row=>({...row,cells:items.map(item=>row.cells[records.findIndex(record=>record.id===item.id)]!)}))};
  };
  return resolveCanonicalData(...params);
}
