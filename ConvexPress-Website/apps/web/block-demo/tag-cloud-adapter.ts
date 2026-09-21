import { resolveCanonicalData } from "../src/templates/sdk/block-data/portable/resolve";
import type { DataScope, ResolverPolicy } from "../src/templates/sdk/block-data/portable/contracts";
import type { BlockPageRequest } from "../src/templates/sdk/block-data/portable/postGridContracts";
const topics = ["Architecture", "At the table", "Ceramics", "Everyday rituals", "Field notes", "Gardens", "Handmade", "Materials & making", "Places to pause", "Seasonal living", "Small spaces", "The art of paying attention", "Wood & wool"];
/** Synthetic topics exercise the production contract; they are never site records. */
export function resolveTagCloudDemo(tree: unknown, scope: DataScope, policy: ResolverPolicy, request: BlockPageRequest = {}) {
  return resolveCanonicalData(tree,scope,policy,async()=>({page:null}),undefined,undefined,undefined,request,undefined,undefined,undefined,async args=>{
    const offset = args.cursor ? Number(args.cursor.replace(/^demo-topics:/u,"")) : 0;
    if (!Number.isInteger(offset) || offset < 0 || offset > topics.length || args.cursor && args.cursor !== `demo-topics:${offset}`) throw Error("Invalid synthetic topic position");
    const end=offset+args.max;
    return { items: topics.slice(offset,end).map((name,index)=>({id:`demo-topic-${offset+index}`,name,href:`/tag/demo-topic-${offset+index}`})),
      cursor:args.cursor,nextCursor:end<topics.length?`demo-topics:${end}`:null };
  });
}
