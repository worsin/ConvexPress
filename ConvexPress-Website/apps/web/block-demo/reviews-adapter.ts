import { resolveCanonicalData } from "../src/templates/sdk/block-data/portable/resolve";
import type { DataScope, ResolverPolicy } from "../src/templates/sdk/block-data/portable/contracts";
import type { BlockPageRequest } from "../src/templates/sdk/block-data/portable/postGridContracts";
import { summarizeReviewPage, type ReviewsResult } from "../src/templates/sdk/block-data/portable/reviewsContracts";
export type ReviewScenario="site"|"product"|"pending"|"empty"|"unavailable";
const notebook={id:"demo-notebook",title:"The Field Notebook",slug:"field-notebook",href:"/products/field-notebook"};
const cup={id:"demo-cup",title:"The Everyday Cup",slug:"everyday-cup",href:"/products/everyday-cup"};
const words=[
  ["Maya R.","A place for the ideas that matter","The paper has just enough texture. It lies flat on my desk, travels in my bag, and has quietly become part of every morning.",5],
  ["Jonah L.","Better with everyday use","A simple object, thoughtfully made. The small details are the ones I notice most: the balance, the finish, and how comfortable it feels.",5],
  ["Elena C.","Made to be kept","I bought one as a gift and came back for another. Nothing unnecessary, just lovely materials and care in the making.",5],
  ["Sam D.","A welcome little ritual","Exactly the size I wanted. The color is a touch warmer in person, which I like. It has earned its spot beside the window.",4],
  ["Robin K.","Room for a fresh start","There is something about a blank page and a good pen. This makes me want to slow down and actually put the thought on paper.",5],
  ["Alex N.","Considered, from start to finish","Arrived carefully wrapped and ready to give. The quality feels consistent with the description. I would happily choose it again.",4],
  ["Lou P.","The one I reach for","Quietly useful. A pleasure to have around, without needing to make a statement about it.",5],
  ["Casey T.","A good everyday companion","A little heavier than expected, but beautifully finished. I appreciate that it feels made for real use.",4],
] as const;
const reviews=words.map(([author,title,body,rating],i)=>({id:`demo-review-${i}`,author,title,body,rating,bodyTruncated:false,verifiedPurchase:i%3!==0,createdAt:1770000000000-i*86400000,product:i%2===0?notebook:cup}));
export function resolveReviewsDemo(tree:unknown,scope:DataScope,policy:ResolverPolicy,request:BlockPageRequest={},scenario:ReviewScenario="site"){
  const parameters:Parameters<typeof resolveCanonicalData>=[tree,scope,policy,async()=>null];parameters[7]=request;
  parameters[37]=async args=>{
    const product=args.source==="product"?(args.product===notebook.id?notebook:args.product===cup.id?cup:null):null;
    const base={source:args.source,selection:args.source==="product"?args.product:null,cursor:args.cursor};
    if(scenario==="unavailable" || args.source==="product"&&!product)return {...base,availability:"unavailable",product:null,items:[],summary:null,nextCursor:null} satisfies ReviewsResult;
    const all=scenario==="empty"?[]:reviews.filter(item=>!product||item.product.id===product.id),filtered=all.filter(item=>item.rating>=args.minRating);
    const offset=args.cursor?Number(args.cursor.replace("demo-reviews:","")):0;
    if(!Number.isSafeInteger(offset)||offset<0||offset>filtered.length||args.cursor&&args.cursor!==`demo-reviews:${offset}`)throw Error("Invalid demonstration review page");
    const items=filtered.slice(offset,offset+args.limit),summary=product?{...summarizeReviewPage(all),scope:"product" as const}:summarizeReviewPage(items);
    return {...base,availability:"available",product,items,summary:scenario==="pending"?null:summary,nextCursor:offset+items.length<filtered.length?`demo-reviews:${offset+items.length}`:null} satisfies ReviewsResult;
  };
  return resolveCanonicalData(...parameters);
}
