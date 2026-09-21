import { resolveCanonicalData } from "../src/templates/sdk/block-data/portable/resolve";
import type { DataScope, ResolverPolicy } from "../src/templates/sdk/block-data/portable/contracts";
import type { BlockPageRequest } from "../src/templates/sdk/block-data/portable/postGridContracts";
import type { RelatedResult } from "../src/templates/sdk/block-data/portable/relatedContracts";
import retreat from "./assets/aster-house-retreat.png";
import mug from "./assets/aster-house-camp-mug.png";
import notebook from "./assets/aster-house-field-notebook.png";
const stories=[
  ["a-slower-weekend","The art of a slower weekend","A cabin in the woods. An unhurried morning. A little room to hear yourself think.",retreat],
  ["small-rituals","Small rituals, well kept","Why the things we reach for every day deserve a little more consideration.",mug],
  ["room-for-ideas","Make room for an idea","On blank pages, unexpected connections, and taking the long way home.",notebook],
  ["begin-again","A good place to begin again","A few notes on finding your own rhythm, wherever the week takes you.",retreat],
];
export function resolveRelatedDemo(tree:unknown,scope:DataScope,policy:ResolverPolicy,request:BlockPageRequest={}) {
  const parameters:Parameters<typeof resolveCanonicalData>=[tree,scope,policy,async()=>null];parameters[7]=request;
  parameters[32]=async args=>{
    const offset=args.cursor?Number(args.cursor.replace("demo-related:","")):0;
    if(!Number.isInteger(offset)||offset<0||offset>=stories.length || args.cursor && args.cursor!==`demo-related:${offset}`)throw Error("Invalid related demonstration page");
    const items=stories.slice(offset,offset+args.limit).map(([id,title,excerpt,src],index)=>({id:id!,title:title!,excerpt:excerpt!,href:`/${args.type==="post"?"blog":"page"}/${id}`,publishedAt:1700000000000-offset-index,image:{src:src!.startsWith("/")?src!:`/${src}`,alt:title!}}));
    return {type:args.type,items,cursor:args.cursor,nextCursor:offset+items.length<stories.length?`demo-related:${offset+items.length}`:null} satisfies RelatedResult;
  };
  return resolveCanonicalData(...parameters);
}
