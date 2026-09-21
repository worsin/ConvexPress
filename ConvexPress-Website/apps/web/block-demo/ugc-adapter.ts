import {resolveCanonicalData} from "../src/templates/sdk/block-data/portable/resolve";
import type {DataScope,ResolverPolicy} from "../src/templates/sdk/block-data/portable/contracts";
import type {BlockPageRequest} from "../src/templates/sdk/block-data/portable/postGridContracts";
import type {TaggedMediaResult} from "../src/templates/sdk/block-data/portable/taggedMediaContracts";
import ceramics from "./assets/community-ceramics.png";
import vase from "./assets/community-vase.png";
import workshop from "./assets/community-workshop.png";
import notebook from "./assets/aster-house-field-notebook.png";
const photo=(id:string,src:string,alt:string,caption:string):TaggedMediaResult["items"][number]=>({id,image:{src:src.startsWith("/")?src:`/${src}`,alt},caption,credit:"ConvexPress Studio",creditUrl:null});
export const ugcDemoItems=[
 photo("ceramics",ceramics,"Ceramic cup, olive sprig and sketchbook on a sunlit oak table","Morning light, made slowly."),
 photo("vase",vase,"Sculptural ceramic vase with olive branches on an oak sideboard","A little of the outdoors, brought home."),
 photo("workshop",workshop,"Handcrafted ceramic bowls and tools on a sunlit workbench","Good things take their own time."),
 photo("notebook",notebook,"A field notebook from the Aster House collection","A place for the next idea."),
];
export function resolveTaggedMediaDemo(tree:unknown,scope:DataScope,policy:ResolverPolicy,request:BlockPageRequest={}){
 const params:Parameters<typeof resolveCanonicalData>=[tree,scope,policy,async()=>null];params[7]=request;
 params[41]=async args=>{
  const offset=args.cursor?Number(args.cursor.replace("demo-community:","")):0;
  if(!Number.isSafeInteger(offset)||offset<0||(args.cursor&&args.cursor!==`demo-community:${offset}`))throw Error("Invalid community fixture cursor");
  if(!args.tag||args.tag==="demo-unavailable")return {tag:null,items:[],cursor:args.cursor,nextCursor:null};
  const selected=args.tag==="demo-empty"?[]:ugcDemoItems;
  return {tag:{id:args.tag,name:"Everyday, considered."},items:selected.slice(offset,offset+args.limit),cursor:args.cursor,nextCursor:offset+args.limit<selected.length?`demo-community:${offset+args.limit}`:null};
 };
 return resolveCanonicalData(...params);
}
