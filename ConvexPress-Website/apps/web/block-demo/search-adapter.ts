import {resolveCanonicalData} from "../src/templates/sdk/block-data/portable/resolve";
import type {DataScope,ResolverPolicy} from "../src/templates/sdk/block-data/portable/contracts";
import type {BlockPageRequest} from "../src/templates/sdk/block-data/portable/postGridContracts";
import type {SearchResult} from "../src/templates/sdk/block-data/portable/searchContracts";
export const searchDemoItems:SearchResult["items"]=[
 {id:"orchid-story",kind:"post",title:"The quiet art of growing orchids",href:"/blog/growing-orchids",excerpt:"A patient guide to light, roots and the small rituals that make an orchid feel at home.",author:"The Field Journal",publishedAt:1788566400000},
 {id:"orchid-course",kind:"course",title:"A season of orchids",href:"/courses/a-season-of-orchids",excerpt:"Learn to read the signs of a healthy plant, from its first new leaf to its next flowering season.",author:"Mara Chen",publishedAt:1788566400000},
 {id:"orchid-product",kind:"product",title:"The orchid pot, in warm stone",href:"/products/orchid-pot",excerpt:"A considered home for aerial roots. Hand-finished stoneware with generous drainage and a softly textured glaze.",author:null,publishedAt:null},
 {id:"orchid-event",kind:"event",title:"Orchids at the glasshouse",href:"/events/orchids-at-the-glasshouse",excerpt:"Spend a slow Saturday among the plants. A guided walk, a practical workshop and time for questions.",author:null,publishedAt:null},
 {id:"orchid-page",kind:"page",title:"Visit our orchid house",href:"/orchid-house",excerpt:"Opening hours, directions and everything you need to plan your visit.",author:null,publishedAt:null},
];
export function resolveSearchDemo(tree:unknown,scope:DataScope,policy:ResolverPolicy,request:BlockPageRequest={}){
 const params:Parameters<typeof resolveCanonicalData>=[tree,scope,policy,async()=>({page:null})];params[7]=request;
 params[40]=async args=>{
  if(!args.query)return {state:"idle",query:"",items:[],cursor:null,nextCursor:null};
  const offset=args.cursor?Number(args.cursor.replace("demo-search:","")):0;
  if(!Number.isSafeInteger(offset)||offset<0||(args.cursor&&args.cursor!==`demo-search:${offset}`))throw Error("Invalid search fixture cursor");
  const selected=args.query.toLowerCase().includes("orchid")?searchDemoItems.filter(item=>args.kinds.length===0||args.kinds.includes(item.kind)):[];
  return {state:"ready",query:args.query,items:selected.slice(offset,offset+args.pageSize),cursor:args.cursor,nextCursor:offset+args.pageSize<selected.length?`demo-search:${offset+args.pageSize}`:null};
 };
 return resolveCanonicalData(...params);
}
